import type { MCPServer } from "mcp-use";
import { z } from "zod";
import * as attendance from "../lib/attendance.js";
import { fail, ok } from "../lib/result.js";
import { stringValue } from "../lib/summaries.js";
import {
  addDrafts,
  attendanceDate,
  listDrafts,
  mergePlannedTasks,
  plannedSnapshot,
  projectNamesFromDrafts,
  takeDrafts,
} from "../lib/task-drafts.js";
import { usage } from "../lib/tool-docs.js";
import { frappeFailure } from "../lib/tool-utils.js";
import type { AttendanceCtx, FrappeUser } from "../lib/types.js";

const plannedTask = z.object({
  description: z.string().describe("Task description"),
  estimated_time: z.string().optional().describe("Estimate such as 2h 30m"),
  project_name: z.string().optional().describe("Optional project name"),
});

const projectGroup = z.object({
  name: z.string().describe("Project name"),
  tasks: z
    .array(
      z.object({
        description: z.string().describe("Task description"),
        estimated_time: z.string().optional().describe("Estimate such as 2h 30m"),
      })
    )
    .min(1)
    .describe("Tasks under this project"),
});

type ProjectGroup = z.infer<typeof projectGroup>;
type PlannedTask = z.infer<typeof plannedTask>;

function flattenProjectsAndTasks(args: {
  projects?: ProjectGroup[];
  tasks?: PlannedTask[];
  project_name?: string;
}): attendance.PlannedTaskInput[] {
  const fromProjects = (args.projects ?? []).flatMap((project) => {
    const projectName = project.name.trim();
    return project.tasks
      .filter((task) => task.description.trim())
      .map((task) => ({
        description: task.description.trim(),
        estimated_time: task.estimated_time?.trim() || undefined,
        project_name: projectName || undefined,
      }));
  });
  const fallbackProject = args.project_name?.trim() || undefined;
  const fromTasks = (args.tasks ?? [])
    .filter((task) => task.description.trim())
    .map((task) => ({
      description: task.description.trim(),
      estimated_time: task.estimated_time?.trim() || undefined,
      project_name: task.project_name?.trim() || fallbackProject,
    }));
  return [...fromProjects, ...fromTasks];
}

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
      name: "check_in",
      title: "Check in",
      description: usage(
        "Punch in for today.",
        [
          "CRITICAL: Call this immediately when they say check in, start the day, or punch in. Planning is optional.",
          "MUST pass any projects/tasks they named in this same call.",
          "IMPORTANT: Also includes work already saved with add_tasks. Do not also call add_tasks.",
          "WFH needs an Attendance Request except Saturday/hybrid routine days.",
        ]
      ),
      inputSchema: z.object({
        projects: z
          .array(projectGroup)
          .optional()
          .describe("Several projects in this one call. Each has a name and its tasks."),
        new_tasks: z
          .array(plannedTask)
          .optional()
          .describe("Flat task list. Use project_name on each row, or use projects instead."),
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
        const attendanceCtx = ctx as AttendanceCtx;
        const page = await attendance.getPageState(attendanceCtx);
        if (page.eod_done === true || page.eod_done === 1) {
          return fail("Already checked out today.");
        }
        if (page.morning_done === true || page.morning_done === 1) {
          return fail("Already checked in. Add more work with add_tasks (saved for check_out) or call check_out.");
        }
        const date = attendanceDate(stringValue(page.date));
        const staged = listDrafts(attendanceCtx, date, "morning");
        const new_tasks = mergePlannedTasks(
          staged,
          flattenProjectsAndTasks({
            projects: args.projects,
            tasks: args.new_tasks,
          })
        );
        const result = await attendance.submitMorningLog(attendanceCtx, {
          ...args,
          new_tasks,
        });
        takeDrafts(attendanceCtx, date, "morning");
        const loginTime = typeof result.login_time === "string" ? result.login_time : undefined;
        const names = projectNamesFromDrafts(new_tasks);
        return ok(
          `Checked in${loginTime ? ` at ${loginTime}` : ""} with ${new_tasks.length} task${new_tasks.length === 1 ? "" : "s"}${names.length ? ` across ${names.length} project${names.length === 1 ? "" : "s"} (${names.join(", ")})` : ""}.`,
          {
            success: true,
            loginTime,
          }
        );
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const checkOut = server.tool(
    {
      name: "check_out",
      title: "Check out",
      description: usage(
        "Finish the day: lunch, task updates, and any extra projects/tasks.",
        [
          "CRITICAL: Call this when they say check out or finish the day.",
          "MUST include extras already saved with add_tasks after check_in in this one call.",
          "MUST NOT also call add_tasks.",
        ]
      ),
      inputSchema: z.object({
        lunch_from: z.string().describe("Lunch start time, e.g. 13:00"),
        lunch_to: z.string().describe("Lunch end time, e.g. 13:30"),
        logout_time: z
          .string()
          .optional()
          .describe("Ignored in production; ERPNext uses the current time. Required only in tests."),
        task_updates: z.array(eodUpdate).describe("Status and actual time for existing tasks"),
        projects: z
          .array(projectGroup)
          .optional()
          .describe("Extra projects found during the day. Each has a name and its tasks. One call."),
        adhoc_tasks: z
          .array(adhocTask)
          .optional()
          .describe("Flat extra tasks. Prefer projects when adding more than one project."),
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
        const attendanceCtx = ctx as AttendanceCtx;
        const page = await attendance.getPageState(attendanceCtx);
        const date = attendanceDate(stringValue(page.date));
        const staged = listDrafts(attendanceCtx, date, "eod");
        const adhoc_tasks = mergePlannedTasks(staged, [
          ...flattenProjectsAndTasks({ projects: args.projects }),
          ...(args.adhoc_tasks ?? []),
        ]);
        const result = await attendance.submitEodLog(attendanceCtx, {
          lunch_from: args.lunch_from,
          lunch_to: args.lunch_to,
          logout_time: args.logout_time ?? "",
          task_updates: args.task_updates,
          adhoc_tasks,
        });
        takeDrafts(attendanceCtx, date, "eod");
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
      name: "reset_checkin",
      title: "Reset check-in",
      description: usage(
        "Reset today's morning check-in before EOD. Deletes the ST Daily Checkin IN punch and unlocks the log.",
        ["CRITICAL: Requires confirm=true. This cannot be undone from the MCP server."]
      ),
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
      name: "update_half_day",
      title: "Update half-day session",
      description: usage("Set or change the half-day session on an already submitted morning check-in.", [
        "MUST pass session as First Half or Second Half.",
      ]),
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
      name: "save_recurring_task",
      title: "Save recurring task",
      description: usage("Create or update a recurring task template for the signed-in employee.", [
        "IMPORTANT: Use show_recurring first if they asked to see templates.",
      ]),
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
      name: "delete_recurring_task",
      title: "Delete recurring task",
      description: usage("Delete one of the signed-in employee's recurring task templates.", [
        "CRITICAL: Requires confirm=true.",
      ]),
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
      name: "save_additional_work",
      title: "Save additional work",
      description: usage("Create or update an Additional Work entry for the signed-in employee.", [
        "IMPORTANT: Use show_additional_work first if they asked to see extra hours.",
      ]),
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
      name: "delete_additional_work",
      title: "Delete additional work",
      description: usage("Delete an Additional Work entry.", ["CRITICAL: Requires confirm=true."]),
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

  const addTasks = server.tool(
    {
      name: "add_tasks",
      title: "Add tasks",
      description: usage(
        "Save one or many projects and their tasks without punching in.",
        [
          "CRITICAL: This does not check them in. MUST call add_tasks when they asked to plan or add tasks only.",
          "MUST search and talk through a real task list when they asked you to research a product — not a placeholder.",
          "When they later say check in, MUST call check_in — not this tool.",
          "Multiple calls merge. If already checked in, these wait for check_out.",
        ]
      ),
      inputSchema: z.object({
        projects: z
          .array(projectGroup)
          .optional()
          .describe("Several projects in this one call. Each has a name and at least one task."),
        project_name: z
          .string()
          .optional()
          .describe("Fallback project for the flat tasks list when a task has no project_name."),
        tasks: z
          .array(plannedTask)
          .optional()
          .describe("Flat task list. Use projects when creating more than one project."),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        checkedIn: z.boolean(),
        count: z.number(),
        projectCount: z.number(),
        projectNames: z.array(z.string()),
        projectName: z.string().optional(),
        queuedFor: z.enum(["check_in", "check_out"]),
        tasks: z.array(
          z.object({
            description: z.string(),
            estimated_time: z.string().optional(),
            project_name: z.string().optional(),
          })
        ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      try {
        const attendanceCtx = ctx as AttendanceCtx;
        const page = await attendance.getPageState(attendanceCtx);
        const incoming = flattenProjectsAndTasks(args);
        if (incoming.length === 0) {
          return fail("Add at least one task, either under projects or in tasks.");
        }
        if (page.eod_done === true || page.eod_done === 1) {
          return fail("Already checked out today. Extra work goes in save_additional_work or tomorrow's check_in.");
        }
        const date = attendanceDate(stringValue(page.date));
        const queuedFor: "check_in" | "check_out" =
          page.morning_done === true || page.morning_done === 1 ? "check_out" : "check_in";
        const staged = addDrafts(attendanceCtx, date, queuedFor === "check_out" ? "eod" : "morning", incoming);
        const snapshot = plannedSnapshot(staged);
        const data = {
          success: true,
          checkedIn: false,
          count: snapshot.count,
          projectCount: snapshot.projectNames.length,
          projectNames: snapshot.projectNames,
          projectName: snapshot.projectNames.length === 1 ? snapshot.projectNames[0] : undefined,
          queuedFor,
          tasks: snapshot.tasks,
        };
        return ok(
          `Saved ${incoming.length} task${incoming.length === 1 ? "" : "s"} for ${snapshot.projectNames.length || 0} project${
            snapshot.projectNames.length === 1 ? "" : "s"
          }${snapshot.projectNames.length ? ` (${snapshot.projectNames.join(", ")})` : ""}. ${
            queuedFor === "check_in"
              ? "Not checked in. Call check_in when they ask to start the day."
              : "Already checked in — these go out with check_out."
          }`,
          data
        );
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const deleteCarried = server.tool(
    {
      name: "delete_carried_task",
      title: "Delete carried task",
      description: usage("Delete a carried Task Entry from today's log before EOD.", [
        "CRITICAL: Requires confirm=true.",
      ]),
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
    addTasks,
    deleteCarried,
  };
}
