# ST Attendance MCP App

Per-user MCP App for [ST Attendance Tracker](https://st-erpv15.frappe.cloud/) on ERPNext v15. Employees sign in on the Frappe login page with **Google** or **email and password**. Tools call `st_attendance_tracker.api` as that user.

**1.5.0 is a breaking rename.** Reconnect ChatGPT, Claude, Cursor, and other hosts after upgrade. Tool names are now `snake_case` (`show_today`, `list_teammates`, `check_in`).

## Run locally

```bash
cp .env.example .env
# Set FRAPPE_OAUTH_CLIENT_ID and FRAPPE_OAUTH_CLIENT_SECRET
npm install
npm run dev
```

Open [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector). Connect `http://localhost:3000/mcp`, then Authenticate.

Desk → OAuth Client **ST Attendance MCP**. Redirect URIs and scopes must each be on **one line**, space-separated (newlines do not match):

`http://localhost:3000/mcp/inspector/oauth/callback https://attendance.mcp.standardtouch.com/mcp/inspector/oauth/callback https://inspector.manufact.com/inspector/oauth/callback https://chatgpt.com/connector/oauth/nCDGjbkwhCLX https://claude.ai/api/mcp/auth_callback https://claude.com/api/mcp/auth_callback https://antigravity.google/oauth-callback https://www.cursor.com/agents/mcp/oauth/callback http://localhost:8787/callback http://127.0.0.1:8787/callback cursor://anysphere.cursor-mcp/oauth/callback https://vscode.dev/redirect https://insiders.vscode.dev/redirect http://127.0.0.1:33418 http://127.0.0.1:33418/ http://localhost:33418 http://localhost:33418/`

Default Redirect URI (separate field, one URL): `https://attendance.mcp.standardtouch.com/mcp/inspector/oauth/callback`

Scopes: `all openid`

## Tools and Views

Ask/report tools return a **spoken script** in `content` (every name, weekday, hours, tasks). Voice and chat must use that text. **Views exist only** on these four interactive workspaces:

| Tool | What it opens |
| --- | --- |
| `show_today` | Check-in / EOD workspace |
| `show_recurring` | Recurring templates |
| `show_additional_work` | Extra hours form |
| `show_projects` | Pick projects and add tasks |

Text-only (no View): `list_teammates`, `show_team_board`, `show_management_board`, `show_employee_day`, `show_employee_history`, `show_day`, `show_history`, `export_history`.

Resources: `resource://teammates`, `resource://projects`.

Writes: `add_tasks` saves projects and tasks without punching in. `check_in` starts the day and sends planned work. `check_out` finishes the day. Destructive tools need `confirm=true`.

## Deploy

```bash
npm run typecheck
npm run build
npm run deploy -- --name st-attendance --env-file .env
```

After the cloud URL is known, set `MCP_PUBLIC_URL` to that origin (no trailing slash). The hosted Inspector (`Open in Inspector`) uses `https://inspector.manufact.com/inspector/oauth/callback` — that URI must also be on the Frappe OAuth Client.

Pass secrets with `--env` / `--env-file`, or `mcp-use servers env add KEY=VALUE --server <id> --sensitive`. Do not commit `.env`.

## Scripts

```bash
npm run typecheck
npm run build
npm run start
npm run deploy
```
