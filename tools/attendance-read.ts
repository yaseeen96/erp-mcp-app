import type { MCPServer } from "mcp-use";
import { z } from "zod";
import * as attendance from "../lib/attendance.js";
import { buildHistoryExcel, buildHistoryPdf } from "../lib/export-files.js";
import { storeExportFile } from "../lib/export-store.js";
import { formatSpokenDate, hasDateFilter, resolveSingleDate } from "../lib/calendar.js";
import { loadEmployeeHistory, resolveEmployee } from "../lib/employee-range.js";
import { loadHistoryExport, loadHistoryPage, loadHistoryRange } from "../lib/history-data.js";
import { loadProjects } from "../lib/projects.js";
import { resolveWorkLocationConfig } from "../lib/work-location.js";
import { ok } from "../lib/result.js";
import { attendanceDate, listDrafts, plannedSnapshot } from "../lib/task-drafts.js";
import { EMPLOYEE_NAME_FIELD, WHEN_FIELD, usage } from "../lib/tool-docs.js";
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
  summarizeTeammates,
  stringValue,
  summarizeToday,
  tasksFromDetail,
} from "../lib/summaries.js";

const dateInput = z.object({
  date: z.string().optional().describe("Attendance date YYYY-MM-DD. Defaults to today."),
});

const calendarOutput = z.object({
  today: z.string(),
  weekday: z.string(),
  weekdayLong: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  month: z.string(),
  monthStart: z.string(),
  monthEnd: z.string(),
  timezone: z.string(),
});

const whenInput = z.string().optional().describe(WHEN_FIELD);

const periodInput = z
  .enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"])
  .optional()
  .describe("Only if they used these exact words. Prefer when.");

const monthInput = z
  .string()
  .optional()
  .describe("Calendar month YYYY-MM, e.g. 2026-08 for August. Prefer when='August'.");

const dateFilterFields = {
  when: whenInput,
  date: z.string().optional().describe("One day YYYY-MM-DD only if they already gave ISO."),
  month: monthInput,
  period: periodInput,
  from: z.string().optional().describe("Range start YYYY-MM-DD. Use with to. Prefer when."),
  to: z.string().optional().describe("Range end YYYY-MM-DD. Use with from. Prefer when."),
};

