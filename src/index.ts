#!/usr/bin/env node

import "./env.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleCalendarService } from "./services/calendar.js";
import {
    getPreferences,
    savePreferences,
    getProfile,
    saveProfile,
    getSetupStatus,
    saveSetupStatus,
} from "./services/storage.js";
import {
    analyzeDay,
    analyzeWeek,
    findFreeSlots,
    type CalendarEvent,
} from "./services/analysis.js";
import {
    getChecklist,
    addItem,
    updateItem,
    removeItem,
} from "./services/checklist.js";
import {
    getHabits,
    addHabit,
    updateHabit,
    removeHabit,
    getHabitCompletionRate,
} from "./services/habits.js";
import {
    getDailyLog,
    updateDailyLog,
    getRecentLogs,
} from "./services/daily-log.js";
import type { UserPreferences, UserProfile } from "./types.js";

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

async function getReadCalendarIds(): Promise<string[]> {
    const prefs = await getPreferences();
    const ids = ["primary"];
    const plannerCalId = prefs.schedulingRules.plannerCalendarId;
    if (plannerCalId) ids.push(plannerCalId);
    return ids;
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
    const setup = await getSetupStatus();
    return textResult({ status: "ok", server: "personal-planner", version: "0.1.0", googleCalendar: calendarStatus, setup });
});

server.tool(
    "calendar_list",
    "List the user's Google Calendars (id + name). Useful for finding the planner calendar ID.",
    {},
    async () => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const calendars = await calendarService.listCalendars();
        return textResult(calendars);
    }
);

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
        const calIds = await getReadCalendarIds();
        const events = await calendarService.getEventsMultiCalendar(
            new Date(timeMin).toISOString(),
            new Date(timeMax).toISOString(),
            calIds
        );
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
        const prefs = await getPreferences();
        const calId = prefs.schedulingRules.plannerCalendarId || "primary";
        const event = await calendarService.createEvent({
            summary,
            description,
            start: { dateTime: start, timeZone },
            end: { dateTime: end, timeZone },
            colorId,
        }, calId);
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
        calendarId: z.string().optional().describe("Calendar ID (needed for non-primary calendars, e.g. planner calendar)"),
    },
    async ({ eventId, summary, start, end, description, timeZone, colorId, calendarId }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        const updates: Record<string, unknown> = {};
        if (summary !== undefined) updates.summary = summary;
        if (description !== undefined) updates.description = description;
        if (colorId !== undefined) updates.colorId = colorId;
        if (start !== undefined) updates.start = { dateTime: start, timeZone };
        if (end !== undefined) updates.end = { dateTime: end, timeZone };
        const event = await calendarService.updateEvent(eventId, updates as Parameters<typeof calendarService.updateEvent>[1], calendarId);
        return textResult(event);
    }
);

server.tool(
    "calendar_delete_event",
    "Delete a Google Calendar event",
    {
        eventId: z.string().describe("Google Calendar event ID"),
        calendarId: z.string().optional().describe("Calendar ID (needed for non-primary calendars, e.g. planner calendar)"),
    },
    async ({ eventId, calendarId }) => {
        const err = await ensureAuth();
        if (err) return textResult(err, true);
        await calendarService.deleteEvent(eventId, calendarId);
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
        const calIds = await getReadCalendarIds();
        const events = await calendarService.getEventsMultiCalendar(
            new Date(timeMin).toISOString(),
            new Date(timeMax).toISOString(),
            calIds
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
            plannerCalendarId: z.string().optional().describe("Calendar ID for MCP-created events (e.g. planner-cli calendar)"),
        }).optional().describe("Scheduling rules and constraints"),
        categoryKeywords: z.record(z.array(z.string())).optional().describe("Custom keyword map for categorizing events into life areas. Keys are area names, values are arrays of keywords. If not set, built-in defaults are used."),
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
        const calIds = await getReadCalendarIds();
        const events = await calendarService.getEventsMultiCalendar(timeMin, timeMax, calIds);
        const prefs = await getPreferences();
        const analysis = analyzeDay(events as CalendarEvent[], prefs, targetDate);
        return textResult(analysis);
    }
);

