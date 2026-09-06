---
name: choose-tools
description: Route precise attendance asks to one tool. If intent is vague, ask a short question instead of calling a tool or guessing.
---

# Choose one tool, or ask

Before any tool call, check whether the request is specified enough to act.

Pass `when` as their date words. Do not compute ISO dates or weekdays yourself.

## Precise — call one tool

| They said | Call | Arguments |
| --- | --- | --- |
| export / PDF / Excel **and** a day, week, or month | `export-history` | `when=…`, `format=pdf` or `xlsx` |
| show / see that one day (me) | `show-day` | `when=…` |
| today / am I in | `show-today` | — |
| my week / month / how many days I attended | `show-history` | `when=this week` or `when=August` |
| teammate week / month / how many days X attended | `show-employee-history` | `employeeName`, `when=…` |
| what did X work on / one teammate one day | `show-employee-day` | name, `when=…` |
| who is on my team / teammate names | `list-teammates` | — |
| whole team who is in / late / missing | `show-team-board` | optional `date` |
| check in / punch in | `check-in` | — |
| plan / add tasks, no check-in | `add-tasks` | projects and tasks |

`when` examples: `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`, `August`, `1 September`, `18/08/2026`, `last 7 days`.

The server resolves Asia/Kolkata dates. Trust `weekday` on each day. Never guess (2026-09-01 is Tuesday). Never call `show-day` or `show-employee-day` once per day to build a week or month.

Example: “how many days did Maaz attend this week”

`show-employee-history` `{ "employeeName": "Maaz", "when": "this week" }`

“how many days did Maaz attend in August”

`show-employee-history` `{ "employeeName": "Maaz", "when": "August" }`

“who is on my team” / “what are my teammates' names”

`list-teammates` `{}`

Speak every name from the result. Do not say “check the board” or skip names.

“What did Maaz work on yesterday”

`show-employee-day` `{ "employeeName": "Maaz", "when": "yesterday" }`

Never invent “restricted to Team Leaders or HR”. Call the teammate tool. If ERPNext returns an error, quote that error. Never switch to `show-team-board` for one named person.

“show Maaz on 1 September”

`show-employee-day` `{ "employeeName": "Maaz", "when": "1 September" }`

“export my work for 18 august in a pdf”

`export-history` `{ "when": "18 August", "format": "pdf" }`

“export August as Excel”

`export-history` `{ "when": "August", "format": "xlsx" }`

One file per format. Do not export days separately or merge. Never also call `show-day`.

## Vague — ask, do not call

If see-vs-download, PDF-vs-Excel, or whose day is unclear: ask **one** question with 2–4 options. Wait. Do not assume.

If they already named a day, week, or month, that part is not vague — do not ask which dates.

Examples:

- “export my work” → “Which day, week, or month? PDF or Excel?”
- “send me a report” → “PDF or Excel? Which day, week, or month?”

At most two questions. After they answer, call one tool.

## Two tools

Only when they asked for two outcomes: “show 18 August **and** send the PDF.”
