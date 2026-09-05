import { callFrappeMethod } from "./frappe-client.js";
import type { AttendanceCtx, JsonRecord } from "./types.js";

const API = "st_attendance_tracker.api";

export type PlannedTaskInput = {
  description: string;
  estimated_time?: string;
  project_name?: string;
};

export type CarriedTaskUpdate = {
  name: string;
  description?: string;
  estimated_time?: string;
  project_name?: string;
};

export type EodTaskUpdate = {
  name: string;
  status?: string;
  actual_time?: string;
  remarks?: string;
  description?: string;
  carry_forward?: boolean;
};

export type AdhocTaskInput = {
  description: string;
  status?: string;
  estimated_time?: string;
  actual_time?: string;
  remarks?: string;
  project_name?: string;
};

export function getPageState(ctx: AttendanceCtx) {
  return callFrappeMethod<JsonRecord>(`${API}.get_page_state`, undefined, ctx);
}

export function getTeamDashboard(ctx: AttendanceCtx, date?: string) {
  return callFrappeMethod<JsonRecord>(
    `${API}.get_team_dashboard`,
    date ? { date } : undefined,
    ctx
  );
}

export function getManagementDashboard(ctx: AttendanceCtx, date?: string) {
  return callFrappeMethod<JsonRecord>(
    `${API}.get_management_dashboard`,
    date ? { date } : undefined,
    ctx
  );
}

export function getEmployeeTaskDetail(
  ctx: AttendanceCtx,
  employeeName: string,
  date?: string
) {
  return callFrappeMethod<JsonRecord>(
    `${API}.get_employee_task_detail`,
    { employee_name: employeeName, ...(date ? { date } : {}) },
    ctx
  );
}

export function getMyHistory(ctx: AttendanceCtx, page = 0) {
  return callFrappeMethod<JsonRecord>(`${API}.get_my_history`, { page }, ctx);
}

export function getHistoryDayDetail(ctx: AttendanceCtx, date: string) {
  return callFrappeMethod<JsonRecord>(`${API}.get_history_day_detail`, { date }, ctx);
}

export function getRecurringTasks(ctx: AttendanceCtx) {
  return callFrappeMethod<unknown[]>(`${API}.get_recurring_tasks`, undefined, ctx);
}

export function saveRecurringTask(ctx: AttendanceCtx, args: JsonRecord) {
  return callFrappeMethod<JsonRecord>(`${API}.save_recurring_task`, args, ctx);
}

export function deleteRecurringTask(ctx: AttendanceCtx, name: string) {
  return callFrappeMethod<JsonRecord>(`${API}.delete_recurring_task`, { name }, ctx);
}

export function getAdditionalWork(ctx: AttendanceCtx, page = 0) {
  return callFrappeMethod<JsonRecord>(`${API}.get_additional_work`, { page }, ctx);
}

export function saveAdditionalWork(ctx: AttendanceCtx, args: JsonRecord) {
  return callFrappeMethod<JsonRecord>(`${API}.save_additional_work`, args, ctx);
}

export function deleteAdditionalWork(ctx: AttendanceCtx, name: string) {
  return callFrappeMethod<JsonRecord>(`${API}.delete_additional_work`, { name }, ctx);
}

export function submitMorningLog(
  ctx: AttendanceCtx,
  args: {
    new_tasks: PlannedTaskInput[];
    login_time?: string;
    carried_updates?: CarriedTaskUpdate[];
    work_location?: string;
    half_day_session?: string;
  }
) {
  return callFrappeMethod<JsonRecord>(`${API}.submit_morning_log`, {
    new_tasks: args.new_tasks,
    login_time: args.login_time,
    carried_updates: args.carried_updates ?? [],
    work_location: args.work_location,
    half_day_session: args.half_day_session,
  }, ctx);
}

export function submitEodLog(
  ctx: AttendanceCtx,
  args: {
    lunch_from: string;
    lunch_to: string;
    logout_time: string;
    task_updates: EodTaskUpdate[];
    adhoc_tasks: AdhocTaskInput[];
  }
) {
  return callFrappeMethod<JsonRecord>(`${API}.submit_eod_log`, args, ctx);
}

export function resetMorningCheckin(ctx: AttendanceCtx) {
  return callFrappeMethod<JsonRecord>(`${API}.reset_morning_checkin`, undefined, ctx);
}

export function updateHalfDaySession(ctx: AttendanceCtx, session: string) {
  return callFrappeMethod<JsonRecord>(`${API}.update_half_day_session`, { session }, ctx);
}

export function deleteCarriedTask(ctx: AttendanceCtx, name: string) {
  return callFrappeMethod<JsonRecord>(`${API}.delete_carried_task`, { name }, ctx);
}

export function validateWfhRequest(ctx: AttendanceCtx) {
  return callFrappeMethod<JsonRecord>(`${API}.validate_wfh_request`, undefined, ctx);
}
