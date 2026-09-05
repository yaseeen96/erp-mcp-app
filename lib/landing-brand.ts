import type { MCPServer } from "mcp-use";

const PUBLIC_FAVICON = "favicon.jpg";

function rewriteChatGptSteps(html: string): string {
  return html.replace(
    /(<div id="panel-chatgpt" class="tab-panel">)([\s\S]*?)(<\/div>)/,
    (_all, open: string, body: string, close: string) => {
      const url = body.match(/https?:\/\/[^<\s]+/)?.[0] ?? "";
      return `${open}
        <h3>Connect with ChatGPT</h3>
        <ol class="steps">
          <li><strong>Enable Developer Mode:</strong> Settings \u2192 Plugins \u2192 Advanced \u2192 Developer mode</li>
          <li><strong>Add this plugin:</strong> Settings \u2192 Plugins \u2192 Browse plugins, then add: ${url}</li>
          <li><strong>Use in conversations:</strong> Choose the plugin from the Plus menu</li>
        </ol>
      ${close}`;
    },
  );
}

/** Tweak the generated landing page: ST favicon and ChatGPT install copy. */
export function mountLandingIconRewrite<TUser>(server: MCPServer<TUser>): void {
  const publicIcon = `${server.basePath}/_mcp-use/public/${PUBLIC_FAVICON}`;

  server.app.use("*", async (c, next) => {
    await next();
    const type = c.res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("text/html")) {
      return;
    }

    const html = await c.res.text();
    const rewritten = rewriteChatGptSteps(
      html.replace(/https?:\/\/[^"'>\s]+\/favicon\.ico/g, publicIcon),
    );

    if (rewritten === html) {
      return;
    }

    const headers = new Headers(c.res.headers);
    headers.delete("content-length");
    c.res = new Response(rewritten, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  });
}
