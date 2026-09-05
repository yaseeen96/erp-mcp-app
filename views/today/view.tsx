import {
  ModelContext,
  useCallTool,
  useToolContext,
  useViewState,
} from "mcp-use/react";
import { useMemo, useState } from "react";
import { StatusDonut } from "../_shared/charts.js";
import {
  emptyTask,
  flattenPlanned,
  TaskDraftEditor,
  toProjectGroups,
  type DraftProject,
  type DraftTask,
} from "../_shared/task-drafts.js";
import { TopicBar, wantsTopic } from "../_shared/topics.js";
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

const todayTopics = ["hours", "tasks"] as const;

export default function TodayView() {
  const view = useToolContext<"show-today">();
  const checkIn = useCallTool("check-in");
  const checkOut = useCallTool("check-out");
  const reset = useCallTool("reset-checkin");
  const refresh = useCallTool("get-today");
  const [state, setState] = useViewState({ topics: view.toolInput?.topics ?? [] });

  const [projects, setProjects] = useState<DraftProject[]>([]);
  const [looseTasks, setLooseTasks] = useState<DraftTask[]>([emptyTask()]);
  const [adhocProjects, setAdhocProjects] = useState<DraftProject[]>([]);
  const [adhocLoose, setAdhocLoose] = useState<DraftTask[]>([]);
  const [location, setLocation] = useState<"Office" | "WFH" | "Remote">();
  const [lunchFrom, setLunchFrom] = useState("13:00");
  const [lunchTo, setLunchTo] = useState("13:30");
  const [actionError, setActionError] = useState<string>();

  const page = asRecord(view.status === "ready" ? view.meta?.page : refresh.data?._meta?.page);
  const output = refresh.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const tasks = asArray(page?.tasks);
  const employee = asRecord(page?.employee);

  const taskUpdates = useMemo(
    () =>
      tasks.map((task) => ({
        name: text(task.name, ""),
        status: text(task.status, "Pending") as "Pending" | "In Progress" | "Done" | "Dropped",
        actual_time: text(task.actual_time, ""),
        carry_forward: true,
      })),
    [tasks]
  );
  const [updates, setUpdates] = useState(taskUpdates);
  const shownUpdates = updates.length === taskUpdates.length ? updates : taskUpdates;

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Attendance" title="Today">
        <PendingState label="Loading today's work log…" />
      </AppShell>
    );
  }

  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Attendance" title="Today">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  const morningDone = Boolean(output?.morningDone);
  const eodDone = Boolean(output?.eodDone);
  const busy = checkIn.isPending || checkOut.isPending || reset.isPending || refresh.isPending;
  const topics = state.topics.length ? state.topics : undefined;
  const showHours = wantsTopic(topics, "hours");
  const showTasks = wantsTopic(topics, "tasks");

  async function reload() {
    await refresh.callTool({}).catch(() => {});
  }

  return (
    <AppShell
      kicker="ST Attendance"
      title={output?.employeeName || text(employee?.employee_name, "Today")}
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={todayTopics}
            selected={topics}
            labels={{ hours: "Hours", tasks: "Tasks" }}
            onChange={(next) => setState({ topics: next ?? [] })}
          />
          <SiteLink path="/daily-checkin" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`Today ${output?.date ?? ""}: ${output?.employeeName ?? ""} ${
          eodDone ? "checked out" : morningDone ? "checked in" : "not checked in"
        }. Tasks ${output?.taskCounts.done ?? 0}/${output?.taskCounts.total ?? 0}.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Date" value={output?.date ?? "—"} />
        <Kpi label="Status" value={eodDone ? "EOD" : morningDone ? "In" : "Out"} />
        {showHours ? <Kpi label="Login" value={output?.loginTime || "—"} /> : null}
        {showTasks ? (
          <Kpi
            label="Tasks"
            value={`${output?.taskCounts.done ?? 0}/${output?.taskCounts.total ?? 0}`}
          />
        ) : null}
      </div>
      <div className={tw.actions}>
        <Pill tone={eodDone ? "good" : morningDone ? "info" : "warn"}>
          {eodDone ? "Checked out" : morningDone ? "Checked in" : "Not checked in"}
        </Pill>
        {output?.leaveToday ? <Pill tone="info">{output.leaveToday}</Pill> : null}
        {output?.isTeamLeader ? <Pill>Team Leader</Pill> : null}
      </div>

      {showTasks ? (
        <Card title="Task mix">
          <StatusDonut
            labels={output?.chart.labels ?? []}
            values={output?.chart.values ?? []}
          />
        </Card>
      ) : null}

      {showTasks ? (
        <Card title="Tasks">
          {tasks.length === 0 ? (
            <p className={tw.empty}>No tasks yet. Add one before check-in.</p>
          ) : (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Est.</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={text(task.name)}>
                    <td>{text(task.description)}</td>
                    <td>{text(task.project_name)}</td>
                    <td>
                      <Pill tone={statusTone(text(task.status))}>{text(task.status)}</Pill>
                    </td>
                    <td>{text(task.estimated_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {!morningDone ? (
        <Card title="Morning check-in">
          <div className={tw.form}>
          <p className={tw.sub}>Add projects and as many tasks as you need. Check-in sends them in one call.</p>
          <TaskDraftEditor
            projects={projects}
            loose={looseTasks}
            onProjects={setProjects}
            onLoose={setLooseTasks}
          />
          <label className={tw.field}>
            Work location
            <select
              className={tw.control}
              value={location ?? output?.workLocation.value ?? "Office"}
              disabled={output?.workLocation.readonly}
              onChange={(event) =>
                setLocation(event.target.value as "Office" | "WFH" | "Remote")
              }
            >
              {(output?.workLocation.options ?? ["Office", "WFH"]).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {output?.workLocation.note ? (
              <span className={tw.sub}>{output.workLocation.note}</span>
            ) : null}
          </label>
          <div className={`${tw.actions} w-full`}>
            <button
              type="button"
              className={`${tw.btnPrimary} w-full`}
              disabled={busy}
              onClick={() => {
                setActionError(undefined);
                void checkIn
                  .callTool({
                    projects: toProjectGroups(projects),
                    new_tasks: flattenPlanned([], looseTasks),
                    work_location: location ?? output?.workLocation.value ?? "Office",
                  })
                  .then(reload)
                  .catch((error: Error) => setActionError(error.message));
              }}
            >
              {checkIn.isPending ? "Checking in…" : "Check in"}
            </button>
          </div>
          </div>
        </Card>
      ) : null}

      {morningDone && !eodDone ? (
        <Card title="End of day">
          <div className={tw.form}>
          <label className={tw.field}>
            Lunch from
            <input className={tw.control} value={lunchFrom} onChange={(event) => setLunchFrom(event.target.value)} />
          </label>
          <label className={tw.field}>
            Lunch to
            <input className={tw.control} value={lunchTo} onChange={(event) => setLunchTo(event.target.value)} />
          </label>
          <p className={tw.sub}>Add extra tasks or projects here. They go out with Submit EOD in one call.</p>
          <TaskDraftEditor
            projects={adhocProjects}
            loose={adhocLoose}
            onProjects={setAdhocProjects}
            onLoose={setAdhocLoose}
          />
          {shownUpdates.map((task, index) => (
            <label className={tw.field} key={task.name || index}>
              {text(tasks[index]?.description, task.name)} status
              <select
                className={tw.control}
                value={task.status}
                onChange={(event) => {
                  const next = [...shownUpdates];
                  next[index] = {
                    ...task,
                    status: event.target.value as typeof task.status,
                  };
                  setUpdates(next);
                }}
              >
                <option>Pending</option>
                <option>In Progress</option>
                <option>Done</option>
                <option>Dropped</option>
              </select>
              <input
                className={tw.control}
                placeholder="Actual time e.g. 1h 15m"
                value={task.actual_time}
                onChange={(event) => {
                  const next = [...shownUpdates];
                  next[index] = { ...task, actual_time: event.target.value };
                  setUpdates(next);
                }}
              />
            </label>
          ))}
          <div className={tw.actions}>
            <button
              type="button"
              className={tw.btnPrimary}
              disabled={busy}
              onClick={() => {
                setActionError(undefined);
                void checkOut
                  .callTool({
                    lunch_from: lunchFrom,
                    lunch_to: lunchTo,
                    task_updates: shownUpdates,
                    projects: toProjectGroups(adhocProjects),
                    adhoc_tasks: flattenPlanned([], adhocLoose),
                  })
                  .then(reload)
                  .catch((error: Error) => setActionError(error.message));
              }}
            >
              {checkOut.isPending ? "Submitting…" : "Submit EOD"}
            </button>
            <button
              type="button"
              className={tw.btn}
              disabled={busy}
              onClick={() => {
                setActionError(undefined);
                void reset
                  .callTool({ confirm: true })
                  .then(reload)
                  .catch((error: Error) => setActionError(error.message));
              }}
            >
              Reset check-in
            </button>
          </div>
          </div>
        </Card>
      ) : null}

      {actionError ? <ErrorState message={actionError} /> : null}
    </AppShell>
  );
}