// ---------------------------------------------------------------------------
// Checklist tools
// ---------------------------------------------------------------------------

server.tool(
    "checklist_get",
    "Get today's checklist (or a specific date). Carries over incomplete items from the most recent prior day.",
    {
        date: z.string().optional().describe("Date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ date }) => {
        const checklist = await getChecklist(date);
        return textResult(checklist);
    }
);

server.tool(
    "checklist_add",
    "Add an item to today's checklist",
    {
        text: z.string().describe("What needs to be done"),
        area: z.string().describe("Work area (e.g. work, fitness, personal) or life area"),
        size: z.enum(["quick", "medium", "long"]).optional().describe("Estimated size: quick (<15min), medium (15-60min), long (>1h)"),
        deadline: z.string().optional().describe("Due date (YYYY-MM-DD)"),
    },
    async ({ text, area, size, deadline }) => {
        const checklist = await addItem(text, area, size, deadline);
        return textResult(checklist);
    }
);

server.tool(
    "checklist_update",
    "Update a checklist item (mark complete, change text/area/size/deadline, add billing info)",
    {
        id: z.string().describe("Checklist item ID"),
        text: z.string().optional().describe("New text"),
        area: z.string().optional().describe("New area"),
        size: z.enum(["quick", "medium", "long"]).optional().describe("New size"),
        deadline: z.string().optional().describe("Due date (YYYY-MM-DD)"),
        completed: z.boolean().optional().describe("Mark as completed (true) or incomplete (false)"),
        completionNote: z.string().optional().describe("Billing description or completion note"),
        billableHours: z.number().optional().describe("Billable hours (e.g. 1.5)"),
    },
    async ({ id, text, area, size, deadline, completed, completionNote, billableHours }) => {
        try {
            const checklist = await updateItem(id, { text, area, size, deadline, completed, completionNote, billableHours });
            return textResult(checklist);
        } catch (err) {
            return textResult((err as Error).message, true);
        }
    }
);

server.tool(
    "checklist_remove",
    "Remove an item from today's checklist",
    {
        id: z.string().describe("Checklist item ID"),
    },
    async ({ id }) => {
        try {
            const checklist = await removeItem(id);
            return textResult(checklist);
        } catch (err) {
            return textResult((err as Error).message, true);
        }
    }
);

// ---------------------------------------------------------------------------
// Profile tools
// ---------------------------------------------------------------------------

server.tool(
    "profile_get",
    "Read user profile (name, bio, goals, planning cadence)",
    {},
    async () => {
        const profile = await getProfile();
        if (!profile) return textResult("Profile not set up yet. Run the setup-personal prompt to get started.");
        return textResult(profile);
    }
);

server.tool(
    "profile_update",
    "Update user profile (deep-merged with existing profile)",
    {
        name: z.string().optional().describe("User's name"),
        bio: z.string().optional().describe("Who they are, what they do"),
        goals: z.array(z.string()).optional().describe("High-level goals"),
        planningCadence: z.object({
            weeklyPlanningTime: z.string().optional().describe("e.g. 'Sunday 7pm'"),
            dailyCheckinTime: z.string().optional().describe("e.g. '8am weekdays'"),
            weeklyReviewTime: z.string().optional().describe("e.g. 'Sunday evening'"),
        }).optional().describe("Preferred planning times"),
        notes: z.string().optional().describe("Catch-all for anything else"),
    },
    async (updates) => {
        const now = new Date().toISOString();
        let current = await getProfile();
        if (!current) {
            current = {
                name: "",
                bio: "",
                goals: [],
                planningCadence: {
                    weeklyPlanningTime: "",
                    dailyCheckinTime: "",
                    weeklyReviewTime: "",
                },
                notes: "",
                createdAt: now,
                updatedAt: now,
            };
        }
        const merged = deepMerge(
            current as unknown as Record<string, unknown>,
            updates as unknown as Record<string, unknown>
        ) as unknown as UserProfile;
        merged.updatedAt = now;
        if (!merged.createdAt) merged.createdAt = now;
        await saveProfile(merged);
        return textResult(merged);
    }
);

// ---------------------------------------------------------------------------
// Habit tools
// ---------------------------------------------------------------------------

server.tool(
    "habit_list",
    "List all habits with optional completion rates over N days",
    {
        days: z.number().optional().describe("Number of days to calculate completion rates over (default 7)"),
    },
    async ({ days }) => {
        const habits = await getHabits();
        if (habits.length === 0) return textResult("No habits defined yet. Use habit_add to create one.");
        const recentLogs = await getRecentLogs(days || 7);
        const result = habits.map((h) => ({
            ...h,
            completionRate: getHabitCompletionRate(h.id, recentLogs),
        }));
        return textResult(result);
    }
);

server.tool(
    "habit_add",
    "Add a new habit to track",
    {
        name: z.string().describe("Habit name (e.g. 'Morning run')"),
        weeklyTarget: z.number().describe("How many times per week"),
        lifeArea: z.string().describe("Life area (e.g. fitness, learning, personal)"),
        defaultDuration: z.number().describe("Default duration in minutes"),
        preferredTimeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).describe("Best time to do this"),
    },
    async ({ name, weeklyTarget, lifeArea, defaultDuration, preferredTimeOfDay }) => {
        const habit = await addHabit({ name, weeklyTarget, lifeArea, defaultDuration, preferredTimeOfDay });
        return textResult(habit);
    }
);

