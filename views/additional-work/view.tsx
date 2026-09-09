import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { SmartHoursChart } from "../_shared/charts.js";
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

const extraTopics = ["hours", "entries"] as const;

export default function AdditionalWorkView() {
  const view = useToolContext<"view_additional_work">();
  const reload = useCallTool("list_additional_work");
  const save = useCallTool("save_additional_work");
  const remove = useCallTool("delete_additional_work");
  const [state, setState] = useViewState({
    page: view.toolInput?.page ?? 0,
    topics: view.toolInput?.topics ?? [],
  });
  const [workDate, setWorkDate] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState("");
  const [hoursSpent, setHoursSpent] = useState("");
  const [remarks, setRemarks] = useState("");
  const [actionError, setActionError] = useState<string>();

  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const topics = state.topics.length ? state.topics : undefined;
  const showHours = wantsTopic(topics, "hours");
  const showEntries = wantsTopic(topics, "entries");

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Extra work" title="Additional work">
        <PendingState label="Loading additional work…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Extra work" title="Additional work">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  async function refresh(page = state.page) {
    await reload.callTool({ page }).catch(() => {});
  }

  return (
    <AppShell
      kicker="Self-service"
      title="Additional work"
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={extraTopics}
            selected={topics}
            labels={{ hours: "Hours", entries: "Entries" }}
            onChange={(next) => setState({ ...state, topics: next ?? [] })}
          />
          <SiteLink path="/daily-checkin" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output?.entries.length ?? 0} additional-work rows, ${output?.totalHours ?? 0}h.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Rows" value={output?.entries.length ?? 0} />
        {showHours ? <Kpi label="Hours" value={`${output?.totalHours ?? 0}h`} /> : null}
      </div>
      {showHours && (output?.hoursChart.labels.length ?? 0) >= 2 ? (
        <Card title="Hours by date">
          <SmartHoursChart
            labels={output?.hoursChart.labels ?? []}
            values={output?.hoursChart.values ?? []}
          />
        </Card>
      ) : null}
      {showEntries ? (
        <Card title="Entries">
          {!output?.entries.length ? (
            <p className={tw.empty}>No additional work on this page.</p>
          ) : (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Work</th>
                  <th>Project</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {output.entries.map((row) => (
                  <tr key={row.name}>
                    <td>{row.date}</td>
                    <td>
                      {row.description}
                      {row.remarks ? <div className={tw.sub}>{row.remarks}</div> : null}
                    </td>
                    <td>{row.project || "—"}</td>
                    <td>{row.hoursLabel || `${row.hours.toFixed(1)}h`}</td>
                    <td>{row.status ? <Pill>{row.status}</Pill> : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={tw.btn}
                        disabled={remove.isPending}
                        onClick={() => {
                          setActionError(undefined);
                          void remove
                            .callTool({ name: row.name, confirm: true })
                            .then(() => refresh())
                            .catch((error: Error) => setActionError(error.message));
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={`${tw.actions} mt-3`}>
            <button
              type="button"
              className={tw.btn}
              disabled={reload.isPending || state.page <= 0}
              onClick={() => {
                const page = Math.max(0, state.page - 1);
                setState({ ...state, page });
                void refresh(page);
              }}
            >
              Newer
            </button>
            <button
              type="button"
              className={tw.btn}
              disabled={reload.isPending || !output?.hasMore}
              onClick={() => {
                const page = state.page + 1;
                setState({ ...state, page });
                void refresh(page);
              }}
            >
              Older
            </button>
          </div>
        </Card>
      ) : null}
      <Card title="Add extra work">
        <div className={tw.form}>
          <label className={tw.field}>
            Date
            <input
              type="date"
              className={tw.control}
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
            />
          </label>
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
            Hours
            <input
              className={tw.control}
              value={hoursSpent}
              onChange={(event) => setHoursSpent(event.target.value)}
              placeholder="1h 30m"
            />
          </label>
          <label className={tw.field}>
            Remarks
            <input
              className={tw.control}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={tw.btnPrimary}
            disabled={save.isPending || !description.trim() || !workDate}
            onClick={() => {
              setActionError(undefined);
              void save
                .callTool({
                  work_date: workDate,
                  description: description.trim(),
                  project_name: project,
                  hours_spent: hoursSpent,
                  remarks,
                })
                .then(() => {
                  setDescription("");
                  setProject("");
                  setHoursSpent("");
                  setRemarks("");
                  return refresh();
                })
                .catch((error: Error) => setActionError(error.message));
            }}
          >
            {save.isPending ? "Saving…" : "Save extra work"}
          </button>
        </div>
      </Card>
      {actionError ? <ErrorState message={actionError} /> : null}
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
