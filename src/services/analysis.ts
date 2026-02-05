import type {
    UserPreferences,
    ScheduleAnalysis,
    Conflict,
    TimeSlot,
} from "../types.js";

export interface CalendarEvent {
    id?: string | null;
    summary?: string | null;
    description?: string | null;
    start?: { dateTime?: string | null; date?: string | null } | null;
    end?: { dateTime?: string | null; date?: string | null } | null;
}

export interface WeekAnalysis {
    startDate: string;
    endDate: string;
    days: ScheduleAnalysis[];
    summary: {
        totalEvents: number;
        averageDensity: string;
        lifeAreaBreakdown: {
            area: string;
            scheduledHours: number;
            targetHours: number;
            delta: number;
        }[];
    };
}

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;

const LIFE_AREA_KEYWORDS: Record<string, string[]> = {
    work: [
        "meeting", "standup", "sync", "review", "sprint", "work", "project",
        "deadline", "presentation", "interview", "1:1", "one-on-one",
        "planning", "retro", "demo", "scrum", "kickoff",
    ],
    fitness: [
        "gym", "workout", "run", "running", "yoga", "exercise", "fitness",
        "swim", "cycling", "hike", "walk", "training", "crossfit", "pilates",
    ],
    hobbies: [
        "hobby", "paint", "draw", "music", "guitar", "piano", "read",
        "game", "craft", "cook", "photography", "garden",
    ],
    personal: [
        "doctor", "dentist", "appointment", "errand", "haircut", "pharmacy",
        "bank", "cleaning", "shopping", "chore", "therapist", "vet",
    ],
    social: [
        "dinner", "lunch with", "coffee with", "drinks", "party", "hangout",
        "catch up", "friends", "family", "date night", "birthday",
    ],
};

function getEventStart(event: CalendarEvent): Date {
    const raw = event.start?.dateTime || event.start?.date;
    if (!raw) return new Date(0);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date(0) : d;
}

function getEventEnd(event: CalendarEvent): Date {
    const raw = event.end?.dateTime || event.end?.date;
    if (!raw) return new Date(0);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date(0) : d;
}

function getEventDurationMinutes(event: CalendarEvent): number {
    return (getEventEnd(event).getTime() - getEventStart(event).getTime()) / 60000;
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function getEnergyLevel(
    minuteOfDay: number,
    prefs: UserPreferences
): "high" | "medium" | "low" {
    for (const range of prefs.energyPatterns.highEnergy) {
        if (minuteOfDay >= timeToMinutes(range.start) && minuteOfDay < timeToMinutes(range.end)) {
            return "high";
        }
    }
    for (const range of prefs.energyPatterns.mediumEnergy) {
        if (minuteOfDay >= timeToMinutes(range.start) && minuteOfDay < timeToMinutes(range.end)) {
            return "medium";
        }
    }
    for (const range of prefs.energyPatterns.lowEnergy) {
        if (minuteOfDay >= timeToMinutes(range.start) && minuteOfDay < timeToMinutes(range.end)) {
            return "low";
        }
    }
    return "medium";
}

function categorizeEvent(event: CalendarEvent): string | null {
    const text = `${event.summary || ""} ${event.description || ""}`.toLowerCase();
    for (const [area, keywords] of Object.entries(LIFE_AREA_KEYWORDS)) {
        if (keywords.some((kw) => text.includes(kw))) return area;
    }
    return null;
}

function detectOverlaps(events: CalendarEvent[]): Conflict[] {
    const conflicts: Conflict[] = [];
    for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
            const aStart = getEventStart(events[i]);
            const aEnd = getEventEnd(events[i]);
            const bStart = getEventStart(events[j]);
            const bEnd = getEventEnd(events[j]);

            if (aStart < bEnd && bStart < aEnd) {
                conflicts.push({
                    type: "overlap",
                    severity: "high",
                    description: `"${events[i].summary}" overlaps with "${events[j].summary}"`,
                    affectedEvents: [events[i].id, events[j].id].filter(Boolean) as string[],
                    suggestedResolutions: [
                        "Reschedule one of the events",
                        "Shorten one of the events",
                    ],
                });
            }
        }
    }
    return conflicts;
}

