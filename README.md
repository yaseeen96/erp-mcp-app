# ST Attendance MCP App

Per-user MCP App for [ST Attendance Tracker](https://st-erpv15.frappe.cloud/) on ERPNext v15. Employees sign in on the Frappe login page with **Google** or **email and password**. Tools and Views call `st_attendance_tracker.api` as that user.

## Run locally

```bash
cp .env.example .env
# Set FRAPPE_OAUTH_CLIENT_ID and FRAPPE_OAUTH_CLIENT_SECRET
npm install
npm run dev
```

Open [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector). Connect `http://localhost:3000/mcp`, then Authenticate.

Desk → OAuth Client **ST Attendance MCP**:

- Redirect URI (exact): `http://localhost:3000/mcp/inspector/oauth/callback`
- Scopes: `all openid` on **one line** (space-separated)

## Views

| Tool | What it opens |
| --- | --- |
| `show-today` | Check-in / EOD workspace |
| `show-day` | One personal date |
| `show-history` | Recent days and hours trend |
| `show-employee-day` | A teammate's day (TL / HR) |
| `show-team-board` | Team Leader roster and charts |
| `show-management-board` | HR company board |
| `show-projects` | Project groups |
| `show-recurring` | Recurring templates |
| `show-additional-work` | Extra hours |
| `export-history` | Excel / PDF download |

Writes go through `check-in`, `check-out`, `add-tasks`, and the other attendance tools. Destructive tools need `confirm=true`.

## Deploy

```bash
npm run typecheck
npm run build
npm run deploy -- --name st-attendance --env-file .env
```

After the cloud URL is known, set `MCP_PUBLIC_URL` to that origin (no trailing slash) and add the same host’s redirect URI on the Frappe OAuth Client:

`https://<your-mcp-host>/mcp/inspector/oauth/callback`

Pass secrets with `--env` / `--env-file`, or `mcp-use servers env add KEY=VALUE --server <id> --sensitive`. Do not commit `.env`.

## Scripts

```bash
npm run typecheck
npm run build
npm run start
npm run deploy
```
