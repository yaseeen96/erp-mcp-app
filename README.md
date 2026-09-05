# ST Attendance MCP App

Per-user MCP server for [ST Attendance Tracker](https://st-erpv15.frappe.cloud/) on ERPNext v15. Employees sign in with the existing Frappe **Login with Google** page. Tools and React Views call `st_attendance_tracker.api` as that user.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector).

With `ERPNEXT_OAUTH=1` (default), the MCP transport expects a Frappe bearer token. Ask a System Manager to enable **OAuth Settings** (auth-server metadata, protected-resource metadata, Dynamic Client Registration) on the ERPNext site. Until that is on, set `ERPNEXT_OAUTH=0` and use an API key/secret for local Inspector testing.

## Views

- `show-today` — check-in / EOD and today's task chart
- `show-team-board` — Team Leader KPIs and charts
- `show-management-board` — HR department charts and rankings
- `show-history` — personal hours trend

## Scripts

```bash
npm run typecheck
npm run build
npm run start
npm run deploy
```
