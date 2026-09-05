import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { GroupedBar, HoursBar, StatusDonut } from "../_shared/charts.js";
import {
  AppShell,
  Card,
  ErrorState,
  Kpi,
  PendingState,
  Pill,
  SiteLink,
  asArray,
  asRecord,
  statusTone,
  text,
  tw,
} from "../_shared/ui.js";

export default function TeamBoardView() {
  const view = useToolContext<"show-team-board">();
  const reload = useCallTool("get-team-dashboard");
  const [state, setState] = useViewState({ date: view.toolInput?.date ?? "" });

  const output = reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const board = asRecord(reload.data?._meta?.board ?? (view.status === "ready" ? view.meta?.board : undefined));
  const employees = asArray(board?.employees);

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Team" title="Team board">
        <PendingState label="Loading team attendance…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Team" title="Team board">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="Team Leader"
      title="Team board"
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <input
            type="date"
            className={tw.control}
            value={state.date || output?.date || ""}
            onChange={(event) => {
              const date = event.target.value;
              setState({ date });
              void reload.callTool({ date }).catch(() => {});
            }}
          />
          <SiteLink path="/team-dashboard" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`Team board ${output?.date ?? ""}: ${output?.kpis.checkedIn ?? 0} in, ${output?.kpis.missing ?? 0} missing, ${output?.kpis.late ?? 0} late.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Team" value={output?.kpis.total ?? 0} />
        <Kpi label="In" value={output?.kpis.checkedIn ?? 0} />
        <Kpi label="Late" value={output?.kpis.late ?? 0} />
        <Kpi label="Missing" value={output?.kpis.missing ?? 0} />
        <Kpi label="Leave" value={output?.kpis.onLeave ?? 0} />
        <Kpi label="EOD" value={output?.kpis.eodDone ?? 0} />
      </div>
      <div className={tw.grid}>
        <Card title="Presence">
          <StatusDonut labels={output?.statusChart.labels ?? []} values={output?.statusChart.values ?? []} />
        </Card>
        <Card title="Net hours">
          <HoursBar labels={output?.hoursChart.labels ?? []} values={output?.hoursChart.values ?? []} />
        </Card>
      </div>
      <Card title="Status vs hours">
        <GroupedBar
          labels={output?.hoursChart.labels ?? []}
          series={[
            { key: "Hours", values: output?.hoursChart.values ?? [], color: "#EE1C29" },
          ]}
        />
      </Card>
      <Card title="People">
        <table className={tw.table}>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Tasks</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((row) => (
              <tr key={text(row.name)}>
                <td>
                  {text(row.employee_name)}
                  <div className={tw.sub}>{text(row.designation)}</div>
                </td>
                <td>
                  <Pill tone={statusTone(text(row.status))}>{text(row.status)}</Pill>
                </td>
                <td>{text(row.login_time)}</td>
                <td>{text(row.logout_time)}</td>
                <td>{text(row.net_hours)}</td>
                <td>
                  {text(row.done_tasks, "0")}/{text(row.total_tasks, "0")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
