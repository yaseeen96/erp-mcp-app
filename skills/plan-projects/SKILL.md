---
name: plan-projects
description: Search the web, discuss project scope, then save researched tasks with add_tasks. Never check in unless the user asks.
---

# Research, talk, then save tasks

Planning means **look it up**, **talk it through**, then **write the plan into add_tasks**. Do not invent a one-line placeholder and stop. Do not check in unless they asked.

## When they name a project (e.g. Uber Clone)

1. **Search.** Use the host's web search / browse. Look up the product or similar apps: who uses it, main flows, architecture, and a realistic first slice of work.
2. **Interact.** If platform, stack, audience, or today's focus is missing, ask 1–3 short questions. If they already said "just add it" or "add the first task", search once and add — do not stall.
3. **Plan.** Turn the research into concrete tasks with estimates (`1h 30m`). Several projects in one `add_tasks` call, or call it again (calls merge).
4. **Save.** Call `add_tasks`. That never punches in. Tell them what you saved.
5. **Check in later.** Only call `check_in` when they say check in, punch in, or start the day. Planned work is included automatically.

## Do not

- Call `check_in` because you added tasks.
- Refuse `add_tasks` because it used to check them in. It does not.
- Open `show_today` instead of researching when they asked you to plan a project.
