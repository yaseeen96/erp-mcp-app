# ST Attendance MCP

Per-user [Model Context Protocol](https://modelcontextprotocol.io/) server for **ST Attendance Tracker** on [ERPNext](https://frappe.io/erpnext) v15. Connect Claude, ChatGPT, Cursor, VS Code, or other MCP clients, sign in with Google or email/password on Frappe, and ask about attendance, teammates, and check-in/out — with optional interactive dashboards.

## Live deployment

| | |
| --- | --- |
| **MCP endpoint** | https://attendance.mcp.standardtouch.com/mcp |
| **Install / landing page** | https://attendance.mcp.standardtouch.com/mcp |
| **ERPNext** | https://st-erpv15.frappe.cloud/ |

Open the MCP URL in a browser for the **Installation Guide** (Claude, Cursor, VS Code, ChatGPT, Antigravity).

### Quick connect (hosted)

**Claude Desktop / claude.ai** — Settings → Customize → Connectors → Add custom connector → name it `Attendance MCP` → paste:

```text
https://attendance.mcp.standardtouch.com/mcp
```

**Claude Code**

```bash
claude mcp add --transport http st_attendance https://attendance.mcp.standardtouch.com/mcp
```

Then run `/mcp` and sign in when Frappe asks.

**Cursor / VS Code** — use the client tabs on the landing page, or add an HTTP MCP server pointed at the same URL and complete OAuth.

## What you can do

- Ask how the team is doing (`show_team_board`) or who is on your team (`list_teammates`)
- Check in / check out with planned work (`check_in`, `check_out`)
- Add tasks without punching in (`add_tasks`)
- Open chart dashboards only when you ask to *see* the view (`view_*` tools)
- Export history to PDF/Excel (`export_history`)

Voice-safe `show_*` tools return spoken text only. `view_*` tools open MCP App UIs.

## Repository layout

```text
erp-mcp-app/
├── index.ts          # MCP server entry (tools, auth, landing)
├── lib/              # Frappe client, OAuth, env, landing rewrites
├── tools/            # MCP tool registrations (read / write)
├── views/            # MCP App React views (dashboards)
├── prompts/          # MCP prompts
├── skills/           # Skills over MCP
├── public/           # Static assets (favicon, etc.)
├── scripts/          # Helpers (e.g. OAuth checks)
└── .env.example      # Required environment variables
```

## Local setup

**Requirements:** Node.js ≥ 22.22.2

```bash
git clone https://github.com/yaseeen96/erp-mcp-app.git
cd erp-mcp-app
cp .env.example .env
```

Edit `.env`:

- `ERPNEXT_URL` — your ERPNext site (default in example)
- `FRAPPE_OAUTH_CLIENT_ID` / `FRAPPE_OAUTH_CLIENT_SECRET` — from Desk → OAuth Client **ST Attendance MCP**
- `MCP_PUBLIC_URL` — `http://localhost:3000` for local; production uses `https://attendance.mcp.standardtouch.com`

```bash
npm install
npm run dev
```

Inspector: [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector)  
Connect to `http://localhost:3000/mcp`, then Authenticate.

### Frappe OAuth Client

On the OAuth Client, **Redirect URIs** and **Scopes** must each be on **one line** (space-separated). Newlines do not match.

Include at least:

- Local: `http://localhost:3000/mcp/inspector/oauth/callback`
- Hosted: `https://attendance.mcp.standardtouch.com/mcp/inspector/oauth/callback`
- Plus callbacks for Claude, ChatGPT, Cursor, VS Code, Antigravity, and the hosted Inspector (see `.env.example` for the full list)

**Default Redirect URI** (separate field):  
`https://attendance.mcp.standardtouch.com/mcp/inspector/oauth/callback`

**Scopes:** `all openid`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local server + hot reload |
| `npm run typecheck` | Typecheck |
| `npm run build` | Production build |
| `npm run start` | Run built server |
| `npm run deploy` | Deploy with mcp-use |
| `npm run check:oauth` | Sanity-check OAuth config |

```bash
npm run typecheck
npm run build
npm run deploy -- --name st-attendance --env-file .env
```

After deploy, set `MCP_PUBLIC_URL` to the public origin (**no** trailing slash). Pass secrets with `--env` / `--env-file`, or `mcp-use servers env add`. Do not commit `.env`.

## Tools overview

| Ask (text / voice) | See the UI |
| --- | --- |
| `show_today` | `view_today` |
| `show_team_board` | `view_team_board` |
| `list_teammates` | `view_teammates` |
| `show_employee_day` | `view_employee_day` |
| `show_employee_history` | `view_employee_history` |
| `show_day` | `view_day` |
| `show_history` | `view_history` |
| `show_management_board` | `view_management_board` |
| `show_projects` | `view_projects` |
| `show_recurring` | `view_recurring` |
| `show_additional_work` | `view_additional_work` |
| `export_history` | `view_export` |

Resources: `resource://teammates`, `resource://projects`.

Writes: `add_tasks`, `check_in`, `check_out`. Destructive tools require `confirm=true`.

### Breaking changes

- **1.5.0** — tool names became `snake_case`. Reconnect clients after upgrade.
- **1.6.0** — `show_*` stays voice-safe (text only); use `view_*` for dashboards.

## Stack

- [mcp-use](https://github.com/mcp-use/mcp-use) — MCP server + Apps
- Frappe / ERPNext OAuth (per-user API calls)
- React views for interactive boards

## License

MIT
