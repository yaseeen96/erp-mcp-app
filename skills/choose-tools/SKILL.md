---
name: choose-tools
description: Pick exactly one attendance tool from user intent. Precise asks stay narrow; vague asks get one default. Never preview a day just to export it.
---

# Choose one tool

Read the user's outcome. Call **one** tool that delivers it.

| They said | Call | Do not also call |
| --- | --- | --- |
| export / PDF / Excel / download, with or without a date | `export-history` | `show-day`, `show-history`, `get-export` |
| show / see / what did I do on a date | `show-day` | `export-history` |
| today / am I in | `show-today` | extra get-* helpers |
| check in / punch in | `check-in` | `add-tasks` unless they also asked to save a plan |
| plan / research / add tasks, no check-in | `add-tasks` | `check-in`, `show-today` |

## Precise

“export my work for 18 august in a pdf” → one call:

`export-history` `{ "date": "2026-08-18", "format": "pdf" }`

A date in an export sentence is an argument, not a second job.

## Vague

One default. “export my work” → `export-history` `format=pdf`. “how’s today” → `show-today`.

## Two tools

Only when they asked for two outcomes: “show 18 August and also send me the PDF.”
