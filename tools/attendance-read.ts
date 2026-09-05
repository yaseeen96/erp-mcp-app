import type { MCPServer } from "mcp-use";
import { z } from "zod";
import * as attendance from "../lib/attendance.js";
import { buildHistoryExcel, buildHistoryPdf } from "../lib/export-files.js";
import { storeExportFile } from "../lib/export-store.js";
import { loadHistoryPage } from "../lib/history-data.js";
import { loadProjects } from "../lib/projects.js";
import { resolveWorkLocationConfig } from "../lib/work-location.js";
import { ok } from "../lib/result.js";
import { frappeFailure } from "../lib/tool-utils.js";
import type { AttendanceCtx, FrappeUser } from "../lib/types.js";
import {
  summarizeAdditional,
  summarizeDay,
  summarizeEmployeeDay,
  summarizeHistory,
  summarizeManagement,
  summarizeRecurring,
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
  projectNames: z.array(z.string()),
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
  people: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string(),
      designation: z.string(),
      department: z.string(),
      status: z.string(),
      login: z.string(),
      logout: z.string(),
      hours: z.number(),
      done: z.number(),
      total: z.number(),
    })
  ),
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

const dayTopics = z
  .array(z.enum(["hours", "tasks"]))
  .optional()
  .describe("Omit for the full day UI. hours=time in/out. tasks=task mix and list.");

const todayTopics = z
  .array(z.enum(["hours", "tasks"]))
  .optional()
  .describe("Omit for the full today workspace. hours=login and mix. tasks=task chart and list.");

const teamTopics = z
  .array(z.enum(["presence", "hours", "people"]))
  .optional()
  .describe("Omit for the full team board. presence=who is in. hours=net hours. people=roster and day drill-in.");

const managementTopics = z
  .array(z.enum(["status", "departments", "rankings"]))
  .optional()
  .describe("Omit for the full HR board. status=company mix. departments=dept bars. rankings=hours table.");

const recurringTopics = z
  .array(z.enum(["status", "list"]))
  .optional()
  .describe("Omit for the full recurring UI. status=active mix. list=templates.");

const additionalTopics = z
  .array(z.enum(["hours", "entries"]))
  .optional()
  .describe("Omit for the full extra-work UI. hours=hours chart. entries=rows.");

const projectTopics = z
  .array(z.enum(["list", "tasks"]))
  .optional()
  .describe("Omit for the full projects UI. list=project names. tasks=today's tasks under each.");

const historyTopics = z
  .array(z.enum(["days", "hours", "tasks", "attendance"]))
  .optional()
  .describe("Omit for the full history UI. Same slices as export-history.");

const dayOutput = z.object({
  summary: z.string(),
  date: z.string(),
  employeeName: z.string(),
  login: z.string(),
  logout: z.string(),
  hours: z.number(),
  late: z.boolean(),
  taskCounts: z.object({
    total: z.number(),
    done: z.number(),
    pending: z.number(),
    inProgress: z.number(),
    rolled: z.number(),
    dropped: z.number(),
  }),
  statusChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  hoursChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  tasks: z.array(historyTask),
});

const employeeDayOutput = dayOutput.extend({
  employeeId: z.string(),
});

const recurringOutput = z.object({
  summary: z.string(),
  count: z.number(),
  active: z.number(),
  inactive: z.number(),
  statusChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  rows: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      project: z.string(),
      estimatedTime: z.string(),
      active: z.boolean(),
      days: z.array(z.string()),
    })
  ),
});

const projectOutput = z.object({
  summary: z.string(),
  date: z.string(),
  morningDone: z.boolean(),
  eodDone: z.boolean(),
  count: z.number(),
  projects: z.array(
    z.object({
      name: z.string(),
      todayCount: z.number(),
      done: z.number(),
      sources: z.array(z.string()),
      tasks: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          status: z.string(),
          estimate: z.string(),
          actualTime: z.string(),
        })
      ),
    })
  ),
});

