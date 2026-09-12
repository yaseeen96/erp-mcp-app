import type { MCPServer } from "mcp-use";
import { env } from "./env.js";

const PUBLIC_FAVICON = "favicon.jpg";
const SERVER_NAME = "st_attendance";

/** Public MCP endpoint (no trailing slash on origin). */
function mcpEndpoint(): string {
  return `${env.mcpPublicUrl.replace(/\/+$/, "")}/mcp`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function codeBlock(text: string): string {
  const safe = escapeHtml(text);
  return `<div class="code-block"><pre data-copy="${safe}">${safe}</pre></div>`;
}

function rewriteClaudeCodeSteps(html: string): string {
  const url = mcpEndpoint();
  const command = `claude mcp add --transport http ${SERVER_NAME} ${url}`;

  const withTab = html.replace(
    /(data-tab="claude-code"[^>]*>)Claude Code(<\/button>)/,
    "$1Claude$2",
  );

  return withTab.replace(
    /<div id="panel-claude-code" class="tab-panel(?: active)?">[\s\S]*?(?=<div id="panel-)/,
    () => `<div id="panel-claude-code" class="tab-panel active">
        <h3>Connect with Claude</h3>
        <p><strong>Claude Desktop</strong> or <strong>claude.ai</strong> \u2014 no terminal.</p>
        <ol class="steps">
          <li>Settings \u2192 Customize \u2192 Connectors \u2192 Add \u2192 Add custom connector. (Developer is only for local MCP. Do not use Edit config.)</li>
          <li>Name it Attendance MCP. Paste this URL:
            ${codeBlock(url)}
          </li>
          <li>Continue, then Connect, and sign in with Google or email/password on the Frappe page</li>
          <li>In a chat, open + \u2192 Connectors and turn it on. After 1.5.0, reconnect so Claude picks up snake_case tool names</li>
        </ol>
        <p style="text-align:center;margin:1.25rem 0 1rem;color:#64748b;font-weight:700;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase">or</p>
        <p><strong>Claude Code</strong> in the terminal. The Desktop app does not install the <code>claude</code> command \u2014 if you see <code>command not found</code>, use Desktop above, or install Claude Code first.</p>
        <ol class="steps">
          <li>Install Claude Code (once), then reopen the terminal:
            ${codeBlock("curl -fsSL https://claude.ai/install.sh | bash")}
          </li>
          <li>Add this server:
            ${codeBlock(command)}
          </li>
          <li>Run <code>/mcp</code> and sign in when Frappe asks</li>
        </ol>
      </div>
      `,
  );
}

function rewriteAntigravitySteps(html: string): string {
  const url = mcpEndpoint();
  const config = `{
  "mcpServers": {
    "${SERVER_NAME}": {
      "serverUrl": "${url}"
    }
  }
}`;

  const withTab = html.replace(
    /(<button type="button" class="tab" role="tab" data-tab="chatgpt"[^>]*>ChatGPT<\/button>)/,
    `$1\n        <button type="button" class="tab" role="tab" data-tab="antigravity" aria-selected="false">Antigravity</button>`,
  );

  return withTab.replace(
    /(<div id="panel-chatgpt" class="tab-panel">[\s\S]*?<\/ol>\s*<\/div>)/,
    `$1
      <div id="panel-antigravity" class="tab-panel">
        <h3>Connect with Antigravity</h3>
        <ol class="steps">
          <li>In the agent panel: \u2026 \u2192 MCP Servers \u2192 Manage MCP Servers \u2192 View raw config. Or Settings \u2192 Customizations \u2192 Installed MCP Servers \u2192 Add MCP</li>
          <li>Add this to <code>~/.gemini/config/mcp_config.json</code> (use <code>serverUrl</code>, not <code>url</code>):
            ${codeBlock(config)}
          </li>
          <li>On the Frappe OAuth Client, add this redirect URI on the same line as the others: <code>https://antigravity.google/oauth-callback</code></li>
          <li>In Antigravity: Settings \u2192 Customizations \u2192 Authenticate next to ST Attendance, then sign in with Google or email/password</li>
        </ol>
        <p>Remote URL: <code>${escapeHtml(url)}</code></p>
      </div>
    `,
  );
}

function rewriteIdeOauthNotes(html: string): string {
  return html
    .replace(
      /(<div id="panel-cursor" class="tab-panel">[\s\S]*?<p>Or add manually: Settings \u2192 MCP \u2192 Add server<\/p>)/,
      `$1
        <p>On the Frappe OAuth Client, also allow: <code>https://www.cursor.com/agents/mcp/oauth/callback</code> <code>http://localhost:8787/callback</code> <code>http://127.0.0.1:8787/callback</code> <code>cursor://anysphere.cursor-mcp/oauth/callback</code></p>`,
    )
    .replace(
      /(<div id="panel-vscode" class="tab-panel">[\s\S]*?<p>Or add manually: Settings \u2192 MCP \u2192 Add server<\/p>)/,
      `$1
        <p>On the Frappe OAuth Client, also allow: <code>https://vscode.dev/redirect</code> <code>http://127.0.0.1:33418</code> <code>http://127.0.0.1:33418/</code></p>`,
    )
    .replace(
      /(<div id="panel-vscode-insiders" class="tab-panel">[\s\S]*?<p>Or add manually: Settings \u2192 MCP \u2192 Add server<\/p>)/,
      `$1
        <p>On the Frappe OAuth Client, also allow: <code>https://insiders.vscode.dev/redirect</code> <code>http://127.0.0.1:33418</code> <code>http://127.0.0.1:33418/</code></p>`,
    );
}

function rewriteChatGptSteps(html: string): string {
  const url = mcpEndpoint();
  return html.replace(
    /(<div id="panel-chatgpt" class="tab-panel">)([\s\S]*?)(<\/div>)/,
    (_all, open: string, _body: string, close: string) => `${open}
        <h3>Connect with ChatGPT</h3>
        <ol class="steps">
          <li><strong>Enable Developer Mode:</strong> Settings \u2192 Plugins \u2192 Advanced \u2192 Developer mode</li>
          <li><strong>Add this plugin:</strong> Settings \u2192 Plugins \u2192 Browse plugins, then add: ${escapeHtml(url)}</li>
          <li><strong>Use in conversations:</strong> Choose the plugin from the Plus menu</li>
          <li><strong>After 1.5.0:</strong> Tool names changed to snake_case. Start a new chat. If tools look stale, turn the plugin off and on so ChatGPT reloads the list</li>
        </ol>
      ${close}`,
  );
}

/** Tweak the generated landing page: ST favicon and client install copy. */
export function mountLandingIconRewrite<TUser>(server: MCPServer<TUser>): void {
  const publicIcon = `${server.basePath}/_mcp-use/public/${PUBLIC_FAVICON}`;

  server.app.use("*", async (c, next) => {
    await next();
    const type = c.res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("text/html")) {
      return;
    }

    const html = await c.res.text();
    const rewritten = rewriteAntigravitySteps(
      rewriteClaudeCodeSteps(
        rewriteIdeOauthNotes(
          rewriteChatGptSteps(html.replace(/https?:\/\/[^"'>\s]+\/favicon\.ico/g, publicIcon)),
        ),
      ),
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
