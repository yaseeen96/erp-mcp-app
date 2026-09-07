import type { MCPServer } from "mcp-use";
import * as attendance from "./attendance.js";
import { loadProjects } from "./projects.js";
import { summarizeTeammates } from "./summaries.js";
import type { AttendanceCtx, FrappeUser } from "./types.js";

function resourceError(uri: URL, message: string) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ error: message }),
      },
    ],
  };
}

export function registerAttendanceResources(server: MCPServer<FrappeUser> | MCPServer) {
  server.resource(
    {
      name: "teammates",
      uri: "resource://teammates",
      title: "Teammates",
      description:
        "People on the signed-in user's team: name, employeeId, designation, and status. Use before show_employee_day or show_employee_history.",
      mimeType: "application/json",
    },
    async (uri, ctx) => {
      try {
        const board = await attendance.getTeamDashboard(ctx as AttendanceCtx);
        const data = summarizeTeammates(board);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                date: data.date,
                names: data.names,
                teammates: data.teammates,
              }),
            },
          ],
        };
      } catch (error) {
        return resourceError(
          uri,
          error instanceof Error ? error.message : "Could not load teammates."
        );
      }
    }
  );

  server.resource(
    {
      name: "projects",
      uri: "resource://projects",
      title: "Projects",
      description: "Today's known project names for the signed-in user.",
      mimeType: "application/json",
    },
    async (uri, ctx) => {
      try {
        const { data } = await loadProjects(ctx as AttendanceCtx);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                date: data.date,
                names: data.projects.map((row) => row.name),
                projects: data.projects.map((row) => ({
                  name: row.name,
                  todayCount: row.todayCount,
                })),
              }),
            },
          ],
        };
      } catch (error) {
        return resourceError(
          uri,
          error instanceof Error ? error.message : "Could not load projects."
        );
      }
    }
  );
}
