import type { MCPServer } from "mcp-use";
import { z } from "zod";
import * as attendance from "../lib/attendance.js";
import { buildHistoryExcel, buildHistoryPdf } from "../lib/export-files.js";
import { storeExportFile } from "../lib/export-store.js";
import { loadHistoryPage } from "../lib/history-data.js";
import { resolveWorkLocationConfig } from "../lib/work-location.js";
import { ok } from "../lib/result.js";
import { frappeFailure } from "../lib/tool-utils.js";
import type { AttendanceCtx, FrappeUser } from "../lib/types.js";
import {
  summarizeHistory,
  summarizeManagement,
  summarizeTeam,
  summarizeToday,
  tasksFromDetail,
} from "../lib/summaries.js";

const dateInput = z.object({
  date: z.string().optional().describe("Attendance date YYYY-MM-DD. Defaults to today."),
});

const todayOutput = z.object({
  summary: z.string(),
  date: z.string(),
  employeeName: z.string(),
  morningDone: z.boolean(),
  eodDone: z.boolean(),
  isTeamLeader: z.boolean(),
  loginTime: z.string(),
  leaveToday: z.string().optional(),
  hasResetToday: z.boolean(),
  taskCounts: z.object({
    total: z.number(),
    done: z.number(),
    pending: z.number(),
    carried: z.number(),
  }),
  chart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  workLocation: z.object({
    value: z.enum(["Office", "WFH", "Remote"]),
    options: z.array(z.enum(["Office", "WFH", "Remote"])),
    readonly: z.boolean(),
    note: z.string(),
  }),
});

const teamOutput = z.object({
  summary: z.string(),
  date: z.string(),
  kpis: z.object({
    total: z.number(),
    checkedIn: z.number(),
    late: z.number(),
    missing: z.number(),
    onLeave: z.number(),
    eodDone: z.number(),
  }),
  statusChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  hoursChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
});

const managementOutput = z.object({
  summary: z.string(),
  date: z.string(),
  kpis: z.object({
    total: z.number(),
    checkedIn: z.number(),
    eodDone: z.number(),
    onLeave: z.number(),
    missing: z.number(),
  }),
  standardWorkdayMinutes: z.number(),
  statusChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  departmentChart: z.object({
    labels: z.array(z.string()),
    checkedIn: z.array(z.number()),
    missing: z.array(z.number()),
    late: z.array(z.number()),
  }),
  rankingChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
});

const historyTask = z.object({
  description: z.string(),
  status: z.string(),
  project: z.string(),
  actualTime: z.string(),
});

const historyOutput = z.object({
  summary: z.string(),
  employeeName: z.string(),
  hasMore: z.boolean(),
  days: z.array(
    z.object({
      date: z.string(),
      hours: z.number(),
      login: z.string(),
      logout: z.string(),
      done: z.number(),
      total: z.number(),
      tasks: z.array(historyTask),
    })
  ),
  hoursChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  tasksChart: z.object({
    labels: z.array(z.string()),
    done: z.array(z.number()),
    total: z.array(z.number()),
  }),
});

const viewCsp = {
  resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
};

