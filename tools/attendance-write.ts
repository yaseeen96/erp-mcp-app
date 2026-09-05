import type { MCPServer } from "mcp-use";
import { z } from "zod";
import * as attendance from "../lib/attendance.js";
import { ok } from "../lib/result.js";
import { frappeFailure } from "../lib/tool-utils.js";
import type { AttendanceCtx, FrappeUser } from "../lib/types.js";

const plannedTask = z.object({
  description: z.string().describe("Task description"),
  estimated_time: z.string().optional().describe("Estimate such as 2h 30m"),
  project_name: z.string().optional().describe("Optional project name"),
});

const carriedUpdate = z.object({
  name: z.string().describe("Task Entry name"),
  description: z.string().optional(),
  estimated_time: z.string().optional(),
  project_name: z.string().optional(),
});

const eodUpdate = z.object({
  name: z.string().describe("Task Entry name"),
  status: z.enum(["Pending", "In Progress", "Done", "Dropped"]).optional(),
  actual_time: z.string().optional().describe("Time taken, e.g. 1h 15m"),
  remarks: z.string().optional(),
  description: z.string().optional(),
  carry_forward: z
    .boolean()
    .optional()
    .describe("Set false to drop an unfinished task instead of rolling it over"),
});

const adhocTask = z.object({
  description: z.string(),
  status: z.enum(["Pending", "In Progress", "Done"]).optional(),
  estimated_time: z.string().optional(),
  actual_time: z.string().optional(),
  remarks: z.string().optional(),
  project_name: z.string().optional(),
});

const confirmSchema = z.object({
  confirm: z
    .literal(true)
    .describe("Must be true. This action cannot be undone from the MCP server."),
});

