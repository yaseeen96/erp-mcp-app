import type { MCPServer } from "mcp-use";
import { env } from "./env.js";

export const AUTHORIZE_PATH = "/oauth/authorize";

function stripQueryParam(search: string, key: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) {
    return "";
  }
  return raw
    .split("&")
    .filter((part) => {
      const eq = part.indexOf("=");
      const name = decodeURIComponent(eq === -1 ? part : part.slice(0, eq));
      return name !== key;
    })
    .join("&");
}

/** ChatGPT reconnects with the previous user's id_token_hint. Frappe then 400s if Google lands on anyone else. */
export function frappeAuthorizeRedirect(requestUrl: string): string {
  const incoming = new URL(requestUrl);
  const query = stripQueryParam(incoming.search, "id_token_hint");
  const dest = `${env.erpnextUrl}/api/method/frappe.integrations.oauth2.authorize`;
  return query ? `${dest}?${query}` : dest;
}

export function mountAuthorizeProxy<TUser>(server: MCPServer<TUser>): void {
  server.get(AUTHORIZE_PATH, (c) => {
    return c.redirect(frappeAuthorizeRedirect(c.req.url), 302);
  });
}
