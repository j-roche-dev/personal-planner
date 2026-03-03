# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

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

This is an MCP (Model Context Protocol) server that provides schedule planning tools to AI coding agents. It communicates over stdio using `@modelcontextprotocol/sdk`.

### Entry Point & Registration

`src/index.ts` is the single entry point that registers all MCP tools (24), resources (3), and prompts (2) directly on the `McpServer` instance. There are no separate files per tool/resource/prompt — everything is in one file. Recurring workflow orchestration (daily check-in, weekend check-in, weekly planning, weekly review) lives in `.claude/skills/` as skills.

### Service Layer

- **`src/services/calendar.ts`** — Google Calendar API wrapper (`googleapis`). Handles OAuth2 flow, CRUD operations, and free/busy queries. Can run standalone (`npm run auth`) for OAuth setup.
- **`src/services/storage.ts`** — JSON file read/write to `data/` directory. Manages preferences, OAuth tokens, user profile, and setup status. Exports the shared `OAuthTokens` type.
- **`src/services/analysis.ts`** — Pure functions for schedule analysis. All logic is testable without Google Calendar. Exports `analyzeDay`, `analyzeWeek`, `findFreeSlots`, `CalendarEvent` type.
- **`src/services/checklist.ts`** — Daily checklist CRUD with carry-over logic and chain support. Stores one JSON file per day in `data/checklists/`. Incomplete items automatically carry forward to the next day. Items are sorted by area priority, with chained items grouped before standalone items.
- **`src/services/habits.ts`** — Habit definition CRUD. Stores all habits in `data/habits.json`. Includes `getHabitCompletionRate()` pure function for calculating rates from daily logs.
- **`src/services/daily-log.ts`** — Daily log CRUD with per-day storage in `data/daily-logs/YYYY-MM-DD.json`. Logs capture habits, reflections, highlights, and adjustments. `getRecentLogs(N)` scans the directory for the N most recent days.

### Data Flow

Tools call `ensureAuth()` → delegate to service layer → return via `textResult()` helper. Resources follow the same pattern but return `ReadResourceResult` with JSON. Preferences are deep-merged on update (arrays are replaced, objects are recursively merged).

### Key Types

`src/types.ts` defines all interfaces: `UserPreferences`, `SchedulingRules`, `ScheduleAnalysis`, `Conflict`, `TimeSlot`, `Habit`, `HabitLog`, `UserProfile`, `DailyLog`, `HabitEntry`, `SetupStatus`, `ChecklistItem`, `DailyChecklist`. The `CalendarEvent` interface lives in `analysis.ts` since it's a simplified view of Google Calendar events.

## Conventions

- **Never `console.log()`** — stdout is the MCP stdio JSON-RPC channel. All logging must use `console.error()`.
- **`.env` required for calendar tools** — must contain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see `.env.example`). Run `npm run auth` once to complete OAuth and persist tokens to `data/tokens.json`.
- **Token expiry detection** — `ensureAuth()` validates tokens via a lightweight API call. Expired tokens (common with Google's "testing" mode ~7 day expiry) return a clear message: "Google Calendar tokens have expired. Run: npm run auth". The `ping` tool also reports token health as "authenticated and verified" vs "token expired".
- **ES Modules** — `"type": "module"`, `Node16` module resolution, all local imports use `.js` extensions.
- **Planner calendar** — Events created by MCP tools go to the planner Google Calendar (configured via `schedulingRules.plannerCalendarId`). Analysis reads from both primary and planner calendars.

## Gotchas

- **Keyword categorization uses substring matching** — `categorizeEvent()` checks if any keyword is a substring of the event text. First area match wins based on object iteration order. The keyword map is ordered so specific areas (music, learning, fitness) are checked before broader ones (work) to avoid substring collisions.
- **`detectOvercommitment` counts all events**, not just meetings, against `maxMeetingsPerDay`.
- **Energy level defaults to "medium"** for times outside any defined range.
- **Dates use system local timezone** — `new Date(date + "T00:00:00")` without explicit timezone.

## Daily Checklist

Storage: `data/checklists/YYYY-MM-DD.json` — one file per day.

Tools: `checklist_get`, `checklist_add`, `checklist_update`, `checklist_remove`, `checklist_chain`.

**Date parameter:** All checklist write tools (`checklist_add`, `checklist_update`, `checklist_remove`, `checklist_chain`) accept an optional `date` parameter (YYYY-MM-DD, defaults to today). Use this to operate on a specific day's checklist.

**Carry-over cascade:** When completing an item on a past date via `checklist_update`, carried-over copies in subsequent checklists (up to today) are automatically marked complete too. The cascade matches by `text` and `carriedFrom` origin date, and propagates `completionNote` and `billableHours`.

Carry-over: When no checklist exists for a date, incomplete items from the most recent prior day are copied over with `carriedFrom` set to the original date. Chain fields (`chainId`, `chainOrder`) are preserved through carry-over.

Sort order: area priority (from `lifeAreas[].priority` in preferences), then chained items before standalone (grouped by `chainId`, sorted by `chainOrder`), then standalone items by size (quick > medium > long), completed items last.

## Chained Checklist Items

Use chains when checklist items have a natural sequential order (e.g., "consolidate data -> calculate burndown -> run analysis"). Chains express ordering within an area without relying on fragile number prefixes in the text.

**Data model:** `ChecklistItem` has optional `chainId` (groups items) and `chainOrder` (0-based position). Both fields are backward-compatible — existing items without them are standalone.

**How to chain:** Use `checklist_chain` with an ordered array of item IDs. All items must be in the same area. The tool assigns a shared `chainId` and sequential `chainOrder` values. To add an item to an existing chain, use `checklist_add` or `checklist_update` with `chainId` and `chainOrder`. To unchain, set `chainId: null` via `checklist_update`.

## Skills

Recurring workflows are implemented as skills in `.claude/skills/`. Each skill orchestrates MCP tools interactively.

| Skill | Invocation | When |
|-------|-----------|------|
| Daily Check-In | `/daily-checkin` | Weekday mornings |
| Weekend Check-In | `/weekend-checkin` | Saturday/Sunday mornings |
| Weekly Planning | `/weekly-planning` | Sunday evening / Monday morning |
| Weekly Review | `/weekly-review` | Sunday evening or early next week |

Setup prompts (`setup-technical`, `setup-personal`) remain as MCP prompts since they're one-time onboarding flows.

## Dashboard

Separate React app in `dashboard/` with its own package.json, tsconfig, vite config.

- **Run:** `npm run dashboard` from root (or `cd dashboard && npm run dev`)
- **Vite plugin** (`vite-plugin-data-api.ts`) serves read-only JSON API from `data/` directory
- **Views:** Today (checklist + daily log side-by-side), Daily Log Browser (date nav), Trends (habit grid + mood/energy charts)

## Cross-Project Work Logging

The `/log-work` global skill lets you log work from any project back to the planner's checklist and daily log. It auto-summarizes the session, fuzzy-matches checklist items, handles billing, and updates `actualHighlights`.

**Installation:** Copy `templates/log-work-skill/SKILL.md` to `~/.claude/skills/log-work/SKILL.md`. Then configure the MCP server globally:

```
claude mcp add --scope user personal-planner -- node <path-to-your-planner>/build/index.js
```

**`.planner` file convention:** Place a `.planner` JSON file in project roots to pre-configure the work area:

```json
{ "area": "work", "description": "Main client project" }
```

## Status

Phase 1 (MVP) is complete. Phase 2 (onboarding, daily accountability, habits persistence) is complete. Phase 3 (skills migration) is complete — recurring workflows moved from MCP prompts to skills.
