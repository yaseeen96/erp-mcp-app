import type { JsonRecord } from "./types.js";

function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
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

  return {
    summary: `${employee} is ${status} on ${stringValue(page.date)}. ${done}/${tasks.length} tasks done.`,
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
  const hours = employees.map((row) => {
    const employee = asRecord(row) ?? {};
    return {
      name: stringValue(employee.employee_name, stringValue(employee.name)),
      hours: parseHours(employee.net_hours),
      status: stringValue(employee.status, "missing"),
      isLate: boolValue(employee.is_late),
    };
  });

  return {
    summary: `Team ${stringValue(board.date)}: ${checkedIn} in, ${late} late, ${missing} missing, ${onLeave} on leave, ${eodDone} EOD.`,
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
      labels: hours.map((row) => row.name),
      values: hours.map((row) => row.hours),
    },
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

export function summarizeHistory(history: JsonRecord) {
  const logs = asArray(history.logs);
  const employee = employeeName(history.employee);
  const hours = logs.map((row) => {
    const log = asRecord(row) ?? {};
    return {
      date: stringValue(log.date),
      hours: parseHours(log.net_hours),
      done: numberValue(log.done_tasks),
      total: numberValue(log.total_tasks),
    };
  });
  const latest = hours[0];

  return {
    summary: latest
      ? `${employee}: latest ${latest.date} ${latest.hours.toFixed(1)}h, ${latest.done}/${latest.total} tasks. ${logs.length} days loaded.`
      : `${employee}: no attendance history yet.`,
    employeeName: employee,
    hasMore: boolValue(history.has_more),
    hoursChart: {
      labels: [...hours].reverse().map((row) => row.date),
      values: [...hours].reverse().map((row) => row.hours),
    },
    tasksChart: {
      labels: [...hours].reverse().map((row) => row.date),
      done: [...hours].reverse().map((row) => row.done),
      total: [...hours].reverse().map((row) => row.total),
    },
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
