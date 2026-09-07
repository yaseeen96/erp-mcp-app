---
name: choose-tools
description: Route precise attendance asks to one tool. If intent is vague, ask a short question instead of calling a tool or guessing.
---

# Choose one tool, or ask

Before any tool call, check whether the request is specified enough to act.

CRITICAL: Pass `when` as their date words. MUST NOT compute ISO dates or weekdays yourself.
CRITICAL: Read tool `content` aloud. MUST NOT invent names, weekdays, or hours from a View.

Views exist only on `show_today`, `show_recurring`, `show_additional_work`, and `show_projects`.

## Precise — call one tool

| They said | Call | Arguments |
| --- | --- | --- |
| export / PDF / Excel **and** a day, week, or month | `export_history` | `when=…`, `format=pdf` or `xlsx` |
| show / see that one day (me) | `show_day` | `when=…` |
| today / am I in | `show_today` | — |
| my week / month / how many days I attended | `show_history` | `when=this week` or `when=August` |
| teammate week / month / how many days X attended | `show_employee_history` | `employeeName`, `when=…` |
| what did X work on / one teammate one day | `show_employee_day` | name, `when=…` |
| who is on my team / teammate names | `list_teammates` | — |
| how is my team doing / who is in / late / missing | `show_team_board` | optional `date` |
| check in / punch in | `check_in` | — |
| check out / finish day | `check_out` | — |
| plan / add tasks, no check-in | `add_tasks` | projects and tasks |

`when` examples: `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`, `August`, `1 September`, `18/08/2026`, `last 7 days`.

The server resolves Asia/Kolkata dates. Trust `weekday` on each day. Never guess (2026-09-01 is Tuesday). Never call `show_day` or `show_employee_day` once per day to build a week or month.

Example: “how many days did Maaz attend this week”

`show_employee_history` `{ "employeeName": "Maaz", "when": "this week" }`

“how many days did Maaz attend in August”

`show_employee_history` `{ "employeeName": "Maaz", "when": "August" }`

“who is on my team” / “what are my teammates' names”

`list_teammates` `{}`

Speak every name from the result. Do not say “check the board” or skip names.

“What did Maaz work on yesterday”

`show_employee_day` `{ "employeeName": "Maaz", "when": "yesterday" }`

Never invent “restricted to Team Leaders or HR”. Call the teammate tool. If ERPNext returns an error, quote that error. Never switch to `show_team_board` for one named person.

“show Maaz on 1 September”

`show_employee_day` `{ "employeeName": "Maaz", "when": "1 September" }`

“export my work for 18 august in a pdf”

`export_history` `{ "when": "18 August", "format": "pdf" }`

“export August as Excel”

`export_history` `{ "when": "August", "format": "xlsx" }`

One file per format. Do not export days separately or merge. Never also call `show_day`.

## Vague — ask, do not call

If see-vs-download, PDF-vs-Excel, or whose day is unclear: ask **one** question with 2–4 options. Wait. Do not assume.

If they already named a day, week, or month, that part is not vague — do not ask which dates.

Examples:

- “export my work” → “Which day, week, or month? PDF or Excel?”
- “send me a report” → “PDF or Excel? Which day, week, or month?”

At most two questions. After they answer, call one tool.

## Two tools

Only when they asked for two outcomes: “show 18 August **and** send the PDF.”
