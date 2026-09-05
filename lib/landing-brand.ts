import type { MCPServer } from "mcp-use";

const PUBLIC_FAVICON = "favicon.jpg";

/** Point landing HTML at the public JPEG so Chrome's /favicon.ico cache cannot keep the old mark. */
export function mountLandingIconRewrite<TUser>(server: MCPServer<TUser>): void {
  const publicIcon = `${server.basePath}/_mcp-use/public/${PUBLIC_FAVICON}`;

  server.app.use("*", async (c, next) => {
    await next();
    const type = c.res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("text/html")) {
      return;
    }

    const html = await c.res.text();
    if (!html.includes("favicon.ico")) {
      return;
    }

    const rewritten = html.replace(/https?:\/\/[^"'>\s]+\/favicon\.ico/g, publicIcon);
    const headers = new Headers(c.res.headers);
    headers.delete("content-length");
    c.res = new Response(rewritten, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  });
}
