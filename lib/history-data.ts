import * as attendance from "./attendance.js";
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPORT_DAYS = 62;

function fallbackEmployee(ctx: AttendanceCtx) {
  const user = ctx.auth?.user;
  return user?.fullName || user?.email || user?.id || "Employee";
}

function parseIsoDate(value: string, field: string) {
  const date = value.trim().slice(0, 10);
  if (!ISO_DATE.test(date)) {
    throw new Error(`${field} must be YYYY-MM-DD, e.g. 2026-08-18.`);
  }
  return date;
}

function addUtcDays(iso: string, amount: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
}

export function eachIsoDate(from: string, to: string) {
  if (from > to) {
    throw new Error("from must be on or before to.");
  }
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addUtcDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > MAX_EXPORT_DAYS) {
      throw new Error(`Export range cannot exceed ${MAX_EXPORT_DAYS} days. Narrow from/to.`);
    }
  }
  return dates;
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

export async function loadHistoryExport(
  ctx: AttendanceCtx,
  options: { page?: number; date?: string; from?: string; to?: string } = {}
): Promise<{ employeeName: string; days: HistoryExportDay[] }> {
  const single = options.date?.trim() ? parseIsoDate(options.date, "date") : "";
  const from = options.from?.trim() ? parseIsoDate(options.from, "from") : single;
  const to = options.to?.trim() ? parseIsoDate(options.to, "to") : single;
  if (from || to) {
    if (!from || !to) {
      throw new Error("Pass date for one day, or both from and to for a range.");
    }
    return loadExportDays(ctx, eachIsoDate(from, to));
  }
  const { data } = await loadHistoryPage(ctx, options.page ?? 0);
  return { employeeName: data.employeeName, days: data.days };
}