const todayOutput = z.object({
  summary: z.string(),
  date: z.string(),
  weekday: z.string(),
  calendar: calendarOutput,
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
  planned: z.object({
    count: z.number(),
    projectNames: z.array(z.string()),
    tasks: z.array(
      z.object({
        description: z.string(),
        estimated_time: z.string().optional(),
        project_name: z.string().optional(),
      })
    ),
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
  names: z.array(z.string()),
});

const teammatesOutput = z.object({
  summary: z.string(),
  date: z.string(),
  names: z.array(z.string()),
  teammates: z.array(
    z.object({
      name: z.string(),
      employeeId: z.string(),
      designation: z.string(),
      department: z.string(),
      status: z.string(),
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
  .describe("Omit for the full history UI. Same slices as export_history.");

const dayOutput = z.object({
  summary: z.string(),
  date: z.string(),
  weekday: z.string(),
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

const historyDay = z.object({
  date: z.string(),
  weekday: z.string(),
  hours: z.number(),
  login: z.string(),
  logout: z.string(),
  done: z.number(),
  total: z.number(),
  tasks: z.array(historyTask),
  attended: z.boolean().optional(),
});

const historyOutput = z.object({
  summary: z.string(),
  employeeName: z.string(),
  hasMore: z.boolean(),
  from: z.string().optional(),
  to: z.string().optional(),
  period: z.string().optional(),
  attendedDays: z.number().optional(),
  calendar: calendarOutput.optional(),
  days: z.array(historyDay),
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

const employeeHistoryOutput = historyOutput.extend({
  employeeId: z.string(),
  from: z.string(),
  to: z.string(),
  period: z.string(),
  attendedDays: z.number(),
  projectNames: z.array(z.string()),
  calendar: calendarOutput,
  days: z.array(
    historyDay.extend({
      attended: z.boolean(),
      status: z.enum(["checked_out", "checked_in", "absent"]),
    })
  ),
});

const viewCsp = {
  resourceDomains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
};

async function loadToday(ctx: AttendanceCtx) {
  const page = await attendance.getPageState(ctx);
  const planned = plannedSnapshot(listDrafts(ctx, attendanceDate(stringValue(page.date))));
  const data = {
    ...summarizeToday(page),
    workLocation: await resolveWorkLocationConfig(ctx, page),
    planned,
  };
  if (!data.morningDone && planned.count) {
    data.summary = `${data.summary} · ${planned.count} planned`;
  }
  return ok(data.summary, data, { page });
}

export function registerAttendanceReadTools(server: MCPServer<FrappeUser> | MCPServer) {
  const getToday = server.tool(
    {
      name: "get_today",
      title: "Get today",
      description: "View helper: reload today's work log. Models MUST use show_today instead.",
      visibility: "app",
      inputSchema: z.object({}),
      outputSchema: todayOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (_args, ctx) => {
      try {
        return await loadToday(ctx as AttendanceCtx);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getTeamBoard = server.tool(
    {
      name: "get_team_dashboard",
      title: "Get team dashboard",
      description: "View helper: reload the team board. Models MUST use show_team_board instead.",
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

  const getTeammates = server.tool(
    {
      name: "get_teammates",
      title: "Get teammates",
      description: "View helper: reload teammate names. Models MUST use list_teammates instead.",
      visibility: "app",
      inputSchema: dateInput,
      outputSchema: teammatesOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getTeamDashboard(ctx as AttendanceCtx, date);
        const data = summarizeTeammates(board);
        return ok(data.summary, data);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getManagementBoard = server.tool(
    {
      name: "get_management_dashboard",
      title: "Get management dashboard",
      description: "View helper: reload the HR board. Models MUST use show_management_board instead.",
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
      name: "get_employee_day",
      title: "Get employee day",
      description: "View helper: one employee's day for board drill-in. Models MUST use show_employee_day instead.",
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
        const employee = await resolveEmployee(ctx as AttendanceCtx, employeeName);
        const detail = await attendance.getEmployeeTaskDetail(
          ctx as AttendanceCtx,
          employee.employeeId,
          date
        );
        const data = summarizeEmployeeDay(detail, employee.name);
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getEmployeeHistory = server.tool(
    {
      name: "get_employee_history",
      title: "Get employee history",
      description: "View helper: teammate week/range. Models MUST use show_employee_history instead.",
      visibility: "app",
      inputSchema: z.object({
        employeeName: z.string().describe(EMPLOYEE_NAME_FIELD),
        ...dateFilterFields,
      }),
      outputSchema: employeeHistoryOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, when, date, month, period, from, to }, ctx) => {
      try {
        const data = await loadEmployeeHistory(ctx as AttendanceCtx, {
          employeeName,
          when,
          date,
          month,
          period,
          from,
          to,
        });
        return ok(data.summary, data);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getHistory = server.tool(
    {
      name: "get_history",
      title: "Get my history",
      description: "View helper: reload history with task titles. Models MUST use show_history instead.",
      visibility: "app",
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page of 15 days. Default 0. Ignored when a date filter is set."),
        ...dateFilterFields,
      }),
      outputSchema: historyOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page, when, date, month, period, from, to }, ctx) => {
      try {
        const filter = { when, date, month, period, from, to };
        if (hasDateFilter(filter)) {
          const { data } = await loadHistoryRange(ctx as AttendanceCtx, filter);
          return ok(data.summary, data);
        }
        const { history, data } = await loadHistoryPage(ctx as AttendanceCtx, page ?? 0);
        return ok(data.summary, data, { history });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const getHistoryDay = server.tool(
    {
      name: "get_history_day",
      title: "Get history day",
      description: "View helper: full task list for one past date. Models should use get_history instead.",
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
      name: "list_projects",
      title: "List projects",
      description: "View helper: reload projects. Models MUST use show_projects instead.",
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
      name: "list_recurring_tasks",
      title: "List recurring tasks",
      description: "View helper: reload recurring templates. Models MUST use show_recurring instead.",
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
      name: "list_additional_work",
      title: "List additional work",
      description: "View helper: reload additional work. Models MUST use show_additional_work instead.",
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
      name: "show_today",
      title: "Show today",
      description: usage(
        "Today's attendance status in Asia/Kolkata, with weekday and this week's Monday–Sunday bounds.",
        [
          "CRITICAL: Call once when they ask about today or whether they are checked in.",
          "MUST NOT add tasks or check in. This is read-only.",
          "MUST NOT also call get_today or show_projects.",
          "IMPORTANT: A View is OK here for the check-in / EOD form.",
        ]
      ),
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
        return await loadToday(ctx as AttendanceCtx);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showTeamBoard = server.tool(
    {
      name: "show_team_board",
      title: "Show team board",
      description: usage(
        "Whole-team roster: who is in, late, or missing, by name.",
        [
          "CRITICAL: Read content aloud. It lists every teammate. MUST NOT invent names or hours.",
          "MUST call this when they ask how the team is doing.",
          "MUST NOT use this for one named person — that is show_employee_day or show_employee_history.",
          "For names only, use list_teammates. MUST NOT also call get_team_dashboard.",
          "IMPORTANT: No View. Voice and chat use the text result only.",
        ]
      ),
      inputSchema: dateInput.extend({
        topics: teamTopics,
      }),
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

  const listTeammates = server.tool(
    {
      name: "list_teammates",
      title: "List teammates",
      description: usage(
        "Names of people on your team.",
        [
          "CRITICAL: Call once when they ask who is on my team or teammate names.",
          "MUST speak every name from content. Do not skip names or say check the board.",
          "IMPORTANT: Also advertised as resource://teammates. Then use show_employee_day with that name.",
          "No View. Voice and chat use the text result only.",
        ]
      ),
      inputSchema: dateInput,
      outputSchema: teammatesOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date }, ctx) => {
      try {
        const board = await attendance.getTeamDashboard(ctx as AttendanceCtx, date);
        const data = summarizeTeammates(board);
        return ok(data.summary, data);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showManagementBoard = server.tool(
    {
      name: "show_management_board",
      title: "Show management board",
      description: usage(
        "HR company attendance board: departments and hours rankings.",
        [
          "CRITICAL: Read content aloud. MUST NOT invent department names or hours.",
          "MUST call once. Do not also call get_management_dashboard.",
          "IMPORTANT: No View. Voice and chat use the text result only.",
        ]
      ),
      inputSchema: dateInput.extend({
        topics: managementTopics,
      }),
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

  const showHistory = server.tool(
    {
      name: "show_history",
      title: "Show history",
      description: usage(
        "Your attendance for a day, week, or month in one call.",
        [
          "CRITICAL: Pass when= their date words unchanged. Trust returned weekdays. MUST NOT invent dates.",
          "MUST call once. Do not loop show_day.",
          "For a teammate use show_employee_history.",
          "IMPORTANT: No View. Voice and chat use the text result only.",
        ]
      ),
      inputSchema: z.object({
        page: z.number().int().min(0).optional().describe("0-based page. Default 0. Ignored when a date filter is set."),
        ...dateFilterFields,
        topics: historyTopics,
      }),
      outputSchema: historyOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ page, when, date, month, period, from, to }, ctx) => {
      try {
        const filter = { when, date, month, period, from, to };
        if (hasDateFilter(filter)) {
          const { data } = await loadHistoryRange(ctx as AttendanceCtx, filter);
          return ok(data.summary, data);
        }
        const { history, data } = await loadHistoryPage(ctx as AttendanceCtx, page ?? 0);
        return ok(data.summary, data, { history });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showDay = server.tool(
    {
      name: "show_day",
      title: "Show day",
      description: usage(
        "One personal date: hours, in/out, and tasks.",
        [
          "CRITICAL: Pass when= their words if they did not give ISO. Trust returned weekdays.",
          "MUST NOT call this once per day to build a week or month — use show_history once.",
          "Export is export_history.",
          "IMPORTANT: No View. Voice and chat use the text result only.",
        ]
      ),
      inputSchema: z.object({
        date: z.string().optional().describe("YYYY-MM-DD if they gave ISO."),
        when: whenInput,
        topics: dayTopics,
      }),
      outputSchema: dayOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ date, when }, ctx) => {
      try {
        const resolved = resolveSingleDate({ date, when });
        const detail = await attendance.getHistoryDayDetail(ctx as AttendanceCtx, resolved);
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
      name: "show_employee_day",
      title: "Show employee day",
      description: usage(
        "What a named teammate worked on for one day.",
        [
          "CRITICAL: Always call this. MUST NOT invent a permission error. MUST NOT use show_team_board for one person.",
          "MUST pass employeeName from resource://teammates or list_teammates, and when= their date words.",
          "Example: what did Maaz work on yesterday → employeeName=Maaz, when=yesterday.",
          "For a week, month, or how many days X attended: show_employee_history once.",
          "IMPORTANT: No View. Read content aloud — name, weekday, hours, tasks.",
        ]
      ),
      inputSchema: z.object({
        employeeName: z.string().describe(EMPLOYEE_NAME_FIELD),
        date: z.string().optional().describe("YYYY-MM-DD if they gave ISO. Defaults to today."),
        when: whenInput,
        topics: dayTopics,
      }),
      outputSchema: employeeDayOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, date, when }, ctx) => {
      try {
        const employee = await resolveEmployee(ctx as AttendanceCtx, employeeName);
        const resolved = date || when ? resolveSingleDate({ date, when }) : undefined;
        const detail = await attendance.getEmployeeTaskDetail(
          ctx as AttendanceCtx,
          employee.employeeId,
          resolved
        );
        const data = summarizeEmployeeDay(detail, employee.name);
        return ok(data.summary, data, { detail });
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showEmployeeHistory = server.tool(
    {
      name: "show_employee_history",
      title: "Show employee history",
      description: usage(
        "One teammate's day, week, or month.",
        [
          "CRITICAL: Always call this for a named person. MUST NOT invent Team-Leader-only access. MUST NOT use show_team_board.",
          "MUST pass employeeName from resource://teammates or list_teammates, and when= their date words.",
          "Example: how many days did Maaz attend this week → employeeName=Maaz, when=this week.",
          "MUST trust returned weekdays. MUST NOT invent dates or loop show_employee_day.",
          "IMPORTANT: No View. Read content aloud.",
        ]
      ),
      inputSchema: z.object({
        employeeName: z.string().describe(EMPLOYEE_NAME_FIELD),
        ...dateFilterFields,
        topics: historyTopics,
      }),
      outputSchema: employeeHistoryOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ employeeName, when, date, month, period, from, to }, ctx) => {
      try {
        const data = await loadEmployeeHistory(ctx as AttendanceCtx, {
          employeeName,
          when,
          date,
          month,
          period,
          from,
          to,
        });
        return ok(data.summary, data);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const showRecurring = server.tool(
    {
      name: "show_recurring",
      title: "Show recurring tasks",
      description: usage(
        "Recurring task templates.",
        [
          "MUST call once. Do not also call list_recurring_tasks.",
          "IMPORTANT: A View is OK here to edit templates.",
        ]
      ),
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
      name: "show_additional_work",
      title: "Show additional work",
      description: usage(
        "Additional work hours and entries.",
        [
          "MUST call once. Do not also call list_additional_work.",
          "IMPORTANT: A View is OK here for the extra-hours form.",
        ]
      ),
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
      name: "show_projects",
      title: "Show projects",
      description: usage(
        "All known project names (today, planned, recurring, extra work).",
        [
          "MUST first consider resource://projects for today's names.",
          "For today's projects only, show_today is enough. MUST NOT also call list_projects.",
          "To create projects without checking in, MUST call add_tasks — not this tool.",
          "IMPORTANT: A View is OK here to pick projects and add tasks.",
        ]
      ),
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
    ...dateFilterFields,
    format: z
      .enum(["xlsx", "pdf", "both"])
      .optional()
      .describe("xlsx and pdf both honor the same date filter. pdf if they said PDF. xlsx if they said Excel. both if they asked for both. If they said export but not the format, ask first."),
    topics: z
      .array(z.enum(["days", "hours", "tasks", "attendance"]))
      .optional()
      .describe(
        "Omit for the full branded report. days=how many days worked. hours=hours and time. tasks=what they worked on. attendance=daily in/out table."
      ),
    page: z.number().int().min(0).optional().describe("0-based history page. Default 0. Ignored when a date filter is set."),
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
    filter: {
      when?: string;
      date?: string;
      month?: string;
      period?: "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month";
      from?: string;
      to?: string;
    },
    ctx: unknown
  ) {
    const data = await loadHistoryExport(ctx as AttendanceCtx, { page, ...filter });
    const wanted = format ?? "pdf";
    const built = await Promise.all([
      ...(wanted === "pdf" ? [] : [buildHistoryExcel(data.employeeName, data.days, topics)]),
      ...(wanted === "xlsx" ? [] : [buildHistoryPdf(data.employeeName, data.days, topics)]),
    ]);
    const files = built.map(storeExportFile);
    const start = data.days[0]?.date;
    const end = data.days.at(-1)?.date;
    const period =
      filter.when?.trim() ||
      (start && end && start === end
        ? formatSpokenDate(start)
        : start && end
          ? `${formatSpokenDate(start)} to ${formatSpokenDate(end)}`
          : "");
    const formatLabel = wanted === "both" ? "PDF and Excel" : wanted === "xlsx" ? "Excel" : "PDF";
    const spoken = period
      ? `Exported ${period} for ${data.employeeName} as ${formatLabel}.`
      : `Exported for ${data.employeeName} as ${formatLabel}.`;
    const scope = start && end ? (start === end ? ` for ${start}` : ` for ${start} to ${end}`) : "";
    return {
      content: [
        {
          type: "text" as const,
          text: spoken,
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
        summary: `Exported ${files.map((file) => file.name).join(" and ")} for ${data.employeeName}${scope}${topics?.length ? ` (${topics.join(", ")})` : ""}.`,
        files,
      },
    };
  }

  const getExport = server.tool(
    {
      name: "get_export",
      title: "Get export files",
      description: "View helper: build Excel/PDF bytes. Models MUST use export_history instead.",
      visibility: "app",
      inputSchema: exportInput,
      outputSchema: exportOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ format, topics, page, when, date, month, period, from, to }, ctx) => {
      try {
        return await runExport(format, topics, page, { when, date, month, period, from, to }, ctx);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  const exportHistory = server.tool(
    {
      name: "export_history",
      title: "Export PDF or Excel",
      description: usage(
        "Download one PDF and/or one Excel for a day, week, or month.",
        [
          "CRITICAL: Pass when= their date words unchanged. Call once. MUST NOT export days separately.",
          "MUST set format=pdf for PDF, format=xlsx for Excel, format=both for both.",
          "If they said export but not which days or which format, ask first.",
          "IMPORTANT: No View. Speak the confirmation from content (who, period, format).",
        ]
      ),
      inputSchema: exportInput,
      outputSchema: exportOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ format, topics, page, when, date, month, period, from, to }, ctx) => {
      try {
        return await runExport(format, topics, page, { when, date, month, period, from, to }, ctx);
      } catch (error) {
        return frappeFailure(error);
      }
    }
  );

  return {
    getToday,
    getTeamBoard,
    getTeammates,
    getManagementBoard,
    getEmployeeDay,
    getEmployeeHistory,
    getHistory,
    getHistoryDay,
    listProjects,
    listRecurring,
    listAdditional,
    getExport,
    exportHistory,
    showToday,
    showTeamBoard,
    listTeammates,
    showManagementBoard,
    showHistory,
    showDay,
    showEmployeeDay,
    showEmployeeHistory,
    showRecurring,
    showAdditionalWork,
    showProjects,
  };
}