function detectOvercommitment(
    events: CalendarEvent[],
    prefs: UserPreferences
): Conflict[] {
    const max = prefs.schedulingRules.maxMeetingsPerDay;
    if (events.length > max) {
        return [
            {
                type: "overcommitment",
                severity: events.length > max + 2 ? "high" : "medium",
                description: `${events.length} events scheduled (max: ${max})`,
                affectedEvents: events.map((e) => e.id).filter(Boolean) as string[],
                suggestedResolutions: [
                    "Cancel or reschedule lower-priority events",
                    "Combine related meetings",
                ],
            },
        ];
    }
    return [];
}

function detectEnergyMismatches(
    events: CalendarEvent[],
    prefs: UserPreferences
): Conflict[] {
    const conflicts: Conflict[] = [];
    for (const event of events) {
        const duration = getEventDurationMinutes(event);
        if (duration < 60) continue;

        const start = getEventStart(event);
        const minuteOfDay = start.getHours() * 60 + start.getMinutes();
        const energy = getEnergyLevel(minuteOfDay, prefs);

        if (energy === "low") {
            conflicts.push({
                type: "energy_mismatch",
                severity: "medium",
                description: `"${event.summary}" (${duration}min) is scheduled during a low-energy period`,
                affectedEvents: [event.id].filter(Boolean) as string[],
                suggestedResolutions: [
                    "Move to a high-energy time slot",
                    "Break into smaller tasks",
                ],
            });
        }
    }
    return conflicts;
}

function generateWarnings(
    events: CalendarEvent[],
    prefs: UserPreferences
): string[] {
    const warnings: string[] = [];
    const sorted = [...events].sort(
        (a, b) => getEventStart(a).getTime() - getEventStart(b).getTime()
    );

    let backToBackCount = 0;
    for (let i = 1; i < sorted.length; i++) {
        const gap =
            (getEventStart(sorted[i]).getTime() - getEventEnd(sorted[i - 1]).getTime()) / 60000;
        if (gap < prefs.schedulingRules.minBreakBetweenEvents && gap >= 0) {
            backToBackCount++;
        }
    }
    if (backToBackCount > 0) {
        warnings.push(
            `${backToBackCount} back-to-back transition(s) with less than ${prefs.schedulingRules.minBreakBetweenEvents}min break`
        );
    }

    const totalHours = events.reduce((sum, e) => sum + getEventDurationMinutes(e), 0) / 60;
    if (totalHours > 8) {
        warnings.push(`${totalHours.toFixed(1)} hours of events scheduled — consider lightening the load`);
    }

    return warnings;
}

function calculateDensity(
    events: CalendarEvent[]
): "light" | "moderate" | "heavy" | "overloaded" {
    const totalHours =
        events.reduce((sum, e) => sum + getEventDurationMinutes(e), 0) / 60;
    if (totalHours < 4) return "light";
    if (totalHours < 6) return "moderate";
    if (totalHours < 8) return "heavy";
    return "overloaded";
}

function calculateLifeAreaBreakdown(
    events: CalendarEvent[],
    prefs: UserPreferences
) {
    const hoursPerArea: Record<string, number> = {};

    for (const event of events) {
        const area = categorizeEvent(event);
        if (area) {
            hoursPerArea[area] =
                (hoursPerArea[area] || 0) + getEventDurationMinutes(event) / 60;
        }
    }

    return prefs.lifeAreas.map((la) => ({
        area: la.name,
        scheduledHours: Math.round((hoursPerArea[la.name] || 0) * 10) / 10,
        targetHours: la.weeklyTargetHours,
        delta: Math.round(((hoursPerArea[la.name] || 0) - la.weeklyTargetHours) * 10) / 10,
    }));
}