server.tool(
    "habit_update",
    "Update a habit definition",
    {
        id: z.string().describe("Habit ID"),
        name: z.string().optional().describe("New name"),
        weeklyTarget: z.number().optional().describe("New weekly target"),
        lifeArea: z.string().optional().describe("New life area"),
        defaultDuration: z.number().optional().describe("New default duration in minutes"),
        preferredTimeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional().describe("New preferred time"),
    },
    async ({ id, ...updates }) => {
        try {
            const habit = await updateHabit(id, updates);
            return textResult(habit);
        } catch (err) {
            return textResult((err as Error).message, true);
        }
    }
);

server.tool(
    "habit_remove",
    "Remove a habit by id",
    {
        id: z.string().describe("Habit ID"),
    },
    async ({ id }) => {
        try {
            await removeHabit(id);
            return textResult({ removed: true, id });
        } catch (err) {
            return textResult((err as Error).message, true);
        }
    }
);

// ---------------------------------------------------------------------------
// Daily log tools
// ---------------------------------------------------------------------------

server.tool(
    "daily_log_get",
    "Get a day's log (habits, reflection, highlights). Returns null if none exists.",
    {
        date: z.string().optional().describe("Date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ date }) => {
        const log = await getDailyLog(date);
        if (!log) return textResult("No log for this date.");
        return textResult(log);
    }
);

server.tool(
    "daily_log_update",
    "Update a day's log (mark habits, add reflection, record highlights). Creates if needed.",
    {
        date: z.string().optional().describe("Date (YYYY-MM-DD). Defaults to today."),
        habits: z.array(z.object({
            habitId: z.string(),
            habitName: z.string(),
            completed: z.boolean(),
            duration: z.number().optional(),
            notes: z.string().optional(),
        })).optional().describe("Habit entries for the day"),
        reflection: z.object({
            notes: z.string().optional(),
            mood: z.enum(["great", "good", "okay", "rough", "bad"]).optional(),
            energyRating: z.number().optional().describe("1-5"),
        }).optional().describe("Daily reflection"),
        plannedHighlights: z.array(z.string()).optional().describe("What was planned as important"),
        actualHighlights: z.array(z.string()).optional().describe("What actually happened"),
        adjustments: z.array(z.string()).optional().describe("Changes made to weekly plan"),
    },
    async ({ date, ...updates }) => {
        const targetDate = date || todayDate();
        const log = await updateDailyLog(targetDate, updates);
        return textResult(log);
    }
);

server.tool(
    "daily_log_recent",
    "Get last N days of daily logs (for weekly reviews and trend analysis)",
    {
        days: z.number().optional().describe("Number of days to fetch (default 7, max 90)"),
    },
    async ({ days }) => {
        const count = Math.min(days || 7, 90);
        const logs = await getRecentLogs(count);
        if (logs.length === 0) return textResult("No daily logs found.");
        return textResult(logs);
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
        const calIds = await getReadCalendarIds();
        const events = await calendarService.getEventsMultiCalendar(
            new Date(`${date}T00:00:00`).toISOString(),
            new Date(`${date}T23:59:59`).toISOString(),
            calIds
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
        const calIds = await getReadCalendarIds();
        const allEvents = await calendarService.getEventsMultiCalendar(timeMin, timeMax, calIds) as CalendarEvent[];
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
                        "2. Show me the life-area breakdown — am I hitting my targets?",
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

server.prompt(
    "setup-technical",
    "Walk through OAuth setup and calendar configuration",
    {},
    async () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: [
                        "Let's get the planner's technical setup done. Walk me through these steps:",
                        "",
                        "1. **Check current status**: Run ping to see what's already configured.",
                        "2. **OAuth setup**: If Google Calendar isn't authenticated, guide me through:",
                        "   - Verify `.env` has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`",
                        "   - Run `npm run auth` to complete the OAuth flow",
                        "   - Verify authentication works by running ping again",
                        "3. **Planner calendar**: Run calendar_list to show my calendars.",
                        "   - If a planner calendar exists (e.g. 'planner-cli'), offer to set it via preferences_update.",
                        "   - If not, explain how to create one in Google Calendar and come back.",
                        "4. **Verify**: Run ping one final time to confirm everything is green.",
                        "",
                        "Start by checking the current status now.",
                    ].join("\n"),
                },
            },
        ],
    })
);

