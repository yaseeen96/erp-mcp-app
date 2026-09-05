import { callFrappeMethod } from "./frappe-client.js";
import { stringValue } from "./summaries.js";
import type { AttendanceCtx, JsonRecord, WorkLocation } from "./types.js";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
};

export type WorkLocationConfig = {
  value: WorkLocation;
  options: WorkLocation[];
  readonly: boolean;
  note: string;
};

function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return undefined;
}

function parseHybridDays(raw: unknown): number[] {
  const text = stringValue(raw, "Tuesday\nThursday");
  const days = text
    .split(/\n|,/)
    .map((item) => DAY_INDEX[item.trim().toLowerCase()])
    .filter((item): item is number => item !== undefined);
  return days.length ? days : [1, 3];
}

async function readEmployeeWorkType(
  ctx: AttendanceCtx,
  employeeName: string
): Promise<string> {
  try {
    const value = await callFrappeMethod<unknown>(
      "frappe.client.get_value",
      {
        doctype: "Employee",
        filters: { name: employeeName },
        fieldname: "work_type",
      },
      ctx
    );
    const record = asRecord(value);
    return stringValue(record?.work_type, stringValue(value, "Office")) || "Office";
  } catch {
    return "Office";
  }
}

async function readHybridOfficeDays(ctx: AttendanceCtx): Promise<number[]> {
  try {
    const value = await callFrappeMethod<unknown>(
      "frappe.client.get_single_value",
      { doctype: "ST Attendance Settings", field: "hybrid_office_days" },
      ctx
    );
    return parseHybridDays(value);
  } catch {
    return [1, 3];
  }
}

async function hasWfhRequest(ctx: AttendanceCtx): Promise<boolean> {
  try {
    const result = await callFrappeMethod<JsonRecord>(
      "st_attendance_tracker.api.validate_wfh_request",
      undefined,
      ctx
    );
    return result.valid === true && stringValue(result.message).includes("WFH request");
  } catch {
    return false;
  }
}

/**
 * Same rules as daily_checkin.py `_get_work_location_config`.
 * Saved values stay in Daily Work Log.work_location: Office / WFH / Remote.
 */
export async function resolveWorkLocationConfig(
  ctx: AttendanceCtx,
  page: JsonRecord
): Promise<WorkLocationConfig> {
  const employee = asRecord(page.employee);
  const employeeName = stringValue(employee?.name);
  const date = stringValue(page.date);
  const weekday = date ? new Date(`${date}T12:00:00`).getDay() : new Date().getDay();
  const weekdayNum = weekday === 0 ? 6 : weekday - 1;
  const workType = employeeName
    ? await readEmployeeWorkType(ctx, employeeName)
    : "Office";
  const hasRequest = await hasWfhRequest(ctx);

  if (weekdayNum === 5) {
    return {
      value: "WFH",
      options: ["WFH"],
      readonly: true,
      note: "All employees work from home on Saturdays.",
    };
  }

  if (workType === "Remote") {
    return {
      value: "Remote",
      options: ["Remote"],
      readonly: true,
      note: "You are a remote employee.",
    };
  }

  if (workType === "Hybrid") {
    const hybridDays = await readHybridOfficeDays(ctx);
    const officeDay = hybridDays.includes(weekdayNum);
    const dayName = DAY_NAMES[weekdayNum] ?? "today";
    if (officeDay) {
      return {
        value: hasRequest ? "WFH" : "Office",
        options: ["Office", "WFH"],
        readonly: false,
        note: hasRequest
          ? `Today (${dayName}) — your WFH request is on file.`
          : `Today (${dayName}) is an office day for hybrid employees. Select Office, or apply for WFH first.`,
      };
    }
    return {
      value: "WFH",
      options: ["WFH", "Office"],
      readonly: false,
      note: `Today (${dayName}) is a regular WFH day for hybrid employees. No Attendance Request needed.`,
    };
  }

  return {
    value: hasRequest ? "WFH" : "Office",
    options: ["Office", "WFH"],
    readonly: false,
    note: hasRequest
      ? "Your WFH request is on file."
      : "Select your work location for today.",
  };
}
