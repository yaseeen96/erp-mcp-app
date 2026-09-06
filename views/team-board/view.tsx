import { ModelContext, useCallTool, useToolContext, useViewState } from "mcp-use/react";
import { asDayDashboard, DayDashboardBody } from "../_shared/day-dashboard.js";
import { GroupedBar, HoursBar, StatusDonut } from "../_shared/charts.js";
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

const teamTopics = ["presence", "hours", "people"] as const;

export default function TeamBoardView() {
  const view = useToolContext<"show-team-board">();
  const reload = useCallTool("get-team-dashboard");
  const employeeDay = useCallTool("get-employee-day");
  const [state, setState] = useViewState({
    date: view.toolInput?.date ?? "",
    topics: view.toolInput?.topics ?? [],
    employee: "",
  });

  const output = reload.data?.structuredContent ?? (view.status === "ready" ? view.toolOutput : undefined);
  const board = asRecord(reload.data?._meta?.board ?? (view.status === "ready" ? view.meta?.board : undefined));
  const people = output?.people ?? [];
  const employees = asArray(board?.employees);
  const names = output?.names ?? people.map((person) => person.name).filter(Boolean);
  const topics = state.topics.length ? state.topics : undefined;
  const showPresence = wantsTopic(topics, "presence");
  const showHours = wantsTopic(topics, "hours");
  const showPeople = wantsTopic(topics, "people");
  const selectedDay = asDayDashboard(employeeDay.data?.structuredContent);

  if (view.status === "pending" && !output) {
    return (
      <AppShell kicker="Team" title="Team board">
        <PendingState label="Loading team attendance…" />
      </AppShell>
    );
  }
  if (view.status === "error" && !output) {
    return (
      <AppShell kicker="Team" title="Team board">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell
      kicker="Team Leader"
      title="Team board"
      subtitle={output?.summary}
      actions={
        <div className={tw.actions}>
          <TopicBar
            all={teamTopics}
            selected={topics}
            labels={{ presence: "Presence", hours: "Hours", people: "People" }}
            onChange={(next) => setState({ ...state, topics: next ?? [] })}
          />
          <input
            type="date"
            className={tw.control}
            value={state.date || output?.date || ""}
            onChange={(event) => {
              const date = event.target.value;
              setState({ ...state, date });
              void reload.callTool({ date }).catch(() => {});
            }}
          />
          <SiteLink path="/team-dashboard" label="Open ERPNext" />
        </div>
      }
    >
      <ModelContext
        content={`Team board ${output?.date ?? ""}. Teammates: ${
          names.length ? names.join(", ") : "none listed"
        }. ${output?.kpis.checkedIn ?? 0} in, ${output?.kpis.missing ?? 0} missing, ${output?.kpis.late ?? 0} late. Speak every name.`}
      />
      <Card title="Teammates">
        {people.length ? (
          <ul className="m-0 list-none p-0">
            {people.map((person) => (
              <li
                key={person.employeeId || person.name}
                className="flex items-center justify-between gap-3 border-b border-[var(--st-border)] py-2 last:border-b-0"
              >
                <div>
                  <p className="m-0 text-sm font-semibold text-[var(--st-title)]">{person.name}</p>
                  {person.designation ? <p className={tw.sub}>{person.designation}</p> : null}
                </div>
                <Pill tone={statusTone(person.status)}>{person.status.replaceAll("_", " ")}</Pill>
              </li>
            ))}
          </ul>
        ) : employees.length ? (
          <ul className="m-0 list-none p-0">
            {employees.map((row) => (
              <li
                key={text(row.name)}
                className="flex items-center justify-between gap-3 border-b border-[var(--st-border)] py-2 last:border-b-0"
              >
                <p className="m-0 text-sm font-semibold text-[var(--st-title)]">
                  {text(row.employee_name)}
                </p>
                <Pill tone={statusTone(text(row.status))}>{text(row.status)}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className={tw.empty}>No teammates on this board.</p>
        )}
      </Card>
      {showPresence ? (
        <div className={tw.kpis}>
          <Kpi label="Team" value={output?.kpis.total ?? 0} />
          <Kpi label="In" value={output?.kpis.checkedIn ?? 0} />
          <Kpi label="Late" value={output?.kpis.late ?? 0} />
          <Kpi label="Missing" value={output?.kpis.missing ?? 0} />
          <Kpi label="Leave" value={output?.kpis.onLeave ?? 0} />
          <Kpi label="EOD" value={output?.kpis.eodDone ?? 0} />
        </div>
      ) : null}
      {showPresence || showHours ? (
        <div className={tw.grid}>
          {showPresence ? (
            <Card title="Presence">
              <StatusDonut labels={output?.statusChart.labels ?? []} values={output?.statusChart.values ?? []} />
            </Card>
          ) : null}
          {showHours ? (
            <Card title="Net hours">
              <HoursBar labels={output?.hoursChart.labels ?? []} values={output?.hoursChart.values ?? []} />
            </Card>
          ) : null}
        </div>
      ) : null}
      {showHours ? (
        <Card title="Status vs hours">
          <GroupedBar
            labels={output?.hoursChart.labels ?? []}
            series={[{ key: "Hours", values: output?.hoursChart.values ?? [], color: "#EE1C29" }]}
          />
        </Card>
      ) : null}
      {showPeople ? (
        <Card title="People">
          <table className={tw.table}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Tasks</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((row) => (
                <tr key={text(row.name)}>
                  <td>
                    {text(row.employee_name)}
                    <div className={tw.sub}>{text(row.designation)}</div>
                  </td>
                  <td>
                    <Pill tone={statusTone(text(row.status))}>{text(row.status)}</Pill>
                  </td>
                  <td>{text(row.login_time)}</td>
                  <td>{text(row.logout_time)}</td>
                  <td>{text(row.net_hours)}</td>
                  <td>
                    {text(row.done_tasks, "0")}/{text(row.total_tasks, "0")}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={tw.btn}
                      disabled={employeeDay.isPending}
                      onClick={() => {
                        const employee = text(row.name, "");
                        setState({ ...state, employee });
                        void employeeDay
                          .callTool({
                            employeeName: employee,
                            date: state.date || output?.date,
                          })
                          .catch(() => {});
                      }}
                    >
                      Day
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {selectedDay ? (
        <Card title={`${selectedDay.employeeName} — ${selectedDay.date}`}>
          <DayDashboardBody output={selectedDay} />
        </Card>
      ) : null}
      {employeeDay.error ? <ErrorState message={employeeDay.error.message} /> : null}
      {reload.error ? <ErrorState message={reload.error.message} /> : null}
    </AppShell>
  );
}
