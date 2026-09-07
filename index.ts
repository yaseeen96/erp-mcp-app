import { MCPServer } from "mcp-use";
import { mountFrappeClientRegistration } from "./lib/dcr.js";
import { mountExportDownloads } from "./lib/export-store.js";
import { mountLandingIconRewrite } from "./lib/landing-brand.js";
import { env } from "./lib/env.js";
import { createFrappeOAuthProvider } from "./lib/frappe-oauth.js";
import { mountAuthorizeProxy } from "./lib/oauth-authorize.js";
import type { FrappeUser } from "./lib/types.js";
import { registerAttendanceResources } from "./lib/resources.js";
import { registerPlanProjectPrompt } from "./prompts/plan-project.js";
import { registerAttendanceReadTools } from "./tools/attendance-read.js";
import { registerAttendanceWriteTools } from "./tools/attendance-write.js";

const config = {
  name: "erp-mcp-app",
  title: "ST Attendance",
  version: "1.5.0",
  description: "Per-user ERPNext attendance MCP App for ST Attendance Tracker",
  instructions: `# ST Attendance

CRITICAL: Dates are Asia/Kolkata. Weeks are Monday–Sunday. Pass when= their date words unchanged (today, yesterday, this week, last week, this month, August, 1 September, 18/08/2026). MUST NOT convert dates or invent weekdays — trust weekday fields on the result.

CRITICAL: Result content is the spoken script. Read it aloud. MUST NOT invent names, weekdays, or hours from a View.

## Tools

| They said | Call |
| --- | --- |
| who is on my team / names | list_teammates once; speak every name. Also resource://teammates |
| how is my team doing | show_team_board (text roster, no View) |
| what did X work on / X this week | show_employee_day or show_employee_history once with when= |
| check in / punch in | check_in |
| check out / finish day | check_out |
| plan / add tasks, no punch | add_tasks |
| export / PDF / Excel | export_history once with when= and format= |
| today / am I in | show_today (View OK) |
| my day / week / month | show_history once with when= |
| HR company board | show_management_board |
| recurring | show_recurring (View OK) |
| extra hours | show_additional_work (View OK) |
| projects | show_projects (View OK) or resource://projects |

## Usage Requirements
- Precise ask → one tool. Vague ask → one short question.
- Two tools only if they asked for two outcomes.
- MUST NOT invent a Team-Leader permission error — call the teammate tool.
- MUST NOT use show_team_board for one named person.
- MUST NOT loop show_day or show_employee_day.
- Views exist only on show_today, show_recurring, show_additional_work, and show_projects.
- Destructive tools need confirm=true.`,
  websiteUrl: env.erpnextUrl,
  favicon: "favicon.jpg",
  icons: [
    {
      src: "favicon.jpg",
      mimeType: "image/jpeg",
      sizes: ["192x192"],
    },
  ],
  publicLandingPage: true,
};

const server = env.oauthEnabled
  ? new MCPServer<FrappeUser>({
      ...config,
      oauth: createFrappeOAuthProvider(),
    })
  : new MCPServer(config);

mountLandingIconRewrite(server);
mountExportDownloads(server);

if (env.oauthEnabled) {
  mountFrappeClientRegistration(server);
  mountAuthorizeProxy(server);
}

export const planProject = registerPlanProjectPrompt(server);
registerAttendanceResources(server);
const readTools = registerAttendanceReadTools(server);
const writeTools = registerAttendanceWriteTools(server);

export const getToday = readTools.getToday;
export const getTeamDashboard = readTools.getTeamBoard;
export const getTeammates = readTools.getTeammates;
export const getManagementDashboard = readTools.getManagementBoard;
export const getEmployeeDay = readTools.getEmployeeDay;
export const getEmployeeHistory = readTools.getEmployeeHistory;
export const getHistory = readTools.getHistory;
export const getHistoryDay = readTools.getHistoryDay;
export const getExport = readTools.getExport;
export const exportHistory = readTools.exportHistory;
export const listProjects = readTools.listProjects;
export const listRecurringTasks = readTools.listRecurring;
export const listAdditionalWork = readTools.listAdditional;
export const showToday = readTools.showToday;
export const showTeamBoard = readTools.showTeamBoard;
export const listTeammates = readTools.listTeammates;
export const showManagementBoard = readTools.showManagementBoard;
export const showHistory = readTools.showHistory;
export const showDay = readTools.showDay;
export const showEmployeeDay = readTools.showEmployeeDay;
export const showEmployeeHistory = readTools.showEmployeeHistory;
export const showRecurring = readTools.showRecurring;
export const showAdditionalWork = readTools.showAdditionalWork;
export const showProjects = readTools.showProjects;

export const checkIn = writeTools.checkIn;
export const checkOut = writeTools.checkOut;
export const resetCheckin = writeTools.resetCheckin;
export const updateHalfDay = writeTools.updateHalfDay;
export const saveRecurringTask = writeTools.saveRecurring;
export const deleteRecurringTask = writeTools.deleteRecurring;
export const saveAdditionalWork = writeTools.saveAdditional;
export const deleteAdditionalWork = writeTools.deleteAdditional;
export const addTasks = writeTools.addTasks;
export const deleteCarriedTask = writeTools.deleteCarried;

export default server;
