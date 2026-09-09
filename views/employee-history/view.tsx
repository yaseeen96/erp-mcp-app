import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { GroupedBar, SmartHoursChart } from "../_shared/charts.js";
import { TopicBar, wantsTopic } from "../_shared/topics.js";
import {
  AppShell,
  Card,
  ErrorState,
  Kpi,
  PendingState,
  Pill,
  SiteLink,
  statusTone,
  tw,
} from "../_shared/ui.js";

const historyTopics = ["days", "hours", "tasks", "attendance"] as const;

function statusLabel(status: string) {
  if (status === "checked_out") {
    return "Checked out";
  }
  if (status === "checked_in") {
    return "Checked in";
  }
  return "Absent";
}

export default function EmployeeHistoryView() {
  const view = useToolContext<"view_employee_history">();
  const reload = useCallTool("get_employee_history");
  const [state, setState] = useViewState({
    employeeName: view.toolInput?.employeeName ?? "",
    when: view.toolInput?.when ?? "",
    period: view.toolInput?.period,
    from: view.toolInput?.from ?? "",
    to: view.toolInput?.to ?? "",
    topics: view.toolInput?.topics ?? [],
  });
  const [selectedDate, setSelectedDate] = useState("");
  const topics = state.topics.length ? state.topics : undefined;
  const showHours = wantsTopic(topics, "hours") || wantsTopic(topics, "days");
  const showTasks = wantsTopic(topics, "tasks");
  const showDays =
    wantsTopic(topics, "attendance") || wantsTopic(topics, "days") || wantsTopic(topics, "hours");

  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const days = output?.days ?? [];
  const selectedTasks = days.find((day) => day.date === selectedDate)?.tasks ?? [];

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Team" title="Employee history">
        <PendingState label="Loading this teammate's attendance…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Team" title="Employee history">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="Team Leader"
      title={output?.employeeName || "Employee history"}
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={historyTopics}
            selected={topics}
            labels={{ days: "Days", hours: "Hours", tasks: "Tasks", attendance: "Attendance" }}
            onChange={(next) => setState({ ...state, topics: next ?? [] })}
          />
          <SiteLink path="/team-dashboard" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output?.summary ?? ""} Use weekday labels from the tool. Do not invent weekdays.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Attended" value={`${output?.attendedDays ?? 0}/${days.length}`} />
        <Kpi
          label="Hours"
          value={`${(days.reduce((sum, day) => sum + day.hours, 0) || 0).toFixed(1)}h`}
        />
        <Kpi label="From" value={output?.from ? `${output.days[0]?.weekday ?? ""} ${output.from}` : "—"} />
        <Kpi label="To" value={output?.to ? `${days.at(-1)?.weekday ?? ""} ${output.to}` : "—"} />
      </div>
      {(output?.hoursChart.labels.length ?? 0) >= 1 && (showHours || showTasks) ? (
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
                <th>Status</th>
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
                    {day.weekday} {day.date}
                  </td>
                  <td>
                    <Pill
                      tone={
                        day.status === "checked_out"
                          ? "good"
                          : day.status === "checked_in"
                            ? "warn"
                            : "muted"
                      }
                    >
                      {statusLabel(day.status)}
                    </Pill>
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
                      onClick={() => setSelectedDate(day.date)}
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
        <Card title={`Detail · ${days.find((day) => day.date === selectedDate)?.weekday ?? ""} ${selectedDate}`}>
          {selectedTasks.length ? (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Actual</th>
                </tr>
              </thead>
              <tbody>
                {selectedTasks.map((task) => (
                  <tr key={`${task.description}-${task.status}-${task.project}`}>
                    <td>{task.description}</td>
                    <td>{task.project || "—"}</td>
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
    </AppShell>
  );
}
