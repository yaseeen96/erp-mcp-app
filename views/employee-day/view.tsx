import { useToolContext, useViewState } from "mcp-use/react";
import { DayDashboard } from "../_shared/day-dashboard.js";
import { TopicBar } from "../_shared/topics.js";
import { AppShell, ErrorState, PendingState } from "../_shared/ui.js";

const dayTopics = ["hours", "tasks"] as const;

export default function EmployeeDayView() {
  const view = useToolContext<"view_employee_day">();
  const [state, setState] = useViewState({
    topics: view.toolInput?.topics ?? [],
  });

  if (view.status === "pending") {
    return (
      <AppShell kicker="Team" title="Employee day">
        <PendingState label="Loading this employee's day…" />
      </AppShell>
    );
  }

  if (view.status === "error") {
    return (
      <AppShell kicker="Team" title="Employee day">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  const topics = state.topics.length ? state.topics : undefined;

  return (
    <DayDashboard
      output={view.toolOutput}
      kicker="Team Leader"
      topics={topics}
      topicBar={
        <TopicBar
          all={dayTopics}
          selected={topics}
          labels={{ hours: "Hours", tasks: "Tasks" }}
          onChange={(next) => setState({ topics: next ?? [] })}
        />
      }
    />
  );
}
