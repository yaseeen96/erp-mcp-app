import type { JsonRecord } from "./types.js";

export function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export function employeeName(source: unknown): string {
  const record = asRecord(source);
  return stringValue(record?.employee_name, stringValue(record?.name, "Employee"));
}

export function summarizeToday(page: JsonRecord) {
  const tasks = asArray(page.tasks);
  const done = tasks.filter((task) => asRecord(task)?.status === "Done").length;
  const pending = tasks.filter((task) => {
    const status = asRecord(task)?.status;
    return status === "Pending" || status === "In Progress";
  }).length;
  const carried = tasks.filter((task) => boolValue(asRecord(task)?.is_carried)).length;
  const employee = employeeName(page.employee);
  const morningDone = boolValue(page.morning_done);
  const eodDone = boolValue(page.eod_done);
  const status = eodDone ? "checked out" : morningDone ? "checked in" : "not checked in";
  const projectNames = [
    ...new Set(
      tasks.flatMap((task) => {
        const name = stringValue(asRecord(task)?.project_name).trim();
        return name ? [name] : [];
      })
    ),
  ];

  return {
    summary: `${employee} is ${status} on ${stringValue(page.date)}. ${done}/${tasks.length} tasks done${projectNames.length ? `. Projects: ${projectNames.join(", ")}` : ""}.`,
    date: stringValue(page.date),
    employeeName: employee,
    morningDone,
    eodDone,
    isTeamLeader: boolValue(page.is_team_leader),
    loginTime: stringValue(page.login_time),
    leaveToday: stringValue(page.leave_today) || undefined,
    hasResetToday: boolValue(page.has_reset_today),
    taskCounts: {
      total: tasks.length,
      done,
      pending,
      carried,
    },
    projectNames,
    chart: {
      labels: ["Done", "Open", "Carried"],
      values: [done, pending, carried],
    },
    workLocation: {
      value: "Office" as const,
      options: ["Office", "WFH"] as ("Office" | "WFH" | "Remote")[],
      readonly: false,
      note: "Select your work location for today.",
    },
  };
}

export function summarizeTeam(board: JsonRecord) {
  const summary = asRecord(board.summary) ?? {};
  const employees = asArray(board.employees);
  const late = numberValue(summary.late);
  const checkedIn = numberValue(summary.checked_in);
  const missing = numberValue(summary.missing);
  const onLeave = numberValue(summary.on_leave);
  const eodDone = numberValue(summary.eod_done);
  const people = employees.map((row) => {
    const employee = asRecord(row) ?? {};
    return {
      employeeId: stringValue(employee.name),
      name: stringValue(employee.employee_name, stringValue(employee.name)),
      designation: stringValue(employee.designation),
      department: stringValue(employee.department),
      status: stringValue(employee.status, "missing"),
      login: stringValue(employee.login_time),
      logout: stringValue(employee.logout_time),
      hours: parseHours(employee.net_hours),
      done: numberValue(employee.done_tasks),
      total: numberValue(employee.total_tasks),
    };
  });

  return {
    summary: `Team ${stringValue(board.date)}: ${people.map((row) => row.name).join(", ") || "no reports"}. ${checkedIn} in, ${late} late, ${missing} missing, ${onLeave} on leave, ${eodDone} EOD.`,
    date: stringValue(board.date),
    kpis: {
      total: numberValue(summary.total, employees.length),
      checkedIn,
      late,
      missing,
      onLeave,
      eodDone,
    },
    statusChart: {
      labels: ["Checked in", "Late", "EOD", "Leave", "Missing"],
      values: [Math.max(0, checkedIn - late - eodDone), late, eodDone, onLeave, missing],
    },
    hoursChart: {
      labels: people.map((row) => row.name),
      values: people.map((row) => row.hours),
    },
    people,
  };
}

