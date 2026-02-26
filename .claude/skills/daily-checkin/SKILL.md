---
name: daily-checkin
description: Morning check-in with yesterday review and today's plan (~3-5 min)
disable-model-invocation: false
---

# Daily Check-In

Morning check-in with two parts: review yesterday, plan today. Keep it conversational but concise.

## Before Starting

- **Check the time first:** Run `date "+%A %B %d %Y %l:%M %p"` via Bash to get the actual day of week, date, and time. Use this for greeting (good morning/afternoon/evening) and all date logic below. Never calculate the day of week mentally.
- Fetch the user's profile (`profile_get`) — use their name and goals for context throughout.
- Check today's day of week (from the `date` output above):
  - **Saturday/Sunday** → suggest `/weekend-checkin` instead (lighter touch for weekends).
  - **Sunday evening or the user's preferred planning day** → mention that `/weekly-planning` or `/weekly-review` might be due.
- If `$ARGUMENTS` contains `skip-yesterday`, jump straight to Part 2.

## Part 1 — Yesterday Review

1. Fetch yesterday's checklist (`checklist_get` with yesterday's date) for any still-open items.
   Ask: "Did you finish these, or should they carry over?"
2. Fetch yesterday's daily log (`daily_log_get`). If habits weren't logged, ask briefly about each.
3. Ask for a quick reflection: "How was yesterday? One sentence is fine."
   Optionally ask mood (great/good/okay/rough/bad) and energy (1-5) if it feels natural.
4. Save yesterday's log with the updated habits and reflection (`daily_log_update`).

## Part 2 — Today's Plan

5. Fetch today's calendar events and run `schedule_analyze`.
6. Fetch today's checklist with `checklist_get`.
7. Create today's daily log with habits pre-populated (`daily_log_update` with `plannedHighlights`).
8. Brief overview: events, density, conflicts, warnings.
9. Highlight the most important event and top checklist items.
10. Show free slots and suggest an order of attack.

## Launch Dashboard

After presenting the plan, ensure the dashboard is running:
- Start the Vite dev server if not already running: `cd dashboard && npm run dev` (run in background)
- Open the browser: `open http://localhost:5173`

## Throughout the Day

When the user completes checklist items outside of the morning check-in, follow the **Item Completion Workflow** in CLAUDE.md — mark the item done, prompt for billing info if the area is billable, and update the daily log's `actualHighlights`.

## Tone

Conversational, brief, encouraging. Don't over-explain — the user does this daily. If yesterday was rough, acknowledge it without dwelling. Focus energy on today's plan.
