import * as attendance from "./attendance.js";
import {
  calendarContext,
  describeRange,
  eachIsoDate,
  formatDateLabel,
  resolveDateRange,
  weekdayShort,
  type DateFilter,
} from "./calendar.js";
import {
  asArray,
  asRecord,
  summarizeEmployeeDay,
  stringValue,
  type HistoryTask,
} from "./summaries.js";
import type { AttendanceCtx, JsonRecord } from "./types.js";

export type EmployeeRangeArgs = DateFilter & {
  employeeName: string;
};

export type EmployeeRangeDay = {
  date: string;
  weekday: string;
  attended: boolean;
  status: "checked_out" | "checked_in" | "absent";
  hours: number;
  login: string;
  logout: string;
  done: number;
  total: number;
  tasks: HistoryTask[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchScore(person: { employeeId: string; name: string }, query: string) {
  const id = normalize(person.employeeId);
  const name = normalize(person.name);
  const q = normalize(query);
  if (!q) {
    return 0;
  }
  if (id === q || name === q) {
    return 4;
  }
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.includes(q)) {
    return 3;
  }
  if (name.includes(q) || q.includes(name)) {
    return 2;
  }
  return 0;
}

function peopleFromBoard(board: JsonRecord) {
  return asArray(board.employees).map((row) => {
    const employee = asRecord(row) ?? {};
    return {
      employeeId: stringValue(employee.name),
      name: stringValue(employee.employee_name, stringValue(employee.name)),
    };
  });
}

async function resolveEmployee(ctx: AttendanceCtx, query: string) {
  const wanted = query.trim();
  if (!wanted) {
    throw new Error("Pass employeeName (name or Employee ID).");
  }

  try {
    const board = await attendance.getTeamDashboard(ctx);
    const people = peopleFromBoard(board).filter((person) => person.employeeId);
    const scored = people
      .map((person) => ({ person, score: matchScore(person, wanted) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score ?? 0;
    const top = scored.filter((row) => row.score === best).map((row) => row.person);
    if (top.length === 1) {
      return top[0];
    }
    if (top.length > 1) {
      throw new Error(
        `Several teammates match "${wanted}": ${top.map((row) => row.name).join(", ")}. Use the full name or Employee ID.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Several teammates")) {
      throw error;
    }
  }

  const detail = await attendance.getEmployeeTaskDetail(ctx, wanted);
  const emp = asRecord(detail.employee) ?? {};
  const employeeId = stringValue(emp.name, wanted);
  const name = stringValue(emp.employee_name, stringValue(emp.name, wanted));
  if (!employeeId) {
    throw new Error(`Could not find teammate "${wanted}".`);
  }
  return { employeeId, name };
}

function dayFromDetail(date: string, detail: JsonRecord | null, fallbackId: string): EmployeeRangeDay {
  if (!detail) {
    return {
      date,
      weekday: weekdayShort(date),
      attended: false,
      status: "absent",
      hours: 0,
      login: "",
      logout: "",
      done: 0,
      total: 0,
      tasks: [],
    };
  }
  const summary = summarizeEmployeeDay(detail, fallbackId);
  const attended = Boolean(summary.login) || summary.hours > 0;
  return {
    date: summary.date || date,
    weekday: weekdayShort(summary.date || date),
    attended,
    status: summary.logout ? "checked_out" : summary.login ? "checked_in" : "absent",
    hours: summary.hours,
    login: summary.login,
    logout: summary.logout,
    done: summary.taskCounts.done,
    total: summary.taskCounts.total,
    tasks: summary.tasks,
  };
}

export async function loadEmployeeHistory(ctx: AttendanceCtx, args: EmployeeRangeArgs) {
  const range = resolveDateRange(args, { fallback: "this_week" });
  const dates = eachIsoDate(range.from, range.to);
  const employee = await resolveEmployee(ctx, args.employeeName);
  const rows = await Promise.all(
    dates.map(async (date) => {
      try {
        const detail = await attendance.getEmployeeTaskDetail(ctx, employee.employeeId, date);
        return dayFromDetail(date, detail, employee.employeeId);
      } catch {
        return dayFromDetail(date, null, employee.employeeId);
      }
    })
  );

  const attendedDays = rows.filter((row) => row.attended).length;
  const projectNames = [
    ...new Set(
      rows.flatMap((row) =>
        row.tasks.flatMap((task) => (task.project.trim() ? [task.project.trim()] : []))
      )
    ),
  ];
  const attendedLabels = rows
    .filter((row) => row.attended)
    .map((row) => formatDateLabel(row.date));
  const calendar = calendarContext(range.today);
  const hours = rows.reduce((sum, row) => sum + row.hours, 0);
  const summary = [
    `${describeRange(range)}.`,
    `${employee.name} attended ${attendedDays} of ${rows.length} days${attendedLabels.length ? ` (${attendedLabels.join(", ")})` : ""}.`,
    `${hours.toFixed(1)}h recorded.`,
  ].join(" ");

  return {
    summary,
    employeeId: employee.employeeId,
    employeeName: employee.name,
    from: range.from,
    to: range.to,
    period: range.period,
    attendedDays,
    projectNames,
    calendar,
    hasMore: false,
    days: rows,
    hoursChart: {
      labels: rows.map((row) => formatDateLabel(row.date)),
      values: rows.map((row) => row.hours),
    },
    tasksChart: {
      labels: rows.map((row) => formatDateLabel(row.date)),
      done: rows.map((row) => row.done),
      total: rows.map((row) => row.total),
    },
  };
}
