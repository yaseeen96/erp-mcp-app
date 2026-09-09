import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { useState } from "react";
import { HoursBar } from "../_shared/charts.js";
import {
  emptyProject,
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
  statusTone,
  tw,
} from "../_shared/ui.js";

const projectTopics = ["list", "tasks"] as const;

export default function ProjectsView() {
  const view = useToolContext<"view_projects">();
  const reload = useCallTool("list_projects");
  const addTasks = useCallTool("add_tasks");
  const [state, setState] = useViewState({ topics: view.toolInput?.topics ?? [] });
  const [draftProjects, setDraftProjects] = useState<DraftProject[]>([emptyProject()]);
  const [loose, setLoose] = useState<DraftTask[]>([]);
  const [actionError, setActionError] = useState<string>();

  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const topics = state.topics.length ? state.topics : undefined;
  const showList = wantsTopic(topics, "list");
  const showTasks = wantsTopic(topics, "tasks");

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Projects" title="Projects">
        <PendingState label="Loading projects…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Projects" title="Projects">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  async function refresh() {
    await reload.callTool({}).catch(() => {});
  }

  const names = output?.projects.map((row) => row.name) ?? [];
  const counts = output?.projects.map((row) => row.todayCount) ?? [];

  return (
    <AppShell
      kicker="Projects"
      title="Projects"
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={projectTopics}
            selected={topics}
            labels={{ list: "List", tasks: "Tasks" }}
            onChange={(next) => setState({ topics: next ?? [] })}
          />
          <SiteLink path="/daily-checkin" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`${output?.count ?? 0} projects. Morning ${output?.morningDone ? "done" : "open"}.`}
      />
      <div className={tw.kpis}>
        <Kpi label="Projects" value={output?.count ?? 0} />
        <Kpi
          label="Today"
          value={output?.projects.reduce((sum, row) => sum + row.todayCount, 0) ?? 0}
        />
      </div>
      {showList ? (
        <Card title="Task count by project">
          <HoursBar labels={names} values={counts} label="Tasks" />
        </Card>
      ) : null}
      {showList ? (
        <Card title="Projects">
          {!output?.projects.length ? (
            <p className={tw.empty}>No project names yet. Create one below and add tasks.</p>
          ) : (
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Today</th>
                  <th>Done</th>
                  <th>Seen on</th>
                </tr>
              </thead>
              <tbody>
                {output.projects.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.todayCount}</td>
                    <td>{row.done}</td>
                    <td>{row.sources.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
      {showTasks
        ? output?.projects
            .filter((row) => row.tasks.length)
            .map((row) => (
              <Card key={row.name} title={row.name}>
                <table className={tw.table}>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Status</th>
                      <th>Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.tasks.map((task) => (
                      <tr key={task.name || task.description}>
                        <td>{task.description}</td>
                        <td>
                          <Pill tone={statusTone(task.status)}>{task.status}</Pill>
                        </td>
                        <td>{task.estimate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))
        : null}
      <Card title="Add project and tasks">
        <p className={tw.sub}>
          {output?.morningDone
            ? "Already checked in. Extra projects stay planned and go out with Submit EOD / check-out."
            : "Saves projects and tasks without checking in. Check in later when you are ready."}
        </p>
        <div className={`${tw.form} mt-3`}>
          <TaskDraftEditor
            projects={draftProjects}
            loose={loose}
            onProjects={setDraftProjects}
            onLoose={setLoose}
          />
          {!output?.eodDone ? (
            <button
              type="button"
              className={tw.btnPrimary}
              disabled={
                addTasks.isPending ||
                (toProjectGroups(draftProjects).length === 0 &&
                  flattenPlanned([], loose).length === 0)
              }
              onClick={() => {
                setActionError(undefined);
                void addTasks
                  .callTool({
                    projects: toProjectGroups(draftProjects),
                    tasks: flattenPlanned([], loose),
                  })
                  .then(() => {
                    setDraftProjects([emptyProject()]);
                    setLoose([]);
                    return refresh();
                  })
                  .catch((error: Error) => setActionError(error.message));
              }}
            >
              {addTasks.isPending ? "Saving…" : "Save planned work"}
            </button>
          ) : null}
        </div>
      </Card>
      {actionError ? <ErrorState message={actionError} /> : null}
      {addTasks.error ? <ErrorState message={addTasks.error.message} /> : null}
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
