import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { GroupedBar, HoursBar, StatusDonut, useBrandSeriesColors } from "../_shared/charts.js";
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
  text,
  tw,
} from "../_shared/ui.js";

export default function ManagementBoardView() {
  const view = useToolContext<"show-management-board">();
  const reload = useCallTool("get-management-dashboard");
  const seriesColors = useBrandSeriesColors();
  const [state, setState] = useViewState({ date: view.toolInput?.date ?? "" });

  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const board = asRecord(
    reload.data?._meta?.board ?? (view.status === "ready" ? view.meta?.board : undefined)
  );
  const rankings = asArray(board?.rankings);
  const departments = asArray(board?.departments);

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="HR" title="Management board">
        <PendingState label="Loading company attendance…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="HR" title="Management board">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="HR Manager"
      title="Management board"
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
          <SiteLink path="/management-dashboard" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`Management ${output?.date ?? ""}: ${output?.kpis.checkedIn ?? 0}/${output?.kpis.total ?? 0} in, ${output?.kpis.missing ?? 0} missing.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Headcount" value={output?.kpis.total ?? 0} />
        <Kpi label="Checked in" value={output?.kpis.checkedIn ?? 0} />
        <Kpi label="EOD" value={output?.kpis.eodDone ?? 0} />
        <Kpi label="Leave" value={output?.kpis.onLeave ?? 0} />
        <Kpi label="Missing" value={output?.kpis.missing ?? 0} />
      </div>
      <div className={tw.grid}>
        <Card title="Company mix">
          <StatusDonut labels={output?.statusChart.labels ?? []} values={output?.statusChart.values ?? []} />
        </Card>
        <Card title="Hours ranking">
          <HoursBar labels={output?.rankingChart.labels ?? []} values={output?.rankingChart.values ?? []} />
        </Card>
      </div>
      <Card title="Departments">
        <GroupedBar
          labels={output?.departmentChart.labels ?? []}
          series={[
            { key: "In", values: output?.departmentChart.checkedIn ?? [], color: seriesColors.in },
            { key: "Late", values: output?.departmentChart.late ?? [], color: seriesColors.late },
            { key: "Missing", values: output?.departmentChart.missing ?? [], color: seriesColors.missing },
          ]}
        />
      </Card>
      <Card title="Rankings">
        <table className={tw.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Employee</th>
              <th>Hours</th>
              <th>In</th>
              <th>Out</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((row, index) => (
              <tr key={text(row.employee)}>
                <td>{index + 1}</td>
                <td>
                  {text(row.employee_name)}{" "}
                  {row.is_half_day ? <Pill tone="info">Half day</Pill> : null}
                </td>
                <td>{text(row.net_hours)}</td>
                <td>{text(row.login_time)}</td>
                <td>{text(row.logout_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {departments.length ? (
        <p className={tw.sub}>{departments.length} departments reporting.</p>
      ) : null}
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
