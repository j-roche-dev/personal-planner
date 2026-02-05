#!/usr/bin/env node

import "dotenv/config";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleCalendarService } from "./services/calendar.js";
import { getPreferences, savePreferences } from "./services/storage.js";
import {
    analyzeDay,
    analyzeWeek,
    findFreeSlots,
    type CalendarEvent,
} from "./services/analysis.js";
import type { UserPreferences } from "./types.js";

const server = new McpServer({
    name: "personal-planner",
    version: "0.1.0",
});

const calendarService = new GoogleCalendarService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textResult(data: unknown, isError = false) {
    return {
        content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
        isError,
    };
}

async function ensureAuth(): Promise<string | null> {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return "Google Calendar not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env";
    }
    const ok = await calendarService.authenticate();
    if (!ok) {
        return "Google Calendar not authenticated. Run `npm run auth` to complete OAuth setup.";
    }
    return null;
}

function todayDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekBounds(): { start: string; end: string } {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(monday), end: fmt(sunday) };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
            result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
        } else {
            result[key] = sv;
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Zod schemas (reusable fragments)
// ---------------------------------------------------------------------------

const TimeRangeSchema = z.object({
    start: z.string().describe("HH:mm"),
    end: z.string().describe("HH:mm"),
});

const TimeBlockSchema = z.object({
    day: z.string().describe("Day of week, e.g. monday"),
    start: z.string().describe("HH:mm"),
    end: z.string().describe("HH:mm"),
    label: z.string(),
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool("ping", "Check server status and Google Calendar auth status", {}, async () => {
    let calendarStatus = "not configured";
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const authenticated = await calendarService.authenticate();
        calendarStatus = authenticated
            ? "authenticated"
            : "credentials configured, not authenticated (run `npm run auth`)";
    }
    return textResult({ status: "ok", server: "personal-planner", version: "0.1.0", googleCalendar: calendarStatus });
});

server.tool(
    "calendar_get_events",
    "Fetch Google Calendar events for a date range",
    {
        timeMin: z.string().describe("Start of range (ISO 8601 datetime)"),
        timeMax: z.string().describe("End of range (ISO 8601 datetime)"),
    },
    async ({ timeMin, timeMax }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const events = await calendarService.getEvents(timeMin, timeMax);
        return textResult(events);
    }
);

server.tool(
    "calendar_create_event",
    "Create a new Google Calendar event",
    {
        summary: z.string().describe("Event title"),
        start: z.string().describe("Start time (ISO 8601 datetime)"),
        end: z.string().describe("End time (ISO 8601 datetime)"),
        description: z.string().optional().describe("Event description"),
        timeZone: z.string().optional().describe("IANA time zone, e.g. America/New_York"),
        colorId: z.string().optional().describe("Google Calendar color ID (1-11)"),
    },
    async ({ summary, start, end, description, timeZone, colorId }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const event = await calendarService.createEvent({
            summary,
            description,
            start: { dateTime: start, timeZone },
            end: { dateTime: end, timeZone },
            colorId,
        });
        return textResult(event);
    }
);

server.tool(
    "calendar_update_event",
    "Update an existing Google Calendar event",
    {
        eventId: z.string().describe("Google Calendar event ID"),
        summary: z.string().optional().describe("New title"),
        start: z.string().optional().describe("New start time (ISO 8601)"),
        end: z.string().optional().describe("New end time (ISO 8601)"),
        description: z.string().optional().describe("New description"),
        timeZone: z.string().optional().describe("IANA time zone"),
        colorId: z.string().optional().describe("Google Calendar color ID (1-11)"),
    },
    async ({ eventId, summary, start, end, description, timeZone, colorId }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const updates: Record<string, unknown> = {};
        if (summary !== undefined) updates.summary = summary;
        if (description !== undefined) updates.description = description;
        if (colorId !== undefined) updates.colorId = colorId;
        if (start !== undefined) updates.start = { dateTime: start, timeZone };
        if (end !== undefined) updates.end = { dateTime: end, timeZone };
        const event = await calendarService.updateEvent(eventId, updates as Parameters<typeof calendarService.updateEvent>[1]);
        return textResult(event);
    }
);

server.tool(
    "calendar_delete_event",
    "Delete a Google Calendar event",
    {
        eventId: z.string().describe("Google Calendar event ID"),
    },
    async ({ eventId }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        await calendarService.deleteEvent(eventId);
        return textResult({ deleted: true, eventId });
    }
);

server.tool(
    "calendar_find_free_slots",
    "Find available time slots on a given day, optionally filtered by energy level",
    {
        date: z.string().describe("Date to search (YYYY-MM-DD)"),
        duration: z.number().describe("Minimum slot duration in minutes"),
        energyLevel: z.enum(["high", "medium", "low"]).optional().describe("Only return slots matching this energy level"),
    },
    async ({ date, duration, energyLevel }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const timeMin = `${date}T00:00:00`;
        const timeMax = `${date}T23:59:59`;
        const events = await calendarService.getEvents(
            new Date(timeMin).toISOString(),
            new Date(timeMax).toISOString()
        );
        const prefs = await getPreferences();
        const slots = findFreeSlots(events as CalendarEvent[], prefs, date, duration, energyLevel);
        return textResult(slots);
    }
);

server.tool(
    "preferences_get",
    "Get current user preferences for scheduling, energy patterns, and life areas",
    {},
    async () => {
        const prefs = await getPreferences();
        return textResult(prefs);
    }
);

server.tool(
    "preferences_update",
    "Update user preferences (deep-merged with existing preferences)",
    {
        energyPatterns: z.object({
            highEnergy: z.array(TimeRangeSchema).optional(),
            mediumEnergy: z.array(TimeRangeSchema).optional(),
            lowEnergy: z.array(TimeRangeSchema).optional(),
        }).optional().describe("Energy level time ranges"),
        lifeAreas: z.array(z.object({
            name: z.string(),
            weeklyTargetHours: z.number(),
            priority: z.number(),
        })).optional().describe("Life area targets (replaces entire list)"),
        schedulingRules: z.object({
            minBreakBetweenEvents: z.number().optional(),
            maxMeetingsPerDay: z.number().optional(),
            protectedBlocks: z.array(TimeBlockSchema).optional(),
            preferredPlanningDay: z.string().optional(),
        }).optional().describe("Scheduling rules and constraints"),
    },
    async (updates) => {
        const current = await getPreferences();
        const merged = deepMerge(
            current as unknown as Record<string, unknown>,
            updates as unknown as Record<string, unknown>
        ) as unknown as UserPreferences;
        await savePreferences(merged);
        return textResult(merged);
    }
);

server.tool(
    "schedule_analyze",
    "Analyze a day's schedule for conflicts, density, life-area balance, and free slots",
    {
        date: z.string().optional().describe("Date to analyze (YYYY-MM-DD). Defaults to today."),
    },
    async ({ date }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const targetDate = date || todayDate();
        const timeMin = new Date(`${targetDate}T00:00:00`).toISOString();
        const timeMax = new Date(`${targetDate}T23:59:59`).toISOString();
        const events = await calendarService.getEvents(timeMin, timeMax);
        const prefs = await getPreferences();
        const analysis = analyzeDay(events as CalendarEvent[], prefs, targetDate);
        return textResult(analysis);
    }
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
    "preferences",
    "planner://preferences",
    { description: "Current user preferences for scheduling, energy patterns, and life areas", mimeType: "application/json" },
    async () => {
        const prefs = await getPreferences();
        return {
            contents: [{ uri: "planner://preferences", text: JSON.stringify(prefs, null, 2), mimeType: "application/json" }],
        };
    }
);

server.resource(
    "schedule-today",
    "planner://schedule/today",
    { description: "Today's schedule with conflict analysis, density, and free slots", mimeType: "application/json" },
    async () => {
        const authErr = await ensureAuth();
        if (authErr) {
            return {
                contents: [{ uri: "planner://schedule/today", text: JSON.stringify({ error: authErr }), mimeType: "application/json" }],
            };
        }
        const date = todayDate();
        const events = await calendarService.getEvents(
            new Date(`${date}T00:00:00`).toISOString(),
            new Date(`${date}T23:59:59`).toISOString()
        );
        const prefs = await getPreferences();
        const analysis = analyzeDay(events as CalendarEvent[], prefs, date);
        return {
            contents: [{ uri: "planner://schedule/today", text: JSON.stringify(analysis, null, 2), mimeType: "application/json" }],
        };
    }
);

server.resource(
    "schedule-week",
    "planner://schedule/week",
    { description: "This week's full schedule with per-day analysis and weekly summary", mimeType: "application/json" },
    async () => {
        const authErr = await ensureAuth();
        if (authErr) {
            return {
                contents: [{ uri: "planner://schedule/week", text: JSON.stringify({ error: authErr }), mimeType: "application/json" }],
            };
        }
        const { start, end } = weekBounds();
        const timeMin = new Date(`${start}T00:00:00`).toISOString();
        const timeMax = new Date(`${end}T23:59:59`).toISOString();
        const allEvents = await calendarService.getEvents(timeMin, timeMax) as CalendarEvent[];
        const prefs = await getPreferences();

        const eventsByDay = new Map<string, CalendarEvent[]>();
        const cursor = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
        while (cursor <= endDate) {
            const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
            eventsByDay.set(dateStr, []);
            cursor.setDate(cursor.getDate() + 1);
        }

        for (const event of allEvents) {
            const eventDate = event.start?.dateTime || event.start?.date || "";
            const dateKey = eventDate.slice(0, 10);
            if (eventsByDay.has(dateKey)) {
                eventsByDay.get(dateKey)!.push(event);
            }
        }

        const analysis = analyzeWeek(eventsByDay, prefs, start, end);
        return {
            contents: [{ uri: "planner://schedule/week", text: JSON.stringify(analysis, null, 2), mimeType: "application/json" }],
        };
    }
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

server.prompt(
    "weekly-planning",
    "Start a guided weekly planning session (~10-15 min)",
    {},
    async () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: [
                        "Let's do a weekly planning session. Please guide me through these steps:",
                        "",
                        "1. **Review my week**: Fetch my calendar events for the upcoming week and read my preferences.",
                        "2. **Analyze**: Run schedule_analyze for each day and summarize the week — density, conflicts, life-area balance.",
                        "3. **Identify gaps**: Use calendar_find_free_slots to find open time on days that need it.",
                        "4. **Priorities check**: Ask me what my top 3 priorities are for the week.",
                        "5. **Schedule**: Help me schedule events for priorities and habits into the free slots.",
                        "6. **Recap**: Summarize the final plan for the week.",
                        "",
                        "Start by pulling up the schedule and preferences now.",
                    ].join("\n"),
                },
            },
        ],
    })
);

