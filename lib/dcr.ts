import type { MCPServer } from "mcp-use";
import { env } from "./env.js";

const REGISTER_PATH = "/oauth/register";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function mountFrappeClientRegistration<TUser>(server: MCPServer<TUser>): void {
  if (!env.oauthClientId) {
    return;
  }

  server.post(REGISTER_PATH, async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const redirectUris = asStringArray(body.redirect_uris);
    return c.json(
      {
        client_id: env.oauthClientId,
        ...(env.oauthClientSecret ? { client_secret: env.oauthClientSecret } : {}),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        redirect_uris:
          redirectUris.length > 0
            ? redirectUris
            : [`${env.mcpPublicUrl}/mcp/inspector/oauth/callback`],
        grant_types: asStringArray(body.grant_types).length
          ? asStringArray(body.grant_types)
          : ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: env.oauthClientSecret
          ? "client_secret_post"
          : "none",
        client_name:
          typeof body.client_name === "string" ? body.client_name : "ST Attendance MCP",
        scope: typeof body.scope === "string" ? body.scope : "openid all",
      },
      201
    );
  });
}
