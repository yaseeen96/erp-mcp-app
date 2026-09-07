import { ModelContext, useCallTool, useToolContext } from "mcp-use/react";
import {
  AppShell,
  Card,
  ErrorState,
  PendingState,
  Pill,
  SiteLink,
  statusTone,
  tw,
} from "../_shared/ui.js";

export default function TeammatesView() {
  const view = useToolContext<"list_teammates">();
  const reload = useCallTool("get_teammates");
  const output =
    reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const teammates = output?.teammates ?? [];
  const names = output?.names ?? teammates.map((row) => row.name).filter(Boolean);

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Team" title="Teammates">
        <PendingState label="Loading teammate names…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Team" title="Teammates">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="Team Leader"
      title="Teammates"
      subtitle={output?.summary}
      actions={<SiteLink path="/team-dashboard" label="Open ERPNext" />}
    >
      <ModelContext
        content={
          names.length
            ? `Teammate names: ${names.join(", ")}. Speak every name.`
            : "No teammates on this board."
        }
      />
      <Card title={`${names.length} teammate${names.length === 1 ? "" : "s"}`}>
        {teammates.length ? (
          <ul className="m-0 list-none p-0">
            {teammates.map((person) => (
              <li
                key={person.employeeId || person.name}
                className="flex items-center justify-between gap-3 border-b border-[var(--st-border)] py-2.5 last:border-b-0"
              >
                <div>
                  <p className="m-0 text-sm font-semibold text-[var(--st-title)]">{person.name}</p>
                  {person.designation ? <p className={tw.sub}>{person.designation}</p> : null}
                </div>
                <Pill tone={statusTone(person.status)}>{person.status.replaceAll("_", " ")}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className={tw.empty}>No teammates on this board.</p>
        )}
      </Card>
    </AppShell>
  );
}