server.prompt(
    "setup-personal",
    "Conversational onboarding — get to know the user and configure the planner",
    {},
    async () => ({
        messages: [
            {
                role: "user" as const,
                content: {
                    type: "text" as const,
                    text: [
                        "Let's set up the planner to work for me personally. This is a conversation, not a form.",
                        "",
                        "**Your approach**:",
                        "- Introduce yourself briefly as my planning assistant.",
                        "- Have a natural conversation to learn about me. Don't rush through questions — ask follow-ups.",
                        "- Suggest sensible defaults when I'm unsure.",
                        "- At the end, summarize everything captured and confirm it looks right.",
                        "",
                        "**What to gather** (through conversation, not as a checklist):",
                        "1. Who am I? Name, what I do, what my life looks like day-to-day.",
                        "2. What are my main life areas and how much time I want to give each? → save via preferences_update (lifeAreas).",
                        "3. What does my energy look like throughout the day? When am I sharpest? → save via preferences_update (energyPatterns).",
                        "4. What does my typical work schedule look like? Any protected blocks? → save via preferences_update (schedulingRules).",
                        "5. What habits do I want to build or maintain? → save each via habit_add.",
                        "6. What are my current goals (can be vague, like 'get healthier' or 'ship the project')? → save via profile_update.",
                        "7. When do I want to do planning? Daily check-ins? Weekly planning/review? → save via profile_update (planningCadence).",
                        "",
                        "After everything is saved, mark personalSetupComplete: true in setup status.",
                        "",
                        "Start the conversation now — introduce yourself and ask your first question.",
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
