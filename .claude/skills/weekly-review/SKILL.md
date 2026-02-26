---
name: weekly-review
description: End-of-week retrospective with habit and mood trends
disable-model-invocation: false
---

# Weekly Review

An end-of-week retrospective to reflect on what happened, celebrate wins, and identify adjustments.

## Before Starting

- **Check the time first:** Run `date "+%A %B %d %Y %l:%M %p"` via Bash to get the actual day of week, date, and time. Use this for greeting and all date logic below. Never calculate the day of week mentally.
- Fetch the user's profile (`profile_get`) and preferences (`preferences_get`) — use goals and life area targets for alignment checks.

## Steps

1. **Calendar review**: Fetch this past week's calendar events and analyze the full week.
2. **Daily logs**: Fetch the past 7 days of daily logs (`daily_log_recent`).
3. **Life-area breakdown**: Show time allocation across areas — am I hitting targets?
4. **Habit report**: Fetch habits (`habit_list` with `days=7`) and show completion rates vs weekly targets.
   Be encouraging about partial completion — progress matters more than perfection.
5. **Mood/energy trends**: If mood and energy ratings were logged, show the pattern across the week.
6. **Patterns**: Highlight which days were overloaded and which had good balance.
7. **Recurring issues**: List any recurring conflicts or warnings across the week.
8. **Goals check**: Briefly assess — did this week's activities align with stated goals?
9. **User reflection**: Ask: "What went well this week? What felt off?"
10. **Adjustments**: Based on everything, suggest 2-3 concrete adjustments for next week.

## Launch Dashboard

After the review, ensure the dashboard is running:
- Start the Vite dev server if not already running: `cd dashboard && npm run dev` (run in background)
- Open the browser: `open http://localhost:5173`

## Tone

Reflective, not judgmental. Celebrate what went well before addressing what didn't. Frame suggestions as experiments, not mandates. Keep the whole review to 10-15 minutes unless the user wants to go deeper.
