# Personal Planner MCP Server

An [MCP](https://modelcontextprotocol.io/) server that turns Claude Code into an intelligent scheduling partner. It connects to your Google Calendar to analyze schedule density, detect conflicts, respect your energy patterns, and track life-area balance — all through natural conversation.

## How It Works

The server gives Claude Code direct access to your calendar and scheduling preferences. When you ask Claude about your schedule, it can:

- **Analyze your day** — density scoring (light/moderate/heavy/overloaded), overlap detection, and back-to-back warnings
- **Match tasks to energy** — flag when demanding events land in low-energy periods based on your personal patterns
- **Track life-area balance** — compare scheduled hours against weekly targets across work, fitness, hobbies, personal, and social categories
- **Find open slots** — locate free time filtered by minimum duration and energy level
- **Manage events** — create, update, and delete calendar events conversationally

Events are automatically categorized into life areas using keyword matching (e.g., "Sprint planning" maps to work, "Gym session" maps to fitness). The analysis runs locally — only raw calendar data is fetched from Google.

### Example

> **You:** "What does my week look like?"
>
> Claude reads `planner://schedule/week` and responds with a summary: 3 heavy days, 2 energy mismatches, fitness is 3 hours under target, and suggests moving your Thursday deep-work block to a high-energy morning slot.

> **You:** "Find me 90 minutes for focused coding this week during high energy time"
>
> Claude calls `calendar_find_free_slots` filtered by high energy and shows available windows.

## Architecture

[![](https://mermaid.ink/svg/pako:eNptUctOwzAQvPMVPpZDmgMnJFQpskQF4hGlvVk9mHibGkwcrR0eIvw7ziY1NSKSldHszuyO3aDsDuyuOmPh41xwI3sFjFsFO5Zlq8F5pS273Tw-ZFXJB3bPSxEO2wC-AV49Yb7SrYKPpXe7chwLQci21honLqd_WqrA2R5rcOLiF6ctJdrXzo8NM5rKZEYNRe8PX9C6HmGE31SOZrGF6BEQw6UR4UCrJFICXQNFqGcypoiSopXm02knjiDRyZmMuuBO19ZY2xiQnXYDW49jF2tiWBxflDfnf0OVCHsnNt6ibCAZ5CYuzkmTkm7a-7hlShOixRCkyt9RexhYea0NiIWSXuZd6ACENlgun51t593-F25PhN6-hGc41cx3MGl_AGwqwZc)](https://mermaid.live/edit#pako:eNptUctOwzAQvPMVPpZDmgMnJFQpskQF4hGlvVk9mHibGkwcrR0eIvw7ziY1NSKSldHszuyO3aDsDuyuOmPh41xwI3sFjFsFO5Zlq8F5pS273Tw-ZFXJB3bPSxEO2wC-AV49Yb7SrYKPpXe7chwLQci21honLqd_WqrA2R5rcOLiF6ctJdrXzo8NM5rKZEYNRe8PX9C6HmGE31SOZrGF6BEQw6UR4UCrJFICXQNFqGcypoiSopXm02knjiDRyZmMuuBO19ZY2xiQnXYDW49jF2tiWBxflDfnf0OVCHsnNt6ibCAZ5CYuzkmTkm7a-7hlShOixRCkyt9RexhYea0NiIWSXuZd6ACENlgun51t593-F25PhN6-hGc41cx3MGl_AGwqwZc)

```
src/
├── index.ts                 # MCP server entry — registers all tools, resources, prompts
├── env.ts                   # Loads .env from project root (runs before other imports)
├── types.ts                 # TypeScript interfaces (UserPreferences, Conflict, etc.)
└── services/
    ├── calendar.ts          # Google Calendar API wrapper + OAuth flow
    ├── storage.ts           # JSON file read/write for preferences and tokens
    └── analysis.ts          # Pure functions: density, conflicts, energy, free slots
data/
├── preferences.example.json # Template — copy to preferences.json
├── preferences.json         # Your scheduling preferences (gitignored)
└── tokens.json              # OAuth tokens (gitignored)
```

## Setup

### Prerequisites

- Node.js v22+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

### 1. Install dependencies

```bash
npm install
```

### 2. Set up preferences

```bash
cp data/preferences.example.json data/preferences.json
```

Edit `data/preferences.json` to customize your energy patterns, life areas, and scheduling rules — or leave the defaults and update later via the `preferences_update` tool.

### 3. Configure Google OAuth

You'll need a Google Cloud project with Calendar API credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or use an existing one)
2. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
3. Go to **APIs & Services > OAuth consent screen** and configure it:
   - Choose **External** user type
   - Fill in the required fields (app name, support email, developer email)
   - On the Scopes step, you can skip adding scopes (the app requests them at runtime)
   - Add your Google email as a **Test user**
4. Go to **APIs & Services > Credentials** and create an **OAuth client ID**:
   - Application type: **Desktop app**
   - Copy the **Client ID** and **Client Secret**
5. Create your `.env` file:

```bash
cp .env.example .env
```

Paste your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env`.

### 4. Authenticate with Google Calendar

```bash
npm run auth
```

This opens a browser for the OAuth consent flow. Tokens are saved to `data/tokens.json` and refresh automatically.

### 5. Build

```bash
npm run build
```

### 6. Register as Claude Code MCP server

```bash
claude mcp add --transport stdio --scope user personal-planner -- node /path/to/personal-planner/build/index.js
```

Replace `/path/to/personal-planner` with the actual path to this repo.

### 7. Verify

In Claude Code, ask it to ping the personal planner. You should see `googleCalendar: "authenticated"` in the response.

## Tools

| Tool | Description |
|---|---|
| `ping` | Health check — reports server and auth status |
| `calendar_get_events` | Fetch events for a date range |
| `calendar_create_event` | Create a calendar event |
| `calendar_update_event` | Update an existing event |
| `calendar_delete_event` | Delete an event |
| `calendar_find_free_slots` | Find available time slots by duration and energy level |
| `preferences_get` | Read current user preferences |
| `preferences_update` | Update preferences (deep-merged) |
| `schedule_analyze` | Analyze a day for conflicts, density, balance, and free slots |

## Resources

| URI | Description |
|---|---|
| `planner://preferences` | Current user preferences as JSON |
| `planner://schedule/today` | Today's schedule with full analysis |
| `planner://schedule/week` | This week's schedule with per-day and weekly summary |

## Prompts

| Prompt | Description |
|---|---|
| `weekly-planning` | Guided ~10-15 min weekly planning session |
| `daily-checkin` | Quick morning briefing (~2 min) |
| `weekly-review` | End-of-week retrospective |

## Preferences

Edit `data/preferences.json` or use the `preferences_update` tool to configure:

- **Energy patterns** — high/medium/low energy time ranges that map to your daily rhythm
- **Life areas** — weekly hour targets and priorities (work, fitness, hobbies, personal, social)
- **Scheduling rules** — min break between events, max meetings/day, protected blocks, preferred planning day

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests (vitest)
npm run auth     # Re-run OAuth flow
```

## Testing

Tests use [Vitest](https://vitest.dev/) and cover the analysis module (density calculation, conflict detection, energy matching, free slot finding, week analysis).

```bash
npm test              # Single run
npm run test:watch    # Watch mode
```

## License

MIT