export function registerAttendanceReadTools(server: MCPServer<FrappeUser> | MCPServer) {
  const getToday = server.tool(
    {
      name: "get-today",
      title: "Get today",
      description: "Load the signed-in employee's Daily Work Log, tasks, shift, and leave for today.",
      inputSchema: z.object({}),
      outputSchema: todayOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const page = await attendance.getPageState(ctx as AttendanceCtx);
        const data = {
          ...summarizeToday(page),
          workLocation: await resolveWorkLocationConfig(ctx as AttendanceCtx, page),
        };
        return ok(data.summary, data, { page });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getTeamBoard = server.tool(
    {
      name: "get-team-dashboard",
      title: "Get team dashboard",
      description: "Team Leader view of direct reports for a date: presence, late, leave, hours, and tasks.",
      inputSchema: dateInput,
      outputSchema: teamOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getTeamDashboard(ctx as AttendanceCtx, date);
        const data = summarizeTeam(board);
        return ok(data.summary, data, { board });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getManagementBoard = server.tool(
    {
      name: "get-management-dashboard",
      title: "Get management dashboard",
      description: "HR Manager company-wide attendance for a date: department totals, rankings, and missing staff.",
      inputSchema: dateInput,
      outputSchema: managementOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getManagementDashboard(ctx as AttendanceCtx, date);
        const data = summarizeManagement(board);
        return ok(data.summary, data, { board });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getEmployeeDay = server.tool(
    {
      name: "get-employee-day",
      title: "Get employee day",
      description: "Full task and check-in detail for one employee on a date. HR or that employee's Team Leader only.",
      inputSchema: z.object({
        employeeName: z.string().describe("Employee ID, e.g. HR-EMP-00001"),
        date: z.string().optional().describe("Date YYYY-MM-DD. Defaults to today."),
      }),
      outputSchema: z.object({
        summary: z.string(),
        date: z.string(),
        employeeName: z.string(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, date }, ctx) => {
      try {
        const detail = await attendance.getEmployeeTaskDetail(
          ctx as AttendanceCtx,
          employeeName,
          date
        );
        const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
        const name =
          typeof detail.employee === "object" && detail.employee
            ? String((detail.employee as { employee_name?: string }).employee_name ?? employeeName)
            : employeeName;
        const data = {
          summary: `${name} on ${String(detail.date ?? date ?? "today")}: ${tasks.length} tasks.`,
          date: String(detail.date ?? date ?? ""),
          employeeName: name,
        };
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getHistory = server.tool(
    {
      name: "get-history",
      title: "Get my history",
      description:
        "One call for recent personal attendance. Page 0 is the last 15 days and already includes each day's task titles. Use this for 'past week' or 'what did I work on'. Do not call get-history-day in a loop.",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page of 15 days. Default 0 (most recent)."),
      }),
      outputSchema: historyOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page }, ctx) => {
      try {
        const { history, data } = await loadHistoryPage(ctx as AttendanceCtx, page ?? 0);
        return ok(data.summary, data, { history });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getHistoryDay = server.tool(
    {
      name: "get-history-day",
      title: "Get history day",
      description: "View helper: full task list for one past date. Models should use get-history instead.",
      visibility: "app",
      inputSchema: z.object({
        date: z.string().describe("Date YYYY-MM-DD"),
      }),
      outputSchema: z.object({
        summary: z.string(),
        date: z.string(),
        tasks: z.array(historyTask),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const detail = await attendance.getHistoryDayDetail(ctx as AttendanceCtx, date);
        const tasks = tasksFromDetail(detail);
        const data = {
          summary: `${date}: ${tasks.length} tasks.`,
          date,
          tasks,
        };
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const listRecurring = server.tool(
    {
      name: "list-recurring-tasks",
      title: "List recurring tasks",
      description: "List the signed-in employee's recurring task templates.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        summary: z.string(),
        count: z.number(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const rows = await attendance.getRecurringTasks(ctx as AttendanceCtx);
        const data = {
          summary: `${rows.length} recurring task templates.`,
          count: rows.length,
        };
        return ok(data.summary, data, { rows });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const listAdditional = server.tool(
    {
      name: "list-additional-work",
      title: "List additional work",
      description: "Paginated additional-work entries for the signed-in employee.",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0."),
      }),
      outputSchema: z.object({
        summary: z.string(),
        totalHours: z.number(),
        hasMore: z.boolean(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page }, ctx) => {
      try {
        const result = await attendance.getAdditionalWork(ctx as AttendanceCtx, page ?? 0);
        const entries = Array.isArray(result.entries) ? result.entries : [];
        const totalHours = typeof result.total_hours === "number" ? result.total_hours : 0;
        const data = {
          summary: `${entries.length} additional-work rows, ${totalHours}h on this page.`,
          totalHours,
          hasMore: Boolean(result.has_more),
        };
        return ok(data.summary, data, { result });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showToday = server.tool(
    {
      name: "show-today",
      title: "Show today",
      description: "Open the interactive today card: check-in, EOD, tasks, and today's chart.",
      inputSchema: z.object({}),
      outputSchema: todayOutput,
      view: {
        name: "today",
        description: "Daily check-in and end-of-day workspace",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const page = await attendance.getPageState(ctx as AttendanceCtx);
        const data = {
          ...summarizeToday(page),
          workLocation: await resolveWorkLocationConfig(ctx as AttendanceCtx, page),
        };
        return ok(data.summary, data, { page });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showTeamBoard = server.tool(
    {
      name: "show-team-board",
      title: "Show team board",
      description: "Open the team attendance board with KPIs and charts. Team Leaders only.",
      inputSchema: dateInput,
      outputSchema: teamOutput,
      view: {
        name: "team-board",
        description: "Team attendance board with charts",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getTeamDashboard(ctx as AttendanceCtx, date);
        const data = summarizeTeam(board);
        return ok(data.summary, data, { board });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showManagementBoard = server.tool(
    {
      name: "show-management-board",
      title: "Show management board",
      description: "Open the HR management dashboard with department charts and hour rankings.",
      inputSchema: dateInput,
      outputSchema: managementOutput,
      view: {
        name: "management-board",
        description: "Company attendance dashboard with charts",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getManagementDashboard(ctx as AttendanceCtx, date);
        const data = summarizeManagement(board);
        return ok(data.summary, data, { board });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showHistory = server.tool(
    {
      name: "show-history",
      title: "Show history",
      description:
        "Open the history board (charts). For a text answer about recent work, call get-history once instead.",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0."),
      }),
      outputSchema: historyOutput,
      view: {
        name: "history",
        description: "Personal attendance history and trends",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page }, ctx) => {
      try {
        const history = await attendance.getMyHistory(ctx as AttendanceCtx, page ?? 0);
        const data = summarizeHistory(history);
        return ok(data.summary, data, { history });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const exportHistory = server.tool(
    {
      name: "export-history",
      title: "Export history",
      description:
        "Download personal attendance history as Excel (.xlsx) and/or PDF. Both files use the same topics. If the user only asks for a PDF or Excel with no focus, omit topics for the full report. If they ask for only one slice (days worked, hours, tasks, in/out), set topics to that slice. Do not paste CSV.",
      inputSchema: z.object({
        format: z
          .enum(["xlsx", "pdf", "both"])
          .optional()
          .describe("File type. Default both."),
        topics: z
          .array(z.enum(["days", "hours", "tasks", "attendance"]))
          .optional()
          .describe(
            "Omit for the full branded report. days=how many days worked. hours=hours and time. tasks=what they worked on. attendance=daily in/out table."
          ),
        page: z.number().int().min(0).optional().describe("0-based history page. Default 0."),
      }),
      outputSchema: z.object({
        summary: z.string(),
        files: z.array(
          z.object({
            name: z.string(),
            mimeType: z.string(),
            base64: z.string(),
            url: z.string(),
          })
        ),
      }),
      view: {
        name: "export-history",
        description: "Download Excel and PDF attendance files",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ format, topics, page }, ctx) => {
      try {
        const { data } = await loadHistoryPage(ctx as AttendanceCtx, page ?? 0);
        const wanted = format ?? "both";
        const built = await Promise.all([
          ...(wanted === "pdf" ? [] : [buildHistoryExcel(data.employeeName, data.days, topics)]),
          ...(wanted === "xlsx" ? [] : [buildHistoryPdf(data.employeeName, data.days, topics)]),
        ]);
        const files = built.map(storeExportFile);
        return {
          content: [
            {
              type: "text",
              text: `Files are in the download card below. Click Download PDF or Download Excel. ${files.map((file) => file.name).join(" and ")}.`,
            },
            ...files.map((file) => ({
              type: "resource" as const,
              resource: {
                uri: `attendance://export/${file.name}`,
                mimeType: file.mimeType,
                blob: file.base64,
              },
            })),
          ],
          structuredContent: {
            summary: `Exported ${files.map((file) => file.name).join(" and ")} for ${data.employeeName}${topics?.length ? ` (${topics.join(", ")})` : ""}.`,
            files,
          },
        };
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  return {
    getToday,
    getTeamBoard,
    getManagementBoard,
    getEmployeeDay,
    getHistory,
    getHistoryDay,
    listRecurring,
    listAdditional,
    exportHistory,
    showToday,
    showTeamBoard,
    showManagementBoard,
    showHistory,
  };
}
