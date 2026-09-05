import { MCPServer } from "mcp-use";
import { mountFrappeClientRegistration } from "./lib/dcr.js";
import { mountExportDownloads } from "./lib/export-store.js";
import { mountLandingIconRewrite } from "./lib/landing-brand.js";
import { env } from "./lib/env.js";
import { createFrappeOAuthProvider } from "./lib/frappe-oauth.js";
import type { FrappeUser } from "./lib/types.js";
import { registerPlanProjectPrompt } from "./prompts/plan-project.js";
import { registerAttendanceReadTools } from "./tools/attendance-read.js";
import { registerAttendanceWriteTools } from "./tools/attendance-write.js";

const config = {
  name: "erp-mcp-app",
  title: "ST Attendance",
  version: "1.0.0",
  description: "Per-user ERPNext attendance MCP App for ST Attendance Tracker",
  instructions:
    "If the user asks for several independent things in one prompt, call those show-* or write tools in the same turn. Do not pair a get/list helper with its show-* twin, do not call add-tasks and check-in together unless they asked both, and do not loop show-day or show-employee-day. Never draw ASCII charts. Login is Google or email/password. Reads: today → show-today (includes today's and planned project names); one personal date → show-day; last week / what I worked on → show-history once; who is on my team / teammates → show-team-board (roster is in people); a teammate's day → show-employee-day; team → show-team-board; HR/company → show-management-board; recurring → show-recurring; extra hours → show-additional-work; all projects → show-projects; Excel/PDF only → export-history (skip show-history unless they also asked to see the board; one named day → date=YYYY-MM-DD, omit page). Omit topics unless they ask for one slice. Planning a named product or app (research Uber Clone, plan tasks, what should I work on) and they did **not** ask to check in: use your web search / browse first, ask a few short questions only if scope is unclear, then call add-tasks with the real breakdown — do not skip search, do not invent a single placeholder, do not open show-today instead. Writes: save researched projects/tasks without punching → add-tasks only (merges, never checks in; several projects in one call or call again); they may skip planning and check in immediately — if they say check in / punch in / start the day, call check-in now (pass any projects/tasks they named; includes earlier add-tasks work). Do not delay check-in to research; finish day → check-out once with every extra project/task. Never refuse add-tasks because it would check them in. Destructive tools need confirm=true.",
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
}

export const planProject = registerPlanProjectPrompt(server);
const readTools = registerAttendanceReadTools(server);
const writeTools = registerAttendanceWriteTools(server);

export const getToday = readTools.getToday;
export const getTeamDashboard = readTools.getTeamBoard;
export const getManagementDashboard = readTools.getManagementBoard;
export const getEmployeeDay = readTools.getEmployeeDay;
export const getHistory = readTools.getHistory;
export const getHistoryDay = readTools.getHistoryDay;
export const getExport = readTools.getExport;
export const exportHistory = readTools.exportHistory;
export const listProjects = readTools.listProjects;
export const listRecurringTasks = readTools.listRecurring;
export const listAdditionalWork = readTools.listAdditional;
export const showToday = readTools.showToday;
export const showTeamBoard = readTools.showTeamBoard;
export const showManagementBoard = readTools.showManagementBoard;
export const showHistory = readTools.showHistory;
export const showDay = readTools.showDay;
export const showEmployeeDay = readTools.showEmployeeDay;
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
