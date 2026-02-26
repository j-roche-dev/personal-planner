---
name: weekly-planning
description: Guided weekly planning session (~10-15 min)
disable-model-invocation: false
---

# Weekly Planning

A guided planning session to set up the week ahead. Takes about 10-15 minutes.

## Before Starting

- **Check the time first:** Run `date "+%A %B %d %Y %l:%M %p"` via Bash to get the actual day of week, date, and time. Use this for greeting and all date logic below. Never calculate the day of week mentally.
- Fetch the user's profile (`profile_get`) and preferences (`preferences_get`) — use goals and life area targets as context.

## Steps

1. **Last week context**: Fetch recent daily logs (`daily_log_recent`, 7 days) for a quick "how did last week go" summary — mood trends, habit completion, highlights. Keep this brief (3-4 sentences).
2. **Review the week ahead**: Fetch calendar events for the upcoming week (`calendar_get_events` for Mon-Sun) and read preferences.
3. **Analyze**: Run `schedule_analyze` for each day and summarize the week — density, conflicts, life-area balance.
4. **Identify gaps**: Use `calendar_find_free_slots` to find open time on days that need it.
5. **Priorities check**: Ask the user: "What are your top 3 priorities for the week?"
6. **Habit scheduling**: Fetch habits (`habit_list`) and suggest slots for them based on `preferredTimeOfDay` and energy levels. Help schedule them into free slots.
7. **Schedule**: Help schedule events for priorities into remaining free slots.
8. **Recap**: Summarize the final plan for the week.

## Launch Dashboard

After the planning session, ensure the dashboard is running:
- Start the Vite dev server if not already running: `cd dashboard && npm run dev` (run in background)
- Open the browser: `open http://localhost:5173`

## Pacing

This is interactive — don't rush through all steps at once. Present information in digestible chunks and wait for the user's input at decision points (especially steps 5-7). The user drives the priorities; you provide the data and suggestions.
