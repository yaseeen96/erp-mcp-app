import { ModelContext } from "mcp-use/react";
import type { ReactNode } from "react";
import { HoursBar, StatusDonut } from "./charts.js";
import { wantsTopic } from "./focus.js";
import { AppShell, Card, Kpi, Pill, SiteLink, asArray, asRecord, statusTone, text, tw } from "./ui.js";

export type DayDashboardData = {
  summary: string;
  date: string;
  employeeName: string;
  login: string;
  logout: string;
  hours: number;
  late: boolean;
  taskCounts: {
    total: number;
    done: number;
    pending: number;
    inProgress: number;
    rolled: number;
    dropped: number;
  };
  statusChart: { labels: string[]; values: number[] };
  hoursChart: { labels: string[]; values: number[] };
  tasks: Array<{ description: string; status: string; project: string; actualTime: string }>;
};

export function asDayDashboard(value: unknown): DayDashboardData | undefined {
  const record = asRecord(value);
  if (!record || typeof record.date !== "string" || typeof record.employeeName !== "string") {
    return undefined;
  }
  const taskCounts = asRecord(record.taskCounts);
  const statusChart = asRecord(record.statusChart);
  const hoursChart = asRecord(record.hoursChart);
  if (!taskCounts || !statusChart || !hoursChart) {
    return undefined;
  }
  return {
    summary: text(record.summary, ""),
    date: record.date,
    employeeName: record.employeeName,
    login: text(record.login, ""),
    logout: text(record.logout, ""),
    hours: typeof record.hours === "number" ? record.hours : 0,
    late: Boolean(record.late),
    taskCounts: {
      total: Number(taskCounts.total ?? 0),
      done: Number(taskCounts.done ?? 0),
      pending: Number(taskCounts.pending ?? 0),
      inProgress: Number(taskCounts.inProgress ?? 0),
      rolled: Number(taskCounts.rolled ?? 0),
      dropped: Number(taskCounts.dropped ?? 0),
    },
    statusChart: {
      labels: Array.isArray(statusChart.labels) ? statusChart.labels.map(String) : [],
      values: Array.isArray(statusChart.values) ? statusChart.values.map(Number) : [],
    },
    hoursChart: {
      labels: Array.isArray(hoursChart.labels) ? hoursChart.labels.map(String) : [],
      values: Array.isArray(hoursChart.values) ? hoursChart.values.map(Number) : [],
    },
    tasks: asArray(record.tasks).map((task) => ({
      description: text(task.description, "Task"),
      status: text(task.status, "Pending"),
      project: text(task.project, ""),
      actualTime: text(task.actualTime, ""),
    })),
  };
}

export function DayDashboardBody({
  output,
  topics,
}: {
  output: DayDashboardData;
  topics?: Array<"hours" | "tasks">;
}) {
  const showHours = wantsTopic(topics, "hours");
  const showTasks = wantsTopic(topics, "tasks");
  const hoursLabel = output.hours ? `${output.hours.toFixed(1)}h` : "—";

  return (
    <>
      <div className={tw.kpis}>
        <Kpi label="Date" value={output.date} />
        {showHours ? <Kpi label="Hours" value={hoursLabel} /> : null}
        {showHours ? <Kpi label="In" value={output.login || "—"} /> : null}
        {showHours ? <Kpi label="Out" value={output.logout || "—"} /> : null}
        {showTasks ? (
          <Kpi label="Tasks" value={`${output.taskCounts.done}/${output.taskCounts.total}`} />
        ) : null}
      </div>
      <div className={tw.actions}>
        {output.late ? <Pill tone="warn">Late</Pill> : null}
        {output.login && !output.logout ? <Pill tone="info">Still in</Pill> : null}
        {output.logout ? <Pill tone="good">Checked out</Pill> : null}
      </div>
      {showHours || showTasks ? (
        <div className={tw.grid}>
          {showTasks ? (
            <Card title="Task mix">
              <StatusDonut labels={output.statusChart.labels} values={output.statusChart.values} />
            </Card>
          ) : null}
          {showHours ? (
            <Card title="Hours">
              <HoursBar labels={output.hoursChart.labels} values={output.hoursChart.values} />
            </Card>
          ) : null}
          {showTasks ? (
            <Card title="Task counts">
              <HoursBar
                labels={output.statusChart.labels}
                values={output.statusChart.values}
                label="Tasks"
              />
            </Card>
          ) : null}
        </div>
      ) : null}
      {showTasks ? (
        <Card title="Tasks">
          {output.tasks.length === 0 ? (
            <p className={tw.empty}>No tasks recorded for this day.</p>
          ) : (
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
                {output.tasks.map((task) => (
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
          )}
        </Card>
      ) : null}
    </>
  );
}

export function DayDashboard({
  output,
  kicker,
  topics,
  topicBar,
}: {
  output: DayDashboardData;
  kicker: string;
  topics?: Array<"hours" | "tasks">;
  topicBar?: ReactNode;
}) {
  const hoursLabel = output.hours ? `${output.hours.toFixed(1)}h` : "—";

  return (
    <AppShell
      kicker={kicker}
      title={output.employeeName || "Day report"}
      subtitle={output.summary}
      actions={
        <div className={tw.actions}>
          {topicBar}
          <SiteLink path="/my-history" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output.employeeName} on ${output.date}: ${hoursLabel}, ${output.taskCounts.done}/${output.taskCounts.total} tasks.`}
      />
      <DayDashboardBody output={output} topics={topics} />
    </AppShell>
  );
}
