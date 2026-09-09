/** Shared field and tool descriptions (AWS CRITICAL / MUST / IMPORTANT). */

export const WHEN_FIELD =
  "Their date words, passed unchanged. Examples: today, yesterday, this week, last week, this month, last month, August, 1 September, 18/08/2026, last 7 days. CRITICAL: MUST pass their words unchanged. Do not convert to ISO or invent weekdays. IMPORTANT: Asia/Kolkata. Weeks Monday–Sunday. Dates are DD/MM/YYYY.";

export const EMPLOYEE_NAME_FIELD =
  "First name, full name, or Employee ID. MUST match a name from resource://teammates or list_teammates (e.g. Maaz). CRITICAL: Call the tool — do not invent a permission error.";

export function usage(purpose: string, bullets: string[]) {
  return `${purpose}

## Usage Requirements
${bullets.map((line) => `- ${line}`).join("\n")}`;
}

export const TEXT_ONLY =
  "IMPORTANT: Text only — no dashboard. If they asked to see the view, charts, or dashboard, call the matching view_* tool instead.";

export function viewOnly(purpose: string, textTool: string) {
  return usage(purpose, [
    "CRITICAL: Call ONLY when they asked to see the dashboard, charts, view, or visual UI.",
    `MUST NOT call this in voice mode, or when they only asked a spoken fact — use ${textTool} instead.`,
    "MUST NOT invent a Visualizer card. Speak content as well.",
  ]);
}
