import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlannedTaskInput } from "./attendance.js";
import type { AttendanceCtx } from "./types.js";

export type DraftBucket = "morning" | "eod";

export type PlannedDraft = {
  description: string;
  estimated_time?: string;
  project_name?: string;
};

type UserDrafts = {
  date: string;
  morning: PlannedDraft[];
  eod: PlannedDraft[];
};

const STORE_PATH = join(process.cwd(), "data", "task-drafts.json");
const memory = new Map<string, UserDrafts>();
let loaded = false;

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function draftUserKey(ctx: AttendanceCtx) {
  const user = ctx.auth?.user;
  return user?.id || user?.email || "anon";
}

function normalizeTask(task: PlannedTaskInput | PlannedDraft): PlannedDraft {
  const description = task.description.trim();
  const estimated_time = task.estimated_time?.trim() || undefined;
  const project_name = task.project_name?.trim() || undefined;
  return {
    description,
    ...(estimated_time ? { estimated_time } : {}),
    ...(project_name ? { project_name } : {}),
  };
}

function taskKey(task: PlannedDraft) {
  return `${(task.project_name ?? "").trim().toLowerCase()}\0${task.description.trim().toLowerCase()}`;
}

export function mergePlannedTasks(
  current: PlannedDraft[],
  incoming: Array<PlannedTaskInput | PlannedDraft>
): PlannedDraft[] {
  const next = current.map(normalizeTask).filter((task) => task.description);
  const seen = new Set(next.map(taskKey));
  for (const raw of incoming) {
    const task = normalizeTask(raw);
    if (!task.description) {
      continue;
    }
    const key = taskKey(task);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(task);
  }
  return next;
}

export function projectNamesFromDrafts(tasks: PlannedDraft[]) {
  return [...new Set(tasks.map((task) => task.project_name?.trim()).filter(Boolean))] as string[];
}

export function plannedSnapshot(tasks: PlannedDraft[]) {
  return {
    count: tasks.length,
    projectNames: projectNamesFromDrafts(tasks),
    tasks,
  };
}

function loadStore() {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Record<string, UserDrafts>;
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value.date === "string") {
        memory.set(key, {
          date: value.date,
          morning: Array.isArray(value.morning) ? value.morning : [],
          eod: Array.isArray(value.eod) ? value.eod : [],
        });
      }
    }
  } catch {
    // First run or ephemeral filesystem — stay in memory.
  }
}

function persist() {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(memory), null, 2));
  } catch {
    // Cloud images may be read-only; memory still works for this process.
  }
}

function emptyRecord(date: string): UserDrafts {
  return { date, morning: [], eod: [] };
}

function getRecord(ctx: AttendanceCtx, date: string): UserDrafts {
  loadStore();
  const key = draftUserKey(ctx);
  const current = memory.get(key);
  if (!current || current.date !== date) {
    const next = emptyRecord(date);
    memory.set(key, next);
    persist();
    return next;
  }
  return current;
}

export function attendanceDate(pageDate?: string) {
  return pageDate?.trim() || todayStamp();
}

export function listDrafts(ctx: AttendanceCtx, date: string, bucket?: DraftBucket) {
  const record = getRecord(ctx, date);
  if (bucket) {
    return record[bucket];
  }
  return [...record.morning, ...record.eod];
}

export function addDrafts(
  ctx: AttendanceCtx,
  date: string,
  bucket: DraftBucket,
  incoming: Array<PlannedTaskInput | PlannedDraft>
) {
  const record = getRecord(ctx, date);
  record[bucket] = mergePlannedTasks(record[bucket], incoming);
  memory.set(draftUserKey(ctx), record);
  persist();
  return record[bucket];
}

export function takeDrafts(ctx: AttendanceCtx, date: string, bucket: DraftBucket) {
  const record = getRecord(ctx, date);
  const tasks = record[bucket];
  record[bucket] = [];
  memory.set(draftUserKey(ctx), record);
  persist();
  return tasks;
}

export function restoreDrafts(
  ctx: AttendanceCtx,
  date: string,
  bucket: DraftBucket,
  tasks: PlannedDraft[]
) {
  const record = getRecord(ctx, date);
  record[bucket] = tasks;
  memory.set(draftUserKey(ctx), record);
  persist();
}
