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
