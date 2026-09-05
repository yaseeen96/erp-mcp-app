import * as attendance from "./attendance.js";
import {
  calendarContext,
  describeRange,
  eachIsoDate,
  formatDateLabel,
  hasDateFilter,
  resolveDateRange,
  weekdayShort,
  type DateFilter,
} from "./calendar.js";
import type { HistoryExportDay } from "./export-files.js";
import {
  employeeName,
  summarizeDay,
  summarizeHistory,
  tasksFromDetail,
  type HistoryTask,
} from "./summaries.js";
import type { AttendanceCtx, JsonRecord } from "./types.js";

function dateKey(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.slice(0, 10);
  }
  return "";
}

async function loadHistoryTasks(ctx: AttendanceCtx, history: JsonRecord) {
  const logs = Array.isArray(history.logs) ? history.logs : [];
  const dates = [
    ...new Set(
      logs.flatMap((row) => {
        if (!row || typeof row !== "object") {
          return [];
        }
        const date = dateKey((row as { date?: unknown }).date);
        return date ? [date] : [];
      })
    ),
  ];
  const entries = await Promise.all(
    dates.map(async (date) => {
      try {
        const detail = await attendance.getHistoryDayDetail(ctx, date);
        return [date, tasksFromDetail(detail)] as const;
      } catch {
        return [date, []] as const;
      }
    })
  );
  return Object.fromEntries(entries) as Record<string, HistoryTask[]>;
}

export async function loadHistoryPage(ctx: AttendanceCtx, page = 0) {
  const history = await attendance.getMyHistory(ctx, page);
  const detailsByDate = await loadHistoryTasks(ctx, history);
  return { history, data: summarizeHistory(history, detailsByDate) };
}

function fallbackEmployee(ctx: AttendanceCtx) {
  const user = ctx.auth?.user;
  return user?.fullName || user?.email || user?.id || "Employee";
}

async function loadExportDay(ctx: AttendanceCtx, date: string): Promise<HistoryExportDay & { employeeName: string }> {
  const detail = await attendance.getHistoryDayDetail(ctx, date);
  const fromDetail = employeeName(detail.employee);
  const name = fromDetail !== "Employee" ? fromDetail : fallbackEmployee(ctx);
  const day = summarizeDay(detail, name);
  return {
    employeeName: day.employeeName,
    date: day.date || date,
    hours: day.hours,
    login: day.login,
    logout: day.logout,
    done: day.taskCounts.done,
    total: day.taskCounts.total,
    tasks: day.tasks,
  };
}

async function loadExportDays(ctx: AttendanceCtx, dates: string[]) {
  const rows = await Promise.all(dates.map((date) => loadExportDay(ctx, date)));
  const named = rows.find((row) => row.employeeName !== "Employee");
  return {
    employeeName: named?.employeeName ?? fallbackEmployee(ctx),
    days: rows.map(({ date, hours, login, logout, done, total, tasks }) => ({
      date,
      hours,
      login,
      logout,
      done,
      total,
      tasks,
    })),
  };
}

export async function loadHistoryRange(ctx: AttendanceCtx, args: DateFilter) {
  const range = resolveDateRange(args, { fallback: "none" });
  const dates = eachIsoDate(range.from, range.to);
  const loaded = await Promise.all(
    dates.map(async (date) => {
      try {
        return await loadExportDay(ctx, date);
      } catch {
        return {
          employeeName: fallbackEmployee(ctx),
          date,
          hours: 0,
          login: "",
          logout: "",
          done: 0,
          total: 0,
          tasks: [],
        };
      }
    })
  );
  const named = loaded.find((row) => row.employeeName !== "Employee");
  const employee = named?.employeeName ?? fallbackEmployee(ctx);
  const days = loaded.map((row) => ({
    date: row.date,
    weekday: weekdayShort(row.date),
    hours: row.hours,
    login: row.login,
    logout: row.logout,
    done: row.done,
    total: row.total,
    tasks: row.tasks,
    attended: Boolean(row.login) || row.hours > 0,
  }));
  const attendedDays = days.filter((day) => day.attended).length;
  const calendar = calendarContext(range.today);
  const hours = days.reduce((sum, day) => sum + day.hours, 0);
  const attendedLabels = days.filter((day) => day.attended).map((day) => formatDateLabel(day.date));
  return {
    data: {
      summary: [
        `${describeRange(range)}.`,
        `${employee} attended ${attendedDays} of ${days.length} days${attendedLabels.length ? ` (${attendedLabels.join(", ")})` : ""}.`,
        `${hours.toFixed(1)}h recorded.`,
      ].join(" "),
      employeeName: employee,
      hasMore: false,
      from: range.from,
      to: range.to,
      period: range.period,
      attendedDays,
      calendar,
      days,
      hoursChart: {
        labels: days.map((row) => formatDateLabel(row.date)),
        values: days.map((row) => row.hours),
      },
      tasksChart: {
        labels: days.map((row) => formatDateLabel(row.date)),
        done: days.map((row) => row.done),
        total: days.map((row) => row.total),
      },
    },
  };
}

export async function loadHistoryExport(
  ctx: AttendanceCtx,
  options: DateFilter & { page?: number } = {}
): Promise<{ employeeName: string; days: HistoryExportDay[] }> {
  if (hasDateFilter(options)) {
    const range = resolveDateRange(options, { fallback: "none" });
    return loadExportDays(ctx, eachIsoDate(range.from, range.to));
  }
  const { data } = await loadHistoryPage(ctx, options.page ?? 0);
  return { employeeName: data.employeeName, days: data.days };
}