const additionalOutput = z.object({
  summary: z.string(),
  totalHours: z.number(),
  hasMore: z.boolean(),
  hoursChart: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number()),
  }),
  entries: z.array(
    z.object({
      name: z.string(),
      date: z.string(),
      project: z.string(),
      hours: z.number(),
      hoursLabel: z.string(),
      description: z.string(),
      remarks: z.string(),
      status: z.string(),
    })
  ),
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
      description: "View helper: reload today's work log. Models must use show-today instead.",
      visibility: "app",
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
      description: "View helper: reload the team board. Models must use show-team-board instead.",
      visibility: "app",
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
      description: "View helper: reload the HR board. Models must use show-management-board instead.",
      visibility: "app",
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
      description: "View helper: one employee's day for board drill-in. Models must use show-employee-day instead.",
      visibility: "app",
      inputSchema: z.object({
        employeeName: z.string().describe("Employee ID, e.g. HR-EMP-00001"),
        date: z.string().optional().describe("Date YYYY-MM-DD. Defaults to today."),
      }),
      outputSchema: employeeDayOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, date }, ctx) => {
      try {
        const detail = await attendance.getEmployeeTaskDetail(
          ctx as AttendanceCtx,
          employeeName,
          date
        );
        const data = summarizeEmployeeDay(detail, employeeName);
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
      description: "View helper: reload history with task titles. Models must use show-history instead.",
      visibility: "app",
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

  const listProjects = server.tool(
    {
      name: "list-projects",
      title: "List projects",
      description: "View helper: reload projects. Models must use show-projects instead.",
      visibility: "app",
      inputSchema: z.object({}),
      outputSchema: projectOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const { page, data } = await loadProjects(ctx as AttendanceCtx);
        return ok(data.summary, data, { page });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const listRecurring = server.tool(
    {
      name: "list-recurring-tasks",
      title: "List recurring tasks",
      description: "View helper: reload recurring templates. Models must use show-recurring instead.",
      visibility: "app",
      inputSchema: z.object({}),
      outputSchema: recurringOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const rows = await attendance.getRecurringTasks(ctx as AttendanceCtx);
        const data = summarizeRecurring(rows);
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
      description: "View helper: reload additional work. Models must use show-additional-work instead.",
      visibility: "app",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0."),
      }),
      outputSchema: additionalOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page }, ctx) => {
      try {
        const result = await attendance.getAdditionalWork(ctx as AttendanceCtx, page ?? 0);
        const data = summarizeAdditional(result);
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
      description:
        "Today's status, tasks, projects, and check-in/EOD workspace. One call is enough — do not also call get-today or show-projects for today's work. Omit topics for the full workspace.",
      inputSchema: z.object({
        topics: todayTopics,
      }),
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
      description:
        "Team Leader board and direct-report roster (name, status, hours). One call is enough — do not also call get-team-dashboard. Omit topics for the full board.",
      inputSchema: dateInput.extend({
        topics: teamTopics,
      }),
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
      description:
        "HR company board. One call is enough — do not also call get-management-dashboard. Omit topics for the full board.",
      inputSchema: dateInput.extend({
        topics: managementTopics,
      }),
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
        "Recent personal attendance, including each day's task titles. Use this for 'past week', 'what did I work on', or a history UI. One call is enough — do not also call get-history or loop show-day. Omit topics for the full UI.",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0."),
        topics: historyTopics,
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
        const { history, data } = await loadHistoryPage(ctx as AttendanceCtx, page ?? 0);
        return ok(data.summary, data, { history });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showDay = server.tool(
    {
      name: "show-day",
      title: "Show day",
      description:
        "One personal date. Use this only when they name a single date. For a range or 'last week', call show-history once instead. Omit topics for the full day UI.",
      inputSchema: z.object({
        date: z.string().describe("Date YYYY-MM-DD"),
        topics: dayTopics,
      }),
      outputSchema: dayOutput,
      view: {
        name: "day",
        description: "Single-day attendance and task charts",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const detail = await attendance.getHistoryDayDetail(ctx as AttendanceCtx, date);
        const auth = (ctx as AttendanceCtx).auth?.user;
        const data = summarizeDay(detail, auth?.fullName || auth?.email || auth?.id || "Employee");
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showEmployeeDay = server.tool(
    {
      name: "show-employee-day",
      title: "Show employee day",
      description:
        "One team member's day. Team Leaders and HR only. One call is enough — do not also call get-employee-day. For the whole team, use show-team-board once instead of looping this.",
      inputSchema: z.object({
        employeeName: z.string().describe("Employee ID, e.g. HR-EMP-00001"),
        date: z.string().optional().describe("Date YYYY-MM-DD. Defaults to today."),
        topics: dayTopics,
      }),
      outputSchema: employeeDayOutput,
      view: {
        name: "employee-day",
        description: "Team member day attendance and task charts",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, date }, ctx) => {
      try {
        const detail = await attendance.getEmployeeTaskDetail(
          ctx as AttendanceCtx,
          employeeName,
          date
        );
        const data = summarizeEmployeeDay(detail, employeeName);
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showRecurring = server.tool(
    {
      name: "show-recurring",
      title: "Show recurring tasks",
      description:
        "Recurring templates. One call is enough — do not also call list-recurring-tasks. Omit topics for the full UI.",
      inputSchema: z.object({
        topics: recurringTopics,
      }),
      outputSchema: recurringOutput,
      view: {
        name: "recurring",
        description: "Recurring task templates",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const rows = await attendance.getRecurringTasks(ctx as AttendanceCtx);
        const data = summarizeRecurring(rows);
        return ok(data.summary, data, { rows });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showAdditionalWork = server.tool(
    {
      name: "show-additional-work",
      title: "Show additional work",
      description:
        "Additional work. One call is enough — do not also call list-additional-work. Omit topics for the full UI.",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0."),
        topics: additionalTopics,
      }),
      outputSchema: additionalOutput,
      view: {
        name: "additional-work",
        description: "Additional work hours and entries",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page }, ctx) => {
      try {
        const result = await attendance.getAdditionalWork(ctx as AttendanceCtx, page ?? 0);
        const data = summarizeAdditional(result);
        return ok(data.summary, data, { result });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showProjects = server.tool(
    {
      name: "show-projects",
      title: "Show projects",
      description:
        "All known project names (today, recurring, extra work). For today's projects only, show-today is enough. Do not also call list-projects. To create projects, call add-tasks once — not this tool.",
      inputSchema: z.object({
        topics: projectTopics,
      }),
      outputSchema: projectOutput,
      view: {
        name: "projects",
        description: "Projects and their tasks",
        prefersBorder: false,
        csp: viewCsp,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        const { page, data } = await loadProjects(ctx as AttendanceCtx);
        return ok(data.summary, data, { page });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const exportInput = z.object({
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
  });
  const exportOutput = z.object({
    summary: z.string(),
    files: z.array(
      z.object({
        name: z.string(),
        mimeType: z.string(),
        base64: z.string(),
        url: z.string(),
      })
    ),
  });

  async function runExport(
    format: "xlsx" | "pdf" | "both" | undefined,
    topics: Array<"days" | "hours" | "tasks" | "attendance"> | undefined,
    page: number | undefined,
    ctx: unknown
  ) {
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
          type: "text" as const,
          text: `Files are ready. ${files.map((file) => file.name).join(" and ")}.`,
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
  }

  const getExport = server.tool(
    {
      name: "get-export",
      title: "Get export files",
      description: "View helper: build Excel/PDF bytes. Models must use export-history instead.",
      visibility: "app",
      inputSchema: exportInput,
      outputSchema: exportOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ format, topics, page }, ctx) => {
      try {
        return await runExport(format, topics, page, ctx);
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
        "Download Excel and/or PDF. If they only want a file, call this once and do not also call show-history. Omit topics for the full report.",
      inputSchema: exportInput,
      outputSchema: exportOutput,
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
        return await runExport(format, topics, page, ctx);
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
    listProjects,
    listRecurring,
    listAdditional,
    getExport,
    exportHistory,
    showToday,
    showTeamBoard,
    showManagementBoard,
    showHistory,
    showDay,
    showEmployeeDay,
    showRecurring,
    showAdditionalWork,
    showProjects,
  };
}
