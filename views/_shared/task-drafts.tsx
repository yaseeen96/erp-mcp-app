import { tw } from "./ui.js";

export type DraftTask = {
  key: string;
  description: string;
  estimate: string;
};

export type DraftProject = {
  key: string;
  name: string;
  tasks: DraftTask[];
};

export type PlannedDraft = {
  description: string;
  estimated_time?: string;
  project_name?: string;
};

export type AdhocDraft = PlannedDraft & {
  status?: "Pending" | "In Progress" | "Done";
  actual_time?: string;
};

let draftSeq = 0;

export function draftKey(prefix: string) {
  draftSeq += 1;
  return `${prefix}-${draftSeq}`;
}

export function emptyTask(): DraftTask {
  return { key: draftKey("t"), description: "", estimate: "" };
}

export function emptyProject(name = ""): DraftProject {
  return { key: draftKey("p"), name, tasks: [emptyTask()] };
}

export function toProjectGroups(projects: DraftProject[]) {
  return projects
    .map((project) => ({
      name: project.name.trim(),
      tasks: project.tasks
        .filter((task) => task.description.trim())
        .map((task) => ({
          description: task.description.trim(),
          estimated_time: task.estimate.trim() || undefined,
        })),
    }))
    .filter((project) => project.name && project.tasks.length);
}

export function fromPlannedTasks(tasks: PlannedDraft[]): { projects: DraftProject[]; loose: DraftTask[] } {
  const groups = new Map<string, DraftTask[]>();
  const loose: DraftTask[] = [];
  for (const task of tasks) {
    const row: DraftTask = {
      key: draftKey("t"),
      description: task.description,
      estimate: task.estimated_time ?? "",
    };
    const project = task.project_name?.trim();
    if (project) {
      const list = groups.get(project) ?? [];
      list.push(row);
      groups.set(project, list);
    } else {
      loose.push(row);
    }
  }
  return {
    projects: [...groups.entries()].map(([name, projectTasks]) => ({
      key: draftKey("p"),
      name,
      tasks: projectTasks,
    })),
    loose,
  };
}

export function flattenPlanned(projects: DraftProject[], loose: DraftTask[]): PlannedDraft[] {
  return [
    ...projects.flatMap((project) =>
      project.tasks
        .filter((task) => task.description.trim())
        .map((task) => ({
          description: task.description.trim(),
          estimated_time: task.estimate.trim() || undefined,
          project_name: project.name.trim() || undefined,
        }))
    ),
    ...loose
      .filter((task) => task.description.trim())
      .map((task) => ({
        description: task.description.trim(),
        estimated_time: task.estimate.trim() || undefined,
      })),
  ];
}

export function TaskDraftEditor({
  projects,
  loose,
  onProjects,
  onLoose,
  showEstimates = true,
}: {
  projects: DraftProject[];
  loose: DraftTask[];
  onProjects: (next: DraftProject[]) => void;
  onLoose: (next: DraftTask[]) => void;
  showEstimates?: boolean;
}) {
  return (
    <div className={tw.form}>
      {projects.map((project, projectIndex) => (
        <div
          key={project.key}
          className="rounded-md border border-[var(--st-border)] p-3"
        >
          <label className={tw.field}>
            Project
            <div className={tw.actions}>
              <input
                className={`${tw.control} min-w-0 flex-1`}
                value={project.name}
                onChange={(event) => {
                  const next = [...projects];
                  next[projectIndex] = { ...project, name: event.target.value };
                  onProjects(next);
                }}
                placeholder="Project name"
              />
              <button
                type="button"
                className={tw.btn}
                onClick={() => onProjects(projects.filter((row) => row.key !== project.key))}
              >
                Remove
              </button>
            </div>
          </label>
          {project.tasks.map((task, taskIndex) => (
            <label className={tw.field} key={task.key}>
              Task
              <textarea
                className={tw.control}
                rows={2}
                value={task.description}
                onChange={(event) => {
                  const next = [...projects];
                  const tasks = [...project.tasks];
                  tasks[taskIndex] = { ...task, description: event.target.value };
                  next[projectIndex] = { ...project, tasks };
                  onProjects(next);
                }}
                placeholder="What will you do?"
              />
              {showEstimates ? (
                <input
                  className={tw.control}
                  value={task.estimate}
                  onChange={(event) => {
                    const next = [...projects];
                    const tasks = [...project.tasks];
                    tasks[taskIndex] = { ...task, estimate: event.target.value };
                    next[projectIndex] = { ...project, tasks };
                    onProjects(next);
                  }}
                  placeholder="Estimate e.g. 1h 30m"
                />
              ) : null}
              <button
                type="button"
                className={tw.btn}
                onClick={() => {
                  const tasks = project.tasks.filter((row) => row.key !== task.key);
                  const next = [...projects];
                  next[projectIndex] = {
                    ...project,
                    tasks: tasks.length ? tasks : [emptyTask()],
                  };
                  onProjects(next);
                }}
              >
                Remove task
              </button>
            </label>
          ))}
          <button
            type="button"
            className={tw.btn}
            onClick={() => {
              const next = [...projects];
              next[projectIndex] = { ...project, tasks: [...project.tasks, emptyTask()] };
              onProjects(next);
            }}
          >
            Add task to this project
          </button>
        </div>
      ))}
      {loose.map((task, index) => (
        <label className={tw.field} key={task.key}>
          Task
          <textarea
            className={tw.control}
            rows={2}
            value={task.description}
            onChange={(event) => {
              const next = [...loose];
              next[index] = { ...task, description: event.target.value };
              onLoose(next);
            }}
            placeholder="Ungrouped task"
          />
          {showEstimates ? (
            <input
              className={tw.control}
              value={task.estimate}
              onChange={(event) => {
                const next = [...loose];
                next[index] = { ...task, estimate: event.target.value };
                onLoose(next);
              }}
              placeholder="Estimate e.g. 1h 30m"
            />
          ) : null}
          <button
            type="button"
            className={tw.btn}
            onClick={() => onLoose(loose.filter((row) => row.key !== task.key))}
          >
            Remove task
          </button>
        </label>
      ))}
      <div className={tw.actions}>
        <button type="button" className={tw.btn} onClick={() => onProjects([...projects, emptyProject()])}>
          Add project
        </button>
        <button type="button" className={tw.btn} onClick={() => onLoose([...loose, emptyTask()])}>
          Add task
        </button>
      </div>
    </div>
  );
}
