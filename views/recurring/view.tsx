import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { StatusDonut } from "../_shared/charts.js";
import { TopicBar, wantsTopic } from "../_shared/topics.js";
import {
  AppShell,
  Card,
  ErrorState,
  Kpi,
  PendingState,
  Pill,
  SiteLink,
  tw,
} from "../_shared/ui.js";

const recurringTopics = ["status", "list"] as const;
const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function RecurringView() {
  const view = useToolContext<"view_recurring">();
  const reload = useCallTool("list_recurring_tasks");
  const save = useCallTool("save_recurring_task");
  const remove = useCallTool("delete_recurring_task");
  const [state, setState] = useViewState({ topics: view.toolInput?.topics ?? [] });
  const [description, setDescription] = useState("");
  const [project, setProject] = useState("");
  const [estimate, setEstimate] = useState("");
  const [days, setDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [actionError, setActionError] = useState<string>();

  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const topics = state.topics.length ? state.topics : undefined;
  const showStatus = wantsTopic(topics, "status");
  const showList = wantsTopic(topics, "list");

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Recurring" title="Recurring tasks">
        <PendingState label="Loading recurring templates…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Recurring" title="Recurring tasks">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  async function refresh() {
    await reload.callTool({}).catch(() => {});
  }

  return (
    <AppShell
      kicker="Self-service"
      title="Recurring tasks"
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={recurringTopics}
            selected={topics}
            labels={{ status: "Status", list: "List" }}
            onChange={(next) => setState({ topics: next ?? [] })}
          />
          <SiteLink path="/daily-checkin" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output?.count ?? 0} recurring templates, ${output?.active ?? 0} active.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Templates" value={output?.count ?? 0} />
        {showStatus ? <Kpi label="Active" value={output?.active ?? 0} /> : null}
        {showStatus ? <Kpi label="Inactive" value={output?.inactive ?? 0} /> : null}
      </div>
      {showStatus ? (
        <Card title="Active vs inactive">
          <StatusDonut
            labels={output?.statusChart.labels ?? []}
            values={output?.statusChart.values ?? []}
          />
        </Card>
      ) : null}
      {showList ? (
        <Card title="Templates">
          {!output?.rows.length ? (
            <p className={tw.empty}>No recurring templates yet.</p>
          ) : (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Estimate</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {output.rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.description}</td>
                    <td>{row.project || "—"}</td>
                    <td>{row.estimatedTime || "—"}</td>
                    <td>{row.days.join(", ") || "—"}</td>
                    <td>
                      <Pill tone={row.active ? "good" : "muted"}>
                        {row.active ? "Active" : "Inactive"}
                      </Pill>
                    </td>
                    <td>
                      <div className={tw.actions}>
                        <button
                          type="button"
                          className={tw.btn}
                          disabled={save.isPending}
                          onClick={() => {
                            setActionError(undefined);
                            void save
                              .callTool({
                                name: row.name,
                                description: row.description,
                                project_name: row.project,
                                estimated_time: row.estimatedTime,
                                recurring_days: row.days,
                                is_active: !row.active,
                              })
                              .then(refresh)
                              .catch((error: Error) => setActionError(error.message));
                          }}
                        >
                          {row.active ? "Pause" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className={tw.btn}
                          disabled={remove.isPending}
                          onClick={() => {
                            setActionError(undefined);
                            void remove
                              .callTool({ name: row.name, confirm: true })
                              .then(refresh)
                              .catch((error: Error) => setActionError(error.message));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
      <Card title="Add template">
        <div className={tw.form}>
          <label className={tw.field}>
            Description
            <textarea
              className={tw.control}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className={tw.field}>
            Project
            <input
              className={tw.control}
              value={project}
              onChange={(event) => setProject(event.target.value)}
            />
          </label>
          <label className={tw.field}>
            Estimate
            <input
              className={tw.control}
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
              placeholder="1h 30m"
            />
          </label>
          <div className={tw.actions}>
            {weekDays.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={on ? tw.btnPrimary : tw.btn}
                  onClick={() =>
                    setDays(on ? days.filter((item) => item !== day) : [...days, day])
                  }
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={tw.btnPrimary}
            disabled={save.isPending || !description.trim()}
            onClick={() => {
              setActionError(undefined);
              void save
                .callTool({
                  description: description.trim(),
                  project_name: project,
                  estimated_time: estimate,
                  recurring_days: days,
                  is_active: true,
                })
                .then(() => {
                  setDescription("");
                  setProject("");
                  setEstimate("");
                  return refresh();
                })
                .catch((error: Error) => setActionError(error.message));
            }}
          >
            {save.isPending ? "Saving…" : "Save template"}
          </button>
        </div>
      </Card>
      {actionError ? <ErrorState message={actionError} /> : null}
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