export function summarizeManagement(board: JsonRecord) {
  const summary = asRecord(board.summary) ?? {};
  const departments = asArray(board.departments);
  const rankings = asArray(board.rankings);
  const deptBars = departments.map((row) => {
    const dept = asRecord(row) ?? {};
    const deptSummary = asRecord(dept.summary) ?? {};
    return {
      name: stringValue(dept.department, "Department"),
      checkedIn: numberValue(deptSummary.checked_in),
      missing: numberValue(deptSummary.missing),
      late: numberValue(deptSummary.late),
    };
  });

  return {
    summary: `Company ${stringValue(board.date)}: ${numberValue(summary.checked_in)}/${numberValue(summary.total)} checked in, ${numberValue(summary.missing)} missing, ${numberValue(summary.on_leave)} on leave.`,
    date: stringValue(board.date),
    kpis: {
      total: numberValue(summary.total),
      checkedIn: numberValue(summary.checked_in),
      eodDone: numberValue(summary.eod_done),
      onLeave: numberValue(summary.on_leave),
      missing: numberValue(summary.missing),
    },
    standardWorkdayMinutes: numberValue(board.standard_workday_minutes, 480),
    statusChart: {
      labels: ["Checked in", "EOD", "Leave", "Missing"],
      values: [
        numberValue(summary.checked_in),
        numberValue(summary.eod_done),
        numberValue(summary.on_leave),
        numberValue(summary.missing),
      ],
    },
    departmentChart: {
      labels: deptBars.map((row) => row.name),
      checkedIn: deptBars.map((row) => row.checkedIn),
      missing: deptBars.map((row) => row.missing),
      late: deptBars.map((row) => row.late),
    },
    rankingChart: {
      labels: rankings.slice(0, 12).map((row) => stringValue(asRecord(row)?.employee_name)),
      values: rankings.slice(0, 12).map((row) => numberValue(asRecord(row)?.net_minutes) / 60),
    },
  };
}

export type HistoryTask = {
  description: string;
  status: string;
  project: string;
  actualTime: string;
};

export function tasksFromDetail(detail: JsonRecord): HistoryTask[] {
  return asArray(detail.tasks).flatMap((row) => {
    const task = asRecord(row);
    if (!task) {
      return [];
    }
    return [
      {
        description: stringValue(task.description, "Task"),
        status: stringValue(task.status, "Pending"),
        project: stringValue(task.project_name),
        actualTime: stringValue(task.actual_time),
      },
    ];
  });
}

export function summarizeHistory(
  history: JsonRecord,
  detailsByDate: Record<string, HistoryTask[]> = {}
) {
  const logs = asArray(history.logs);
  const employee = employeeName(history.employee);
  const days = logs.map((row) => {
    const log = asRecord(row) ?? {};
    const date = stringValue(log.date).slice(0, 10);
    return {
      date,
      hours: parseHours(log.net_hours),
      login: stringValue(log.login_time),
      logout: stringValue(log.logout_time),
      done: numberValue(log.done_tasks),
      total: numberValue(log.total_tasks),
      tasks: detailsByDate[date] ?? [],
    };
  });
  const latest = days[0];
  const totalHours = days.reduce((sum, day) => sum + day.hours, 0);
  const totalDone = days.reduce((sum, day) => sum + day.done, 0);
  const totalTasks = days.reduce((sum, day) => sum + day.total, 0);

  return {
    summary: latest
      ? `${days.length} days · ${totalHours.toFixed(1)}h · ${totalDone}/${totalTasks} tasks`
      : "No attendance history yet.",
    employeeName: employee,
    hasMore: boolValue(history.has_more),
    days,
    hoursChart: {
      labels: [...days].reverse().map((row) => row.date),
      values: [...days].reverse().map((row) => row.hours),
    },
    tasksChart: {
      labels: [...days].reverse().map((row) => row.date),
      done: [...days].reverse().map((row) => row.done),
      total: [...days].reverse().map((row) => row.total),
    },
  };
}

export function summarizeEmployeeDay(detail: JsonRecord, fallbackId: string) {
  const emp = asRecord(detail.employee) ?? {};
  const name = stringValue(emp.employee_name, stringValue(emp.name, fallbackId));
  return {
    ...summarizeDay(detail, name),
    employeeId: stringValue(emp.name, fallbackId),
  };
}

export function summarizeRecurring(rows: unknown[]) {
  const templates = rows.flatMap((row) => {
    const record = asRecord(row);
    if (!record) {
      return [];
    }
    const days = asArray(record.days).length
      ? asArray(record.days).map((day) => stringValue(asRecord(day)?.name, stringValue(day)))
      : stringValue(record.recurring_days)
          .split("\n")
          .map((day) => day.trim())
          .filter(Boolean);
    return [
      {
        name: stringValue(record.name),
        description: stringValue(record.description, "Task"),
        project: stringValue(record.project_name),
        estimatedTime: stringValue(record.estimated_time),
        active: boolValue(record.is_active),
        days,
      },
    ];
  });
  const active = templates.filter((row) => row.active).length;
  return {
    summary: `${templates.length} recurring templates, ${active} active.`,
    count: templates.length,
    active,
    inactive: templates.length - active,
    statusChart: {
      labels: ["Active", "Inactive"],
      values: [active, templates.length - active],
    },
    rows: templates,
  };
}

