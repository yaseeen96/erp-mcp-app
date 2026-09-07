import { calendarContext, formatDateLabel, formatSpokenDate, weekdayShort } from "./calendar.js";
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

export type HistoryTask = {
  description: string;
  status: string;
  project: string;
  actualTime: string;
};

/** Strip seconds from HH:MM:SS so voice can say "9:12". */
export function spokenTime(value: string) {
  const text = value.trim();
  if (!text) {
    return "";
  }
  const hhmm = text.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) {
    return `${Number(hhmm[1])}:${hhmm[2]}`;
  }
  return text;
}

export function spokenTaskList(tasks: HistoryTask[]) {
  if (!tasks.length) {
    return "No tasks.";
  }
  return `Tasks: ${tasks
    .map((task) => {
      const project = task.project.trim();
      return `${task.description}${project ? ` on ${project}` : ""} (${task.status})`;
    })
    .join("; ")}.`;
}

export function spokenPersonLine(row: {
  name: string;
  status: string;
  login: string;
  logout: string;
  hours?: number;
}) {
  const name = row.name || "Employee";
  const status = row.status.replaceAll("_", " ");
  if (status === "missing") {
    return `${name} missing`;
  }
  if (status === "leave") {
    return `${name} on leave`;
  }
  const login = spokenTime(row.login);
  const logout = spokenTime(row.logout);
  if (status === "late") {
    return login ? `${name} late, in at ${login}` : `${name} late`;
  }
  if (logout) {
    return `${name} in at ${login || "unknown"}, out at ${logout}`;
  }
  if (login) {
    return `${name} in at ${login}`;
  }
  return `${name} ${status}`;
}

export function speakDayLine(day: {
  date: string;
  login: string;
  logout: string;
  hours: number;
  attended?: boolean;
  tasks?: HistoryTask[];
}) {
  const label = formatSpokenDate(day.date) || day.date;
  const attended = day.attended ?? (Boolean(day.login) || day.hours > 0);
  if (!attended) {
    return `${label}: absent.`;
  }
  const login = spokenTime(day.login);
  const logout = spokenTime(day.logout);
  const hours = `${day.hours.toFixed(1)} hours`;
  const tasks = day.tasks?.length ? ` ${spokenTaskList(day.tasks)}` : "";
  return `${label}: in ${login || "unknown"}, out ${logout || "not yet"}, ${hours}.${tasks}`;
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

  const date = stringValue(page.date);
  const calendar = calendarContext();
  const dateLabel = formatSpokenDate(date || calendar.today) || date || calendar.today;
  const login = spokenTime(stringValue(page.login_time));
  const loginBit = login ? ` In at ${login}.` : "";
  const tasksBit = `${done} of ${tasks.length} tasks done.`;
  const projectsBit = projectNames.length ? ` Projects: ${projectNames.join(", ")}.` : "";
  const leave = stringValue(page.leave_today);
  const leaveBit = leave ? ` Leave: ${leave}.` : "";
  return {
    summary: `${dateLabel}. ${employee} is ${status}.${loginBit} ${tasksBit}${projectsBit}${leaveBit}`,
    date,
    weekday: weekdayShort(date || calendar.today),
    calendar,
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

  const names = people.map((row) => row.name).filter(Boolean);
  const dateLabel = formatSpokenDate(stringValue(board.date)) || stringValue(board.date);
  const roster = people
    .filter((row) => row.name)
    .map((row) => spokenPersonLine(row))
    .join(". ");
  const kpiBits = [`${checkedIn} in`, `${missing} missing`];
  if (late) {
    kpiBits.push(`${late} late`);
  }
  if (onLeave) {
    kpiBits.push(`${onLeave} on leave`);
  }
  const spoken = roster
    ? `${dateLabel}. ${roster}. ${kpiBits.join(", ")}.`
    : `${dateLabel}. No teammates. ${kpiBits.join(", ")}.`;
  return {
    summary: spoken,
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
    names,
  };
}

export function summarizeTeammates(board: JsonRecord) {
  const team = summarizeTeam(board);
  const names = team.names;
  const spoken = names.length
    ? `Your team (${names.length}): ${names.join(", ")}.`
    : "No teammates on this board.";
  const statuses = team.people
    .filter((row) => row.name)
    .map((row) => `${row.name} ${row.status.replaceAll("_", " ")}`)
    .join(". ");
  return {
    summary: statuses ? `${spoken} ${statuses}.` : spoken,
    date: team.date,
    names,
    teammates: team.people.map((row) => ({
      name: row.name,
      employeeId: row.employeeId,
      designation: row.designation,
      department: row.department,
      status: row.status,
    })),
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

  const dateLabel = formatSpokenDate(stringValue(board.date)) || stringValue(board.date);
  const checkedIn = numberValue(summary.checked_in);
  const total = numberValue(summary.total);
  const missing = numberValue(summary.missing);
  const deptLines = deptBars
    .map((row) => `${row.name} ${row.checkedIn} in, ${row.missing} missing`)
    .join(". ");
  const rankLines = rankings
    .slice(0, 8)
    .map((row) => {
      const record = asRecord(row) ?? {};
      const name = stringValue(record.employee_name);
      const hours = (numberValue(record.net_minutes) / 60).toFixed(1);
      return name ? `${name} ${hours} hours` : "";
    })
    .filter(Boolean)
    .join(", ");
  const spoken = [
    `${dateLabel}. ${checkedIn} of ${total} in, ${missing} missing.`,
    deptLines ? `Departments: ${deptLines}.` : "",
    rankLines ? `Hours: ${rankLines}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    summary: spoken,
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
      weekday: weekdayShort(date),
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

  const chronological = [...days].reverse();
  const spokenDays = chronological.map((day) => speakDayLine(day)).join(" ");
  return {
    summary: latest
      ? `${employee}. ${days.length} days, ${totalHours.toFixed(1)} hours, ${totalDone} of ${totalTasks} tasks done. ${spokenDays}`
      : "No attendance history yet.",
    employeeName: employee,
    hasMore: boolValue(history.has_more),
    days,
    hoursChart: {
      labels: [...days].reverse().map((row) => formatDateLabel(row.date) || row.date),
      values: [...days].reverse().map((row) => row.hours),
    },
    tasksChart: {
      labels: [...days].reverse().map((row) => formatDateLabel(row.date) || row.date),
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
  const names = templates.map((row) => row.description).filter(Boolean);
  return {
    summary: names.length
      ? `${templates.length} recurring templates, ${active} active. ${names.join("; ")}.`
      : `${templates.length} recurring templates, ${active} active.`,
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
  const lines = entries
    .map((row) => {
      const when = formatSpokenDate(row.date) || row.date;
      return `${when}: ${row.description}${row.project ? ` on ${row.project}` : ""}, ${row.hours.toFixed(1)} hours`;
    })
    .join(". ");
  return {
    summary: lines
      ? `${entries.length} additional-work rows, ${totalHours} hours. ${lines}.`
      : `${entries.length} additional-work rows, ${totalHours} hours on this page.`,
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
  const dateLabel = formatSpokenDate(date) || date;
  const inOut =
    login || logout
      ? `In ${spokenTime(login) || "unknown"}, out ${spokenTime(logout) || "not yet"}, ${hours.toFixed(1)} hours${boolValue(morning.is_late) ? ", late" : ""}.`
      : "No check-in recorded.";
  return {
    summary: `${employee}, ${dateLabel}. ${inOut} ${spokenTaskList(tasks)}`,
    date,
    weekday: weekdayShort(date),
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
