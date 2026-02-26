---
name: weekend-checkin
description: Light weekend morning check-in — recharge, don't optimize
disable-model-invocation: false
---

# Weekend Check-In

It's the weekend! This is a light check-in. Weekends are for recharging, not optimizing.

## Before Starting

- **Check the time first:** Run `date "+%A %B %d %Y %l:%M %p"` via Bash to get the actual day of week, date, and time. Use this for greeting (good morning/afternoon/evening) and all date logic below. Never calculate the day of week mentally.
- If today is a **weekday**, suggest `/daily-checkin` instead.
- Fetch the user's profile (`profile_get`) — use their name for a friendly greeting.

## Steps

1. **Yesterday**: Quick glance — fetch yesterday's daily log (`daily_log_get`) and checklist (`checklist_get`).
   If anything important was left undone, mention it gently. Don't stress about it.
2. **Today's calendar**: Fetch today's events (`calendar_get_events`). Show what's planned (if anything).
3. **Week leftovers**: Check this week's checklist for anything still open that matters.
   Don't surface work items unless they're urgent — focus on personal/fitness/hobby items.
4. **Habits**: Remind about any habits planned for today (especially fitness/personal ones).
   Fetch habits with `habit_list` and check which ones are relevant.
5. **Suggest**: One or two things at most. The goal is to enjoy the day, not fill it.

## Launch Dashboard

After the check-in, ensure the dashboard is running:
- Start the Vite dev server if not already running: `cd dashboard && npm run dev` (run in background)
- Open the browser: `open http://localhost:5173`

## Tone

Relaxed, low-pressure. Short responses. No productivity guilt. If the user has nothing planned, celebrate that.
