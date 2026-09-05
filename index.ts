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
  version: "1.1.0",
  description: "Per-user ERPNext attendance MCP App for ST Attendance Tracker",
  instructions:
    "Read the current tool schemas. export-history HAS a date argument (YYYY-MM-DD) for a single-day file. Never say it lacks a date filter. Precise ask (outcome and needed args are clear) → call exactly one tool. A date plus PDF/Excel/export is one outcome: export-history only — do not also call show-day or show-history. Vague or ambiguous ask (see vs download, which day, PDF vs Excel, whose day) → do not call a tool. Ask one short question with 2–4 options, then wait. Two tools only if they clearly asked for two outcomes. Never pair a get/list helper with its show-* twin, add-tasks with check-in unless they asked both, or loop show-day. Never draw ASCII charts. Login is Google or email/password. Route when clear: PDF/Excel/export/download → export-history (named day → date=YYYY-MM-DD, omit page; PDF → format=pdf; Excel → format=xlsx). See one day → show-day. Today → show-today. Week → show-history. Teammates → show-team-board. One teammate → show-employee-day. HR → show-management-board. Recurring → show-recurring. Extra hours → show-additional-work. Project list → show-projects. Plan a product and they did not say check in: search, ask only if needed, then add-tasks (never punches). Check in / punch in / start the day → check-in now. Finish day → check-out. Destructive tools need confirm=true.",
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