server.prompt(
    "daily-checkin",
    "Run a quick morning briefing (~2 min)",
    {},
    async () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: [
                        "Good morning! Let's do a quick daily check-in:",
                        "",
                        "1. Fetch today's calendar events and run schedule_analyze for today.",
                        "2. Give me a brief overview: how many events, density level, any conflicts or warnings.",
                        "3. Highlight the most important event of the day.",
                        "4. If there are energy mismatches or back-to-back issues, suggest quick fixes.",
                        "5. Show my free slots so I know where I have breathing room.",
                        "",
                        "Keep it concise — this should be a 2-minute read.",
                    ].join("\n"),
                },
            },
        ],
    })
);

server.prompt(
    "weekly-review",
    "Run an end-of-week retrospective",
    {},
    async () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: [
                        "Let's review how my week went:",
                        "",
                        "1. Fetch this past week's calendar events and analyze the full week.",
                        "2. Show me the life-area breakdown — am I hitting my targets for work, fitness, hobbies, personal, social?",
                        "3. Highlight patterns: which days were overloaded? Which had good balance?",
                        "4. List any recurring conflicts or warnings across the week.",
                        "5. Ask me: what went well this week? What felt off?",
                        "6. Based on everything, suggest 2-3 concrete adjustments for next week.",
                    ].join("\n"),
                },
            },
        ],
    })
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Personal Planner MCP server running on stdio");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
