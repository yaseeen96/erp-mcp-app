---
name: choose-tools
description: Route precise attendance asks to one tool. If intent is vague, ask a short question instead of calling a tool or guessing.
---

# Choose one tool, or ask

Before any tool call, check whether the request is specified enough to act.

## Precise — call one tool

Outcome and needed args are clear. Do not add extra tools.

| They said | Call | Arguments |
| --- | --- | --- |
| export / PDF / Excel / download **and** a day | `export-history` | `date=YYYY-MM-DD`, `format=pdf` or `xlsx` |
| export a range (18–19 Aug, last week) | `export-history` | `from` and `to`, `format=pdf` or `xlsx` |
| show / see that day | `show-day` | `date=YYYY-MM-DD` |
| today / am I in | `show-today` | — |
| check in / punch in | `check-in` | — |
| plan / add tasks, no check-in | `add-tasks` | projects and tasks |

Example: “export my work for 18 august in a pdf”

`export-history` `{ "date": "2026-08-18", "format": "pdf" }`

“export 18 and 19 August as PDF”

`export-history` `{ "from": "2026-08-18", "to": "2026-08-19", "format": "pdf" }`

“export 18 and 19 August as Excel”

`export-history` `{ "from": "2026-08-18", "to": "2026-08-19", "format": "xlsx" }`

One file per format. Same `from`/`to` for Excel and PDF. Do not call the tool twice and merge. Never say Excel or PDF only supports one day. Never also call `show-day`.

## Vague — ask, do not call

If see-vs-download, which day, PDF-vs-Excel, or whose day is unclear: ask **one** question with 2–4 options. Wait. Do not assume.

Examples:

- “export my work” → “Which day, or the recent history? PDF or Excel?”
- “how did I do in August” → “See the history on screen, or download a file? One day or the whole month?”
- “send me a report” → “PDF or Excel? One date or recent history?”

At most two questions. After they answer, call one tool.

## Two tools

Only when they asked for two outcomes: “show 18 August **and** send the PDF.”
