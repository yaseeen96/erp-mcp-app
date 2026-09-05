export type FrappeUser = {
  id: string;
  email?: string;
  fullName?: string;
};

export type AttendanceCtx = {
  auth?: {
    accessToken?: string;
    user?: FrappeUser;
  };
  signal?: AbortSignal;
};

export type TaskStatus =
  | "Pending"
  | "In Progress"
  | "Done"
  | "Rolled Over"
  | "Dropped";

export type WorkLocation = "Office" | "WFH" | "Remote";

export type HalfDaySession = "First Half" | "Second Half";

export type EmployeeStatus =
  | "checked_in"
  | "late"
  | "eod_done"
  | "leave"
  | "missing";

export type JsonRecord = Record<string, unknown>;
