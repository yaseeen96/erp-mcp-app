import { ModelContext, useCallTool, useOpenExternal, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { GroupedBar, HoursLine } from "../_shared/charts.js";
import {
  AppShell,
  Card,
  ErrorState,
  PendingState,
  Pill,
  SiteLink,
  asArray,
  asRecord,
  statusTone,
  text,
  tw,
} from "../_shared/ui.js";

export default function HistoryView() {
  const view = useToolContext<"show-history">();
  const historyTool = useCallTool("get-history");
  const dayTool = useCallTool("get-history-day");
  const exportTool = useCallTool("export-history");
  const openExternal = useOpenExternal();
  const [state, setState] = useViewState({ page: view.toolInput?.page ?? 0, date: "" });
  const [selectedDate, setSelectedDate] = useState(state.date);

  const output =
    historyTool.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const history = asRecord(
    historyTool.data?._meta?.history ?? (view.status === "ready" ? view.meta?.history : undefined)
  );
  const logs = asArray(history?.logs);
  const day = asRecord(dayTool.data?._meta?.detail);
  const dayTasks = asArray(day?.tasks);

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="History" title="My history">
        <PendingState label="Loading attendance history…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="History" title="My history">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="Personal"
      title={output?.employeeName || "My history"}
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <button
            type="button"
            className={tw.btn}
            disabled={historyTool.isPending || state.page <= 0}
            onClick={() => {
              const page = Math.max(0, state.page - 1);
              setState({ ...state, page });
              void historyTool.callTool({ page }).catch(() => {});
            }}
          >
            Newer
          </button>
          <button
            type="button"
            className={tw.btn}
            disabled={historyTool.isPending || !output?.hasMore}
            onClick={() => {
              const page = state.page + 1;
              setState({ ...state, page });
              void historyTool.callTool({ page }).catch(() => {});
            }}
          >
            Older
          </button>
          <button
            type="button"
            className={tw.btn}
            disabled={exportTool.isPending}
            onClick={() => {
              void exportTool
                .callTool({ format: "xlsx", page: state.page })
                .then((result) => {
                  for (const file of result.structuredContent.files) {
                    void openExternal({ url: file.url });
                  }
                })
                .catch(() => {});
            }}
          >
            {exportTool.isPending ? "Exporting…" : "Excel"}
          </button>
          <button
            type="button"
            className={tw.btn}
            disabled={exportTool.isPending}
            onClick={() => {
              void exportTool
                .callTool({ format: "pdf", page: state.page })
                .then((result) => {
                  for (const file of result.structuredContent.files) {
                    void openExternal({ url: file.url });
                  }
                })
                .catch(() => {});
            }}
          >
            PDF
          </button>
          <SiteLink path="/my-history" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output?.employeeName ?? "Employee"} history page ${state.page}: ${output?.summary ?? ""}`}
      />
      <div className={tw.grid}>
        <Card title="Net hours trend">
          <HoursLine labels={output?.hoursChart.labels ?? []} values={output?.hoursChart.values ?? []} />
        </Card>
        <Card title="Task completion">
          <GroupedBar
            labels={output?.tasksChart.labels ?? []}
            series={[
              { key: "Done", values: output?.tasksChart.done ?? [], color: "#EE1C29" },
              { key: "Total", values: output?.tasksChart.total ?? [], color: "#F5C16C" },
            ]}
          />
        </Card>
      </div>
      <Card title="Days">
        <table className={tw.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Tasks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={text(log.date)}>
                <td>
                  {text(log.date)}{" "}
                  {log.is_late ? <Pill tone="warn">Late</Pill> : null}
                </td>
                <td>{text(log.login_time)}</td>
                <td>{text(log.logout_time)}</td>
                <td>{text(log.net_hours)}</td>
                <td>
                  {text(log.done_tasks, "0")}/{text(log.total_tasks, "0")}
                </td>
                <td>
                  <button
                    type="button"
                    className={tw.btn}
                    onClick={() => {
                      const date = text(log.date, "");
                      setSelectedDate(date);
                      setState({ ...state, date });
                      void dayTool.callTool({ date }).catch(() => {});
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {selectedDate ? (
        <Card title={`Detail · ${selectedDate}`}>
          {dayTool.isPending ? <PendingState label="Loading day…" /> : null}
          {dayTool.error ? <ErrorState message={dayTool.error.message} /> : null}
          {dayTasks.length ? (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Actual</th>
                </tr>
              </thead>
              <tbody>
                {dayTasks.map((task) => (
                  <tr key={text(task.name)}>
                    <td>{text(task.description)}</td>
                    <td>
                      <Pill tone={statusTone(text(task.status))}>{text(task.status)}</Pill>
                    </td>
                    <td>{text(task.actual_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !dayTool.isPending ? (
            <p className={tw.empty}>Select a day to inspect tasks.</p>
          ) : null}
        </Card>
      ) : null}
      {exportTool.error ? <ErrorState message={exportTool.error.message} /> : null}
    </AppShell>
  );
}
