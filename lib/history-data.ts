import * as attendance from "./attendance.js";
import { summarizeHistory, tasksFromDetail, type HistoryTask } from "./summaries.js";
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