export function registerAttendanceWriteTools(server: MCPServer<FrappeUser> | MCPServer) {
  const checkIn = server.tool(
    {
      name: "check-in",
      title: "Check in",
      description:
        "Submit morning check-in for the signed-in employee. Creates today's Daily Work Log, planned tasks, and an Employee Checkin IN punch. WFH requires an Attendance Request except Saturday/hybrid routine days.",
      inputSchema: z.object({
        new_tasks: z.array(plannedTask).describe("New planned tasks. Can be empty if carried tasks already exist."),
        login_time: z.string().optional().describe("Optional HH:MM or HH:MM:SS login override"),
        carried_updates: z.array(carriedUpdate).optional().describe("Edits to carried-forward tasks"),
        work_location: z.enum(["Office", "WFH", "Remote"]).optional().describe("Defaults to Office"),
        half_day_session: z
          .enum(["First Half", "Second Half"])
          .optional()
          .describe("Only kept when the employee has approved half-day leave today"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        loginTime: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const result = await attendance.submitMorningLog(ctx as AttendanceCtx, args);
        const loginTime = typeof result.login_time === "string" ? result.login_time : undefined;
        return ok(`Checked in${loginTime ? ` at ${loginTime}` : ""}.`, {
          success: true,
          loginTime,
        });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const checkOut = server.tool(
    {
      name: "check-out",
      title: "Check out",
      description:
        "Submit end of day: lunch window, task status/hours, optional ad-hoc tasks, Employee Checkin OUT punch, and rollover of unfinished tasks.",
      inputSchema: z.object({
        lunch_from: z.string().describe("Lunch start time, e.g. 13:00"),
        lunch_to: z.string().describe("Lunch end time, e.g. 13:30"),
        logout_time: z
          .string()
          .optional()
          .describe("Ignored in production; ERPNext uses the current time. Required only in tests."),
        task_updates: z.array(eodUpdate).describe("Status and actual time for existing tasks"),
        adhoc_tasks: z.array(adhocTask).optional().describe("Tasks discovered during the day"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        netHours: z.string().optional(),
        logoutTime: z.string().optional(),
        pendingCount: z.number().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const result = await attendance.submitEodLog(ctx as AttendanceCtx, {
          lunch_from: args.lunch_from,
          lunch_to: args.lunch_to,
          logout_time: args.logout_time ?? "",
          task_updates: args.task_updates,
          adhoc_tasks: args.adhoc_tasks ?? [],
        });
        const netHours = typeof result.net_hours === "string" ? result.net_hours : undefined;
        const logoutTime = typeof result.logout_time === "string" ? result.logout_time : undefined;
        const pendingCount = typeof result.pending_count === "number" ? result.pending_count : undefined;
        return ok(
          `Checked out${logoutTime ? ` at ${logoutTime}` : ""}${netHours ? `. Net ${netHours}` : ""}.`,
          { success: true, netHours, logoutTime, pendingCount }
        );
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const resetCheckin = server.tool(
    {
      name: "reset-checkin",
      title: "Reset check-in",
      description:
        "Reset today's morning check-in before EOD. Deletes the ST Daily Checkin IN punch and unlocks the log. Requires confirm=true.",
      inputSchema: confirmSchema,
      outputSchema: z.object({ success: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        await attendance.resetMorningCheckin(ctx as AttendanceCtx);
        return ok("Morning check-in was reset.", { success: true });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const updateHalfDay = server.tool(
    {
      name: "update-half-day",
      title: "Update half-day session",
      description: "Set or change the half-day session on an already submitted morning check-in.",
      inputSchema: z.object({
        session: z.enum(["First Half", "Second Half"]).describe("Half-day session"),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ session }, ctx) => {
      try {
        await attendance.updateHalfDaySession(ctx as AttendanceCtx, session);
        return ok(`Half-day session set to ${session}.`, { success: true });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const saveRecurring = server.tool(
    {
      name: "save-recurring-task",
      title: "Save recurring task",
      description: "Create or update a recurring task template for the signed-in employee.",
      inputSchema: z.object({
        name: z.string().optional().describe("Existing template name to update"),
        description: z.string().describe("Task description"),
        project_name: z.string().optional(),
        estimated_time: z.string().optional(),
        recurring_days: z
          .array(z.string())
          .optional()
          .describe("Day names, e.g. Monday, Wednesday"),
        is_active: z.boolean().optional(),
      }),
      outputSchema: z.object({ success: z.boolean(), name: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const result = await attendance.saveRecurringTask(ctx as AttendanceCtx, {
          ...args,
          is_active: args.is_active === false ? 0 : 1,
        });
        const name = typeof result.name === "string" ? result.name : undefined;
        return ok(`Saved recurring task${name ? ` ${name}` : ""}.`, { success: true, name });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const deleteRecurring = server.tool(
    {
      name: "delete-recurring-task",
      title: "Delete recurring task",
      description: "Delete one of the signed-in employee's recurring task templates. Requires confirm=true.",
      inputSchema: confirmSchema.extend({
        name: z.string().describe("Recurring Task Template name"),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ name }, ctx) => {
      try {
        await attendance.deleteRecurringTask(ctx as AttendanceCtx, name);
        return ok(`Deleted recurring task ${name}.`, { success: true });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const saveAdditional = server.tool(
    {
      name: "save-additional-work",
      title: "Save additional work",
      description: "Create or update an Additional Work entry for the signed-in employee.",
      inputSchema: z.object({
        name: z.string().optional(),
        work_date: z.string().describe("Work date YYYY-MM-DD"),
        description: z.string(),
        project_name: z.string().optional(),
        hours_spent: z.string().optional().describe("e.g. 1h 30m"),
        remarks: z.string().optional(),
        login_time: z.string().optional(),
        logout_time: z.string().optional(),
        status: z.string().optional(),
      }),
      outputSchema: z.object({ success: z.boolean(), name: z.string().optional() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const result = await attendance.saveAdditionalWork(ctx as AttendanceCtx, args);
        const name = typeof result.name === "string" ? result.name : undefined;
        return ok(`Saved additional work${name ? ` ${name}` : ""}.`, { success: true, name });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const deleteAdditional = server.tool(
    {
      name: "delete-additional-work",
      title: "Delete additional work",
      description: "Delete an Additional Work entry. Requires confirm=true.",
      inputSchema: confirmSchema.extend({
        name: z.string().describe("Additional Work name"),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ name }, ctx) => {
      try {
        await attendance.deleteAdditionalWork(ctx as AttendanceCtx, name);
        return ok(`Deleted additional work ${name}.`, { success: true });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const deleteCarried = server.tool(
    {
      name: "delete-carried-task",
      title: "Delete carried task",
      description: "Delete a carried Task Entry from today's log before EOD. Requires confirm=true.",
      inputSchema: confirmSchema.extend({
        name: z.string().describe("Task Entry name"),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ name }, ctx) => {
      try {
        await attendance.deleteCarriedTask(ctx as AttendanceCtx, name);
        return ok(`Deleted carried task ${name}.`, { success: true });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  return {
    checkIn,
    checkOut,
    resetCheckin,
    updateHalfDay,
    saveRecurring,
    deleteRecurring,
    saveAdditional,
    deleteAdditional,
    deleteCarried,
  };
}
