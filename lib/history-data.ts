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

function fallbackEmployee(ctx: AttendanceCtx) {
  const user = ctx.auth?.user;
  return user?.fullName || user?.email || user?.id || "Employee";
}

export async function loadHistoryExport(
  ctx: AttendanceCtx,
  options: { page?: number; date?: string } = {}
): Promise<{ employeeName: string; days: HistoryExportDay[] }> {
  const date = options.date?.trim().slice(0, 10);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("date must be YYYY-MM-DD, e.g. 2026-08-18.");
    }
    const detail = await attendance.getHistoryDayDetail(ctx, date);
    const fromDetail = employeeName(detail.employee);
    const name = fromDetail !== "Employee" ? fromDetail : fallbackEmployee(ctx);
    const day = summarizeDay(detail, name);
    return {
      employeeName: day.employeeName,
      days: [
        {
          date: day.date || date,
          hours: day.hours,
          login: day.login,
          logout: day.logout,
          done: day.taskCounts.done,
          total: day.taskCounts.total,
          tasks: day.tasks,
        },
      ],
    };
  }
  const { data } = await loadHistoryPage(ctx, options.page ?? 0);
  return { employeeName: data.employeeName, days: data.days };
}
