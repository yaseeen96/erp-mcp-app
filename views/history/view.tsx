import { ModelContext, useCallTool, useOpenExternal, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { GroupedBar, SmartHoursChart } from "../_shared/charts.js";
import { saveExportedFile } from "../_shared/download.js";
import { TopicBar, wantsTopic } from "../_shared/topics.js";
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

const historyTopics = ["days", "hours", "tasks", "attendance"] as const;

export default function HistoryView() {
  const view = useToolContext<"show-history">();
  const historyTool = useCallTool("get-history");
  const exportTool = useCallTool("get-export");
  const openExternal = useOpenExternal();
  const [state, setState] = useViewState({
    page: view.toolInput?.page ?? 0,
    date: "",
    topics: view.toolInput?.topics ?? [],
  });
  const [selectedDate, setSelectedDate] = useState(state.date);
  const [exportError, setExportError] = useState("");
  const topics = state.topics.length ? state.topics : undefined;
  const showHours = wantsTopic(topics, "hours") || wantsTopic(topics, "days");
  const showTasks = wantsTopic(topics, "tasks");
  const showDays =
    wantsTopic(topics, "attendance") || wantsTopic(topics, "days") || wantsTopic(topics, "hours");

  const output =
    historyTool.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const history = asRecord(
    historyTool.data?._meta?.history ?? (view.status === "ready" ? view.meta?.history : undefined)
  );
  const logs = asArray(history?.logs);
  const days = output?.days ?? [];
  const selectedTasks = days.find((day) => day.date.slice(0, 10) === selectedDate.slice(0, 10))?.tasks ?? [];
  const lateDates = new Set(
    logs.filter((log) => log.is_late).map((log) => text(log.date, "").slice(0, 10))
  );

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
          <TopicBar
            all={historyTopics}
            selected={topics}
            labels={{ days: "Days", hours: "Hours", tasks: "Tasks", attendance: "Attendance" }}
            onChange={(next) => setState({ ...state, topics: next ?? [] })}
          />
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
              setExportError("");
              void exportTool
                .callTool({ format: "xlsx", page: state.page, topics })
                .then(async (result) => {
                  for (const file of result.structuredContent.files) {
                    await saveExportedFile(file, openExternal);
                  }
                })
                .catch((error: unknown) => {
                  setExportError(error instanceof Error ? error.message : "Excel export failed.");
                });
            }}
          >
            {exportTool.isPending ? "Exporting…" : "Excel"}
          </button>
          <button
            type="button"
            className={tw.btn}
            disabled={exportTool.isPending}
            onClick={() => {
              setExportError("");
              void exportTool
                .callTool({ format: "pdf", page: state.page, topics })
                .then(async (result) => {
                  for (const file of result.structuredContent.files) {
                    await saveExportedFile(file, openExternal);
                  }
                })
                .catch((error: unknown) => {
                  setExportError(error instanceof Error ? error.message : "PDF export failed.");
                });
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
      {(output?.hoursChart.labels.length ?? 0) >= 2 && (showHours || showTasks) ? (
        <div className={tw.grid}>
          {showHours ? (
            <Card title="Net hours by day">
              <SmartHoursChart
                labels={output?.hoursChart.labels ?? []}
                values={output?.hoursChart.values ?? []}
              />
            </Card>
          ) : null}
          {showTasks ? (
            <Card title="Task completion by day">
              <GroupedBar
                labels={output?.tasksChart.labels ?? []}
                series={[
                  { key: "Done", values: output?.tasksChart.done ?? [], color: "#EE1C29" },
                  { key: "Total", values: output?.tasksChart.total ?? [], color: "#F5C16C" },
                ]}
              />
            </Card>
          ) : null}
        </div>
      ) : null}
      {showDays ? (
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
            {days.map((day) => (
              <tr key={day.date}>
                <td>
                  {day.date}{" "}
                  {lateDates.has(day.date.slice(0, 10)) ? <Pill tone="warn">Late</Pill> : null}
                </td>
                <td>{day.login || "—"}</td>
                <td>{day.logout || "—"}</td>
                <td>{day.hours.toFixed(1)}h</td>
                <td>
                  {day.done}/{day.total}
                </td>
                <td>
                  <button
                    type="button"
                    className={tw.btn}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setState({ ...state, date: day.date });
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
      ) : null}
      {selectedDate ? (
        <Card title={`Detail · ${selectedDate}`}>
          {selectedTasks.length ? (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Actual</th>
                </tr>
              </thead>
              <tbody>
                {selectedTasks.map((task) => (
                  <tr key={`${task.description}-${task.status}-${task.project}`}>
                    <td>{task.description}</td>
                    <td>
                      <Pill tone={statusTone(task.status)}>{task.status}</Pill>
                    </td>
                    <td>{task.actualTime || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={tw.empty}>No tasks recorded for this day.</p>
          )}
        </Card>
      ) : null}
      {exportTool.error ? <ErrorState message={exportTool.error.message} /> : null}
      {exportError ? <ErrorState message={exportError} /> : null}
    </AppShell>
  );
}
