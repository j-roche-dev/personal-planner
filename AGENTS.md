<!-- Auto-generated from CLAUDE.md by agents-md-sync. Edit the source CLAUDE.md, then re-run the sync. -->

# AGENTS.md

This file provides guidance to the AI coding agent when working with code in this repository.

## Commands

- **Build:** `npm run build` (TypeScript compile to `build/`)
- **Dev:** `npm run dev` (run with tsx, no build step)
- **Test all:** `npm test`
- **Test watch:** `npm run test:watch`
- **Test single file:** `npx vitest run src/services/analysis.test.ts`
- **Test by name:** `npx vitest run -t "detects overlapping events"`
- **OAuth flow:** `npm run auth` (requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`)

## Architecture

This is an MCP (Model Context Protocol) server that provides schedule planning tools to the AI coding agent. It communicates over stdio using `@modelcontextprotocol/sdk`.

### Entry Point & Registration

`src/index.ts` is the single entry point that registers all MCP tools (9), resources (3), and prompts (3) directly on the `McpServer` instance. There are no separate files per tool/resource/prompt — everything is in one file.

### Service Layer

- **`src/services/calendar.ts`** — Google Calendar API wrapper (`googleapis`). Handles OAuth2 flow, CRUD operations, and free/busy queries. Can run standalone (`npm run auth`) for OAuth setup.
- **`src/services/storage.ts`** — JSON file read/write to `data/` directory. Manages preferences and OAuth tokens. Exports the shared `OAuthTokens` type.
- **`src/services/analysis.ts`** — Pure functions for schedule analysis. All logic is testable without Google Calendar. Exports `analyzeDay`, `analyzeWeek`, `findFreeSlots`, `CalendarEvent` type.

### Data Flow

Tools call `ensureAuth()` → delegate to service layer → return via `textResult()` helper. Resources follow the same pattern but return `ReadResourceResult` with JSON. Preferences are deep-merged on update (arrays are replaced, objects are recursively merged).

### Key Types

`src/types.ts` defines all interfaces: `UserPreferences`, `ScheduleAnalysis`, `Conflict`, `TimeSlot`, `Habit`, `HabitLog`. The `CalendarEvent` interface lives in `analysis.ts` since it's a simplified view of Google Calendar events.

## Conventions

- **Never `console.log()`** — stdout is the MCP stdio JSON-RPC channel. All logging must use `console.error()`.
- **`.env` required for calendar tools** — must contain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see `.env.example`). Run `npm run auth` once to complete OAuth and persist tokens to `data/tokens.json`.
- **ES Modules** — `"type": "module"`, `Node16` module resolution, all local imports use `.js` extensions.

## Gotchas

- **Keyword categorization uses substring matching** — `categorizeEvent()` checks if any keyword is a substring of the event text. "workout" contains "work", so fitness events can be mis-categorized as work since work keywords are checked first. First area match wins based on object iteration order.
- **`detectOvercommitment` counts all events**, not just meetings, against `maxMeetingsPerDay`.
- **Energy level defaults to "medium"** for times outside any defined range.
- **Dates use system local timezone** — `new Date(date + "T00:00:00")` without explicit timezone.

## Status

Phase 1 (MVP) is complete. Phase 2 (habits, energy learning, SQLite) is not started.
