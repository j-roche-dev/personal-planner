# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Build:** `npm run build` (TypeScript compile to `build/`)
- **Dev:** `npm run dev` (run with tsx, no build step)
- **Test all:** `npm test`
- **Test watch:** `npm run test:watch`
- **Test single file:** `npx vitest run src/services/analysis.test.ts`
- **Test by name:** `npx vitest run -t "detects overlapping events"`
- **OAuth flow:** `npm run auth` (requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`)
- **Dashboard:** `npm run dashboard` (or `cd dashboard && npm run dev`)

## Architecture

This is an MCP (Model Context Protocol) server that provides schedule planning tools to Claude Code. It communicates over stdio using `@modelcontextprotocol/sdk`.

### Entry Point & Registration

`src/index.ts` is the single entry point that registers all MCP tools (24), resources (3), and prompts (2) directly on the `McpServer` instance. There are no separate files per tool/resource/prompt — everything is in one file. Recurring workflow orchestration (daily check-in, weekend check-in, weekly planning, weekly review) lives in `.claude/skills/` as Claude Code skills — see **Skills** section below.

### Service Layer

- **`src/services/calendar.ts`** — Google Calendar API wrapper (`googleapis`). Handles OAuth2 flow, CRUD operations, and free/busy queries. Can run standalone (`npm run auth`) for OAuth setup.
- **`src/services/storage.ts`** — JSON file read/write to `data/` directory. Manages preferences, OAuth tokens, user profile, and setup status. Exports the shared `OAuthTokens` type.
- **`src/services/analysis.ts`** — Pure functions for schedule analysis. All logic is testable without Google Calendar. Exports `analyzeDay`, `analyzeWeek`, `findFreeSlots`, `CalendarEvent` type.
- **`src/services/checklist.ts`** — Daily checklist CRUD with carry-over logic. Stores one JSON file per day in `data/checklists/`. Incomplete items automatically carry forward to the next day. Items are sorted by area priority then size.
- **`src/services/habits.ts`** — Habit definition CRUD. Stores all habits in `data/habits.json`. Includes `getHabitCompletionRate()` pure function for calculating rates from daily logs.
- **`src/services/daily-log.ts`** — Daily log CRUD with per-day storage in `data/daily-logs/YYYY-MM-DD.json`. Logs capture habits, reflections, highlights, and adjustments. `getRecentLogs(N)` scans the directory for the N most recent days.

### Data Flow

Tools call `ensureAuth()` → delegate to service layer → return via `textResult()` helper. Resources follow the same pattern but return `ReadResourceResult` with JSON. Preferences are deep-merged on update (arrays are replaced, objects are recursively merged).

### Key Types

`src/types.ts` defines all interfaces: `UserPreferences`, `SchedulingRules`, `ScheduleAnalysis`, `Conflict`, `TimeSlot`, `Habit`, `HabitLog`, `UserProfile`, `DailyLog`, `HabitEntry`, `SetupStatus`, `ChecklistItem`, `DailyChecklist`. The `CalendarEvent` interface lives in `analysis.ts` since it's a simplified view of Google Calendar events.

## Conventions

- **Never `console.log()`** — stdout is the MCP stdio JSON-RPC channel. All logging must use `console.error()`.
- **`.env` required for calendar tools** — must contain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see `.env.example`). Run `npm run auth` once to complete OAuth and persist tokens to `data/tokens.json`.
- **ES Modules** — `"type": "module"`, `Node16` module resolution, all local imports use `.js` extensions.
- **Planner calendar** — Events created by MCP tools go to the planner Google Calendar (configured via `schedulingRules.plannerCalendarId`). Analysis reads from both primary and planner calendars.

## Gotchas

- **Keyword categorization uses substring matching** — `categorizeEvent()` checks if any keyword is a substring of the event text. First area match wins based on object iteration order. The keyword map is ordered so specific areas (music, learning, fitness) are checked before broader ones (work) to avoid substring collisions.
- **`detectOvercommitment` counts all events**, not just meetings, against `maxMeetingsPerDay`.
- **Energy level defaults to "medium"** for times outside any defined range.
- **Dates use system local timezone** — `new Date(date + "T00:00:00")` without explicit timezone.

## Daily Checklist

Storage: `data/checklists/YYYY-MM-DD.json` — one file per day.

Tools: `checklist_get`, `checklist_add`, `checklist_update`, `checklist_remove`.

Carry-over: When no checklist exists for a date, incomplete items from the most recent prior day are copied over with `carriedFrom` set to the original date.

Sort order: area priority (from `lifeAreas[].priority` in preferences), then size (quick > medium > long), completed items last.

## Item Completion Workflow

When a user reports completing work or asks to mark a checklist item done:

1. Mark the item complete via `checklist_update` with `completed: true`.
2. If the item's area is billable:
   - Ask briefly: "Any billable hours and a billing note for this?"
   - If yes, call `checklist_update` again with `billableHours` and `completionNote`.
   - If they say "no" or "not billable", skip.
3. Update `daily_log_update` — append to `actualHighlights` with a brief summary of what was done.
4. For non-billable areas: just mark complete and add to actualHighlights without asking about billing.

## Time Awareness

**Critical:** Never rely on mental day-of-week calculations from a date string. At the start of any session involving greetings or skill routing, run `date "+%A %B %d %Y %l:%M %p"` via Bash to get the current day of week, date, and time of day. Use the result to:
- Greet appropriately (good morning / good afternoon / good evening)
- Route to the correct skill (weekday → `/daily-checkin`, weekend → `/weekend-checkin`)
- Detect if weekly planning/review is due based on the user's preferred planning day

## First-Time Setup Detection

At session start, check setup status via ping. If incomplete:
- Neither done → suggest setup-technical first
- Technical done, personal not → suggest setup-personal
- Both done → proceed normally

Don't block the user — just a friendly one-time nudge per session.

## Skills

Recurring workflows are implemented as Claude Code skills in `.claude/skills/`. Each skill orchestrates MCP tools interactively.

| Skill | Invocation | When |
|-------|-----------|------|
| Daily Check-In | `/daily-checkin` | Weekday mornings |
| Weekend Check-In | `/weekend-checkin` | Saturday/Sunday mornings |
| Weekly Planning | `/weekly-planning` | Sunday evening / Monday morning |
| Weekly Review | `/weekly-review` | Sunday evening or early next week |

Setup prompts (`setup-technical`, `setup-personal`) remain as MCP prompts since they're one-time onboarding flows.

## Recommended Cadence

- Sunday evening / Monday morning: `/weekly-planning`
- Weekday mornings: `/daily-checkin` (includes yesterday review)
- Weekend mornings: `/weekend-checkin` (lighter touch)
- Sunday evening or early next week: `/weekly-review`

When user greets with "morning" or similar, run `date` first (see **Time Awareness**), then use the result to suggest the right skill. On the preferred planning day, mention that weekly planning/review might be due.

## Daily Logs

Logs capture habits, reflections, and highlights per day. Storage: `data/daily-logs/YYYY-MM-DD.json`.

Created during daily check-in — don't create preemptively. Yesterday's log gets completed during the NEXT morning's check-in. Keep reflections brief unless the user wants more.

## Habits

Defined in `data/habits.json`, tracked per-day in daily logs. During weekly planning: schedule habits into free slots. During daily check-in: ask about yesterday's unlogged habits. In weekly reviews: show completion rates and trends. Be encouraging about partial completion.

## Dashboard

Separate React app in `dashboard/` with its own package.json, tsconfig, vite config.

- **Run:** `npm run dashboard` from root (or `cd dashboard && npm run dev`)
- **Vite plugin** (`vite-plugin-data-api.ts`) serves read-only JSON API from `data/` directory
- **API routes:** `/api/checklist/:date`, `/api/checklist/dates`, `/api/daily-log/:date`, `/api/daily-log/dates`, `/api/daily-log/recent/:days`, `/api/habits`, `/api/profile`, `/api/preferences`
- **Shares types** via tsconfig paths alias `@planner/types` → `../src/types.ts`
- **Views:** Today (checklist + daily log side-by-side), Daily Log Browser (date nav), Trends (habit grid + mood/energy charts)
- **Area colors** in `dashboard/src/constants.ts` with generic defaults and automatic fallback for unknown areas

## Status

Phase 1 (MVP) is complete. Phase 2 (onboarding, daily accountability, habits persistence) is complete. Phase 3 (skills migration) is complete — recurring workflows moved from MCP prompts to Claude Code skills.