export function summarizeAdditional(result: JsonRecord) {
  const entries = asArray(result.entries).map((row) => {
    const record = asRecord(row) ?? {};
    const hours = parseHours(record.hours_spent);
    return {
      name: stringValue(record.name),
      date: stringValue(record.work_date).slice(0, 10),
      project: stringValue(record.project_name),
      hours,
      hoursLabel: stringValue(record.hours_spent, hours ? `${hours.toFixed(1)}h` : ""),
      description: stringValue(record.description, "Additional work"),
      remarks: stringValue(record.remarks),
      status: stringValue(record.status),
    };
  });
  const byDate = new Map<string, number>();
  for (const entry of [...entries].reverse()) {
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.hours);
  }
  const totalHours = numberValue(result.total_hours, entries.reduce((sum, row) => sum + row.hours, 0));
  return {
    summary: `${entries.length} additional-work rows, ${totalHours}h on this page.`,
    totalHours,
    hasMore: boolValue(result.has_more),
    hoursChart: {
      labels: [...byDate.keys()],
      values: [...byDate.values()],
    },
    entries,
  };
}

export function summarizeDay(detail: JsonRecord, employee = "Employee") {
  const date = stringValue(detail.date).slice(0, 10);
  const morning = asRecord(detail.morning_log) ?? {};
  const eod = asRecord(detail.eod_log) ?? {};
  const tasks = tasksFromDetail(detail);
  const done = tasks.filter((task) => task.status === "Done").length;
  const pending = tasks.filter((task) => task.status === "Pending").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress").length;
  const rolled = tasks.filter((task) => task.status === "Rolled Over").length;
  const dropped = tasks.filter((task) => task.status === "Dropped").length;
  const hours = parseHours(eod.net_hours);
  const login = stringValue(morning.login_time);
  const logout = stringValue(eod.logout_time);
  return {
    summary: `${employee} on ${date}: ${hours.toFixed(1)}h, ${done}/${tasks.length} tasks done.`,
    date,
    employeeName: employee,
    login,
    logout,
    hours,
    late: boolValue(morning.is_late),
    taskCounts: {
      total: tasks.length,
      done,
      pending,
      inProgress,
      rolled,
      dropped,
    },
    statusChart: compactChart(
      ["Done", "Pending", "In Progress", "Rolled Over", "Dropped"],
      [done, pending, inProgress, rolled, dropped]
    ),
    hoursChart: hoursByGroup(tasks),
    tasks,
  };
}

function compactChart(labels: string[], values: number[]) {
  const pairs = labels
    .map((label, index) => [label, values[index] ?? 0] as const)
    .filter(([, value]) => value > 0);
  return {
    labels: pairs.map(([label]) => label),
    values: pairs.map(([, value]) => value),
  };
}

function hoursByGroup(tasks: HistoryTask[]) {
  const byProject = new Map<string, number>();
  const byTask = new Map<string, number>();
  for (const task of tasks) {
    const spent = parseHours(task.actualTime);
    if (!spent) {
      continue;
    }
    const project = task.project.trim();
    if (project) {
      byProject.set(project, (byProject.get(project) ?? 0) + spent);
    }
    const title = task.description.trim().slice(0, 32) || "Task";
    byTask.set(title, (byTask.get(title) ?? 0) + spent);
  }
  if (byProject.size >= 1) {
    return {
      labels: [...byProject.keys()],
      values: [...byProject.values()],
    };
  }
  return {
    labels: [...byTask.keys()],
    values: [...byTask.values()],
  };
}

export function parseHours(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = stringValue(value).trim().toLowerCase();
  if (!text) {
    return 0;
  }
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hourMatch || minuteMatch) {
    return numberValue(hourMatch?.[1]) + numberValue(minuteMatch?.[1]) / 60;
  }
  const hhmm = text.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) {
    return numberValue(hhmm[1]) + numberValue(hhmm[2]) / 60;
  }
  return numberValue(text);
}
