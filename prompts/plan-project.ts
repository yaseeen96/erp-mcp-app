import type { MCPServer } from "mcp-use";
import { z } from "zod";
import type { FrappeUser } from "../lib/types.js";

export function registerPlanProjectPrompt(server: MCPServer<FrappeUser> | MCPServer) {
  return server.prompt(
    {
      name: "plan-project",
      title: "Plan a project",
      description:
        "Search the web, talk through scope, then save real tasks with add_tasks. Does not check in.",
      schema: z.object({
        project: z.string().describe("Project name, e.g. Uber Clone"),
        notes: z
          .string()
          .optional()
          .describe("Anything the user already said about stack, users, or today's focus"),
      }),
    },
    ({ project, notes }) => ({
      description: `Research ${project}, discuss it, then save tasks without checking in.`,
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Help me plan work for "${project}".`,
              notes?.trim() ? `What I already said: ${notes.trim()}` : "",
              "",
              "1. Use web search (and any host browse/search tools) for this product or similar apps: users, main flows, architecture, and a sensible first slice.",
              "2. Ask me short questions only when scope is unclear (platform, stack, who it is for, today's focus). If I already said add it, skip extra questions.",
              "3. Propose concrete tasks with estimates (e.g. 1h 30m). Several projects are fine.",
              "4. Call add_tasks with projects: [{ name, tasks: [{ description, estimated_time }] }]. That does not check me in.",
              "5. Call check_in only if I explicitly ask to check in, punch in, or start the day.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );
}