export function findFreeSlots(
    events: CalendarEvent[],
    prefs: UserPreferences,
    date: string,
    minDuration: number = 30,
    filterEnergy?: "high" | "medium" | "low"
): TimeSlot[] {
    const dayDate = new Date(date + "T00:00:00");
    const dayStart = new Date(dayDate);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);

    const busy: { start: Date; end: Date }[] = [];

    for (const event of events) {
        const eStart = getEventStart(event);
        const eEnd = getEventEnd(event);
        if (eEnd > dayStart && eStart < dayEnd) {
            busy.push({
                start: eStart < dayStart ? dayStart : eStart,
                end: eEnd > dayEnd ? dayEnd : eEnd,
            });
        }
    }

    const dayName = dayDate
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
    for (const block of prefs.schedulingRules.protectedBlocks) {
        if (block.day === dayName) {
            const blockStart = new Date(dayDate);
            const [bsh, bsm] = block.start.split(":").map(Number);
            blockStart.setHours(bsh, bsm, 0, 0);

            const blockEnd = new Date(dayDate);
            const [beh, bem] = block.end.split(":").map(Number);
            blockEnd.setHours(beh, bem, 0, 0);

            busy.push({ start: blockStart, end: blockEnd });
        }
    }

    busy.sort((a, b) => a.start.getTime() - b.start.getTime());

    const merged: { start: Date; end: Date }[] = [];
    for (const period of busy) {
        if (
            merged.length === 0 ||
            period.start.getTime() > merged[merged.length - 1].end.getTime()
        ) {
            merged.push({ start: new Date(period.start), end: new Date(period.end) });
        } else {
            merged[merged.length - 1].end = new Date(
                Math.max(merged[merged.length - 1].end.getTime(), period.end.getTime())
            );
        }
    }

    const slots: TimeSlot[] = [];
    let cursor = dayStart;

    for (const period of merged) {
        if (period.start.getTime() > cursor.getTime()) {
            const duration = (period.start.getTime() - cursor.getTime()) / 60000;
            if (duration >= minDuration) {
                const minuteOfDay = cursor.getHours() * 60 + cursor.getMinutes();
                const energy = getEnergyLevel(minuteOfDay, prefs);
                if (!filterEnergy || energy === filterEnergy) {
                    slots.push({
                        start: cursor.toISOString(),
                        end: period.start.toISOString(),
                        duration,
                        energyLevel: energy,
                    });
                }
            }
        }
        cursor = new Date(Math.max(cursor.getTime(), period.end.getTime()));
    }

    if (cursor.getTime() < dayEnd.getTime()) {
        const duration = (dayEnd.getTime() - cursor.getTime()) / 60000;
        if (duration >= minDuration) {
            const minuteOfDay = cursor.getHours() * 60 + cursor.getMinutes();
            const energy = getEnergyLevel(minuteOfDay, prefs);
            if (!filterEnergy || energy === filterEnergy) {
                slots.push({
                    start: cursor.toISOString(),
                    end: dayEnd.toISOString(),
                    duration,
                    energyLevel: energy,
                });
            }
        }
    }

    return slots;
}

export function analyzeDay(
    events: CalendarEvent[],
    prefs: UserPreferences,
    date: string
): ScheduleAnalysis {
    const conflicts = [
        ...detectOverlaps(events),
        ...detectOvercommitment(events, prefs),
        ...detectEnergyMismatches(events, prefs),
    ];

    return {
        date,
        density: calculateDensity(events),
        conflicts,
        lifeAreaBreakdown: calculateLifeAreaBreakdown(events, prefs),
        freeSlots: findFreeSlots(events, prefs, date),
        warnings: generateWarnings(events, prefs),
    };
}

export function analyzeWeek(
    eventsByDay: Map<string, CalendarEvent[]>,
    prefs: UserPreferences,
    startDate: string,
    endDate: string
): WeekAnalysis {
    const days: ScheduleAnalysis[] = [];
    let totalEvents = 0;
    const densityScores = { light: 1, moderate: 2, heavy: 3, overloaded: 4 };

    const aggregatedHours: Record<string, number> = {};

    for (const [date, events] of eventsByDay) {
        const analysis = analyzeDay(events, prefs, date);
        days.push(analysis);
        totalEvents += events.length;

        for (const la of analysis.lifeAreaBreakdown) {
            aggregatedHours[la.area] = (aggregatedHours[la.area] || 0) + la.scheduledHours;
        }
    }

    const avgScore = days.length > 0
        ? days.reduce((sum, d) => sum + densityScores[d.density], 0) / days.length
        : 0;
    const avgDensity = avgScore <= 1.5 ? "light"
        : avgScore <= 2.5 ? "moderate"
        : avgScore <= 3.5 ? "heavy"
        : "overloaded";

    const lifeAreaBreakdown = prefs.lifeAreas.map((la) => ({
        area: la.name,
        scheduledHours: Math.round((aggregatedHours[la.name] || 0) * 10) / 10,
        targetHours: la.weeklyTargetHours,
        delta: Math.round(((aggregatedHours[la.name] || 0) - la.weeklyTargetHours) * 10) / 10,
    }));

    return {
        startDate,
        endDate,
        days,
        summary: {
            totalEvents,
            averageDensity: avgDensity,
            lifeAreaBreakdown,
        },
    };
}
