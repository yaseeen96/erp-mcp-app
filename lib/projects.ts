import * as attendance from "./attendance.js";
import { asArray, asRecord, boolValue, stringValue } from "./summaries.js";
import { attendanceDate, listDrafts } from "./task-drafts.js";
import type { AttendanceCtx, JsonRecord } from "./types.js";

export type ProjectTask = {
  name: string;
  description: string;
  status: string;
  estimate: string;
  actualTime: string;
};

export type ProjectRow = {
  name: string;
  todayCount: number;
  done: number;
  sources: string[];
  tasks: ProjectTask[];
};

function addName(
  map: Map<string, ProjectRow>,
  rawName: unknown,
  source: string,
  task?: ProjectTask
) {
  const name = stringValue(rawName).trim() || "General";
  const current = map.get(name) ?? {
    name,
    todayCount: 0,
    done: 0,
    sources: [],
    tasks: [],
  };
  if (!current.sources.includes(source)) {
    current.sources.push(source);
  }
  if (task) {
    current.todayCount += 1;
    if (task.status === "Done") {
      current.done += 1;
    }
    current.tasks.push(task);
  }
  map.set(name, current);
}

function taskFromRecord(row: JsonRecord): ProjectTask {
  return {
    name: stringValue(row.name),
    description: stringValue(row.description, "Task"),
    status: stringValue(row.status, "Pending"),
    estimate: stringValue(row.estimated_time),
    actualTime: stringValue(row.actual_time),
  };
}

export function summarizeProjects(
  page: JsonRecord,
  recurring: unknown[],
  extra: JsonRecord,
  planned: Array<{ description: string; estimated_time?: string; project_name?: string }> = []
) {
  const map = new Map<string, ProjectRow>();

  for (const row of asArray(page.tasks)) {
    const task = asRecord(row);
    if (!task) {
      continue;
    }
    addName(map, task.project_name, "today", taskFromRecord(task));
  }

  for (const task of planned) {
    addName(map, task.project_name, "planned", {
      name: "",
      description: task.description,
      status: "Planned",
      estimate: task.estimated_time ?? "",
      actualTime: "",
    });
  }

  for (const row of recurring) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }
    const name = stringValue(record.project_name).trim();
    if (name) {
      addName(map, name, "recurring");
    }
  }

  for (const row of asArray(extra.entries)) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }
    const name = stringValue(record.project_name).trim();
    if (name) {
      addName(map, name, "additional");
    }
  }

  const projects = [...map.values()].sort((left, right) => {
    if (right.todayCount !== left.todayCount) {
      return right.todayCount - left.todayCount;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    summary: projects.length
      ? `${projects.length} projects. ${projects.filter((row) => row.todayCount).length} have tasks today${
          planned.length ? `. ${planned.length} planned` : ""
        }.`
      : "No projects yet. Add one and put tasks on it.",
    date: stringValue(page.date),
    morningDone: boolValue(page.morning_done),
    eodDone: boolValue(page.eod_done),
    count: projects.length,
    projects,
  };
}

export async function loadProjects(ctx: AttendanceCtx) {
  const [page, recurring, extra] = await Promise.all([
    attendance.getPageState(ctx),
    attendance.getRecurringTasks(ctx),
    attendance.getAdditionalWork(ctx, 0),
  ]);
  return {
    page,
    data: summarizeProjects(page, recurring, extra, listDrafts(ctx, attendanceDate(stringValue(page.date)))),
  };
}
