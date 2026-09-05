import { MCPServer } from "mcp-use";
import { mountFrappeClientRegistration } from "./lib/dcr.js";
import { mountExportDownloads } from "./lib/export-store.js";
import { env } from "./lib/env.js";
import { createFrappeOAuthProvider } from "./lib/frappe-oauth.js";
import type { FrappeUser } from "./lib/types.js";
import { registerAttendanceReadTools } from "./tools/attendance-read.js";
import { registerAttendanceWriteTools } from "./tools/attendance-write.js";

const config = {
  name: "erp-mcp-app",
  title: "ST Attendance",
  version: "1.0.0",
  description: "Per-user ERPNext attendance MCP App for ST Attendance Tracker",
  instructions:
    "Authenticate as the Frappe user on the ERPNext page (Login with Google, or email and password). Use show-today, show-team-board, show-management-board, or show-history to open charts. For 'what did I work on' or the past week, call get-history once — it already includes daily task titles. Do not loop per-day history tools. When the user asks for Excel, spreadsheet, or PDF, call export-history and return the files. If they only say PDF or Excel, omit topics for the full report. If they ask for only days worked, hours, tasks, or in/out, set topics to that slice — Excel and PDF both follow topics. Do not paste CSV. Writes go through check-in, check-out, and the other attendance tools. Destructive tools require confirm=true.",
  websiteUrl: env.erpnextUrl,
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
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

mountExportDownloads(server);

if (env.oauthEnabled) {
  mountFrappeClientRegistration(server);
}

const readTools = registerAttendanceReadTools(server);
const writeTools = registerAttendanceWriteTools(server);

export const getToday = readTools.getToday;
export const getTeamDashboard = readTools.getTeamBoard;
export const getManagementDashboard = readTools.getManagementBoard;
export const getEmployeeDay = readTools.getEmployeeDay;
export const getHistory = readTools.getHistory;
export const getHistoryDay = readTools.getHistoryDay;
export const exportHistory = readTools.exportHistory;
export const listRecurringTasks = readTools.listRecurring;
export const listAdditionalWork = readTools.listAdditional;
export const showToday = readTools.showToday;
export const showTeamBoard = readTools.showTeamBoard;
export const showManagementBoard = readTools.showManagementBoard;
export const showHistory = readTools.showHistory;

export const checkIn = writeTools.checkIn;
export const checkOut = writeTools.checkOut;
export const resetCheckin = writeTools.resetCheckin;
export const updateHalfDay = writeTools.updateHalfDay;
export const saveRecurringTask = writeTools.saveRecurring;
export const deleteRecurringTask = writeTools.deleteRecurring;
export const saveAdditionalWork = writeTools.saveAdditional;
export const deleteAdditionalWork = writeTools.deleteAdditional;
export const deleteCarriedTask = writeTools.deleteCarried;

export default server;
