# Personal Planner MCP Server

An intelligent personal planner that acts as a conversational scheduling partner through Claude Code. It manages your Google Calendar, analyzes schedule density, detects conflicts, respects energy patterns, and tracks life-area balance.

## Setup

### Prerequisites

- Node.js v22+
- A Google Cloud project with Calendar API enabled
- OAuth 2.0 credentials (Desktop app type)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up preferences

```bash
cp data/preferences.example.json data/preferences.json
```

Edit `data/preferences.json` to customize your energy patterns, life areas, and scheduling rules (or leave the defaults and update later via the `preferences_update` tool).

### 3. Configure Google OAuth

1. Create a Google Cloud project and enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
2. Create OAuth 2.0 credentials (Application type: **Desktop app**)
3. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your Google Cloud Console.

### 4. Authenticate with Google Calendar

```bash
npm run auth
```

This opens a browser window for the OAuth consent flow. Tokens are saved to `data/tokens.json`.

### 5. Build

```bash
npm run build
```

### 6. Register as Claude Code MCP server

```bash
claude mcp add --transport stdio --scope user personal-planner -- node /path/to/personal-planner/build/index.js
```

### 7. Verify

Use the `ping` tool in Claude Code to confirm the server is running and authenticated.

## Architecture

```
src/
├── index.ts                 # MCP server entry — tools, resources, prompts
├── types.ts                 # TypeScript interfaces (UserPreferences, Conflict, etc.)
└── services/
    ├── calendar.ts          # Google Calendar API wrapper + OAuth flow
    ├── storage.ts           # JSON file read/write for preferences and tokens
    └── analysis.ts          # Schedule analysis: density, conflicts, energy, free slots
data/
├── preferences.json         # User scheduling preferences
└── tokens.json              # OAuth tokens (gitignored)
```

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

- **Energy patterns** — high/medium/low energy time ranges
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
