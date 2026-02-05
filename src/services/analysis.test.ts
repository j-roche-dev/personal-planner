import { describe, it, expect } from "vitest";
import {
    findFreeSlots,
    analyzeDay,
    analyzeWeek,
    type CalendarEvent,
} from "./analysis.js";
import type { UserPreferences } from "../types.js";

const basePrefs: UserPreferences = {
    energyPatterns: {
        highEnergy: [{ start: "08:00", end: "11:00" }],
        mediumEnergy: [
            { start: "11:00", end: "13:00" },
            { start: "14:00", end: "16:00" },
        ],
        lowEnergy: [
            { start: "13:00", end: "14:00" },
            { start: "16:00", end: "18:00" },
        ],
    },
    lifeAreas: [
        { name: "work", weeklyTargetHours: 40, priority: 1 },
        { name: "fitness", weeklyTargetHours: 5, priority: 2 },
        { name: "hobbies", weeklyTargetHours: 5, priority: 3 },
        { name: "personal", weeklyTargetHours: 10, priority: 4 },
        { name: "social", weeklyTargetHours: 4, priority: 5 },
    ],
    schedulingRules: {
        minBreakBetweenEvents: 15,
        maxMeetingsPerDay: 6,
        protectedBlocks: [
            { day: "monday", start: "12:00", end: "13:00", label: "Lunch" },
        ],
        preferredPlanningDay: "sunday",
    },
};

function makeEvent(
    id: string,
    summary: string,
    startTime: string,
    endTime: string
): CalendarEvent {
    return {
        id,
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
    };
}

// ---------------------------------------------------------------------------
// analyzeDay
// ---------------------------------------------------------------------------

describe("analyzeDay", () => {
    it("returns a valid ScheduleAnalysis for an empty day", () => {
        const result = analyzeDay([], basePrefs, "2025-06-09");

        expect(result.date).toBe("2025-06-09");
        expect(result.density).toBe("light");
        expect(result.conflicts).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.freeSlots.length).toBeGreaterThan(0);
        expect(result.lifeAreaBreakdown).toHaveLength(basePrefs.lifeAreas.length);
    });

    it("calculates density correctly for moderate load", () => {
        const events = [
            makeEvent("1", "Meeting 1", "2025-06-09T09:00:00", "2025-06-09T11:00:00"),
            makeEvent("2", "Meeting 2", "2025-06-09T14:00:00", "2025-06-09T16:00:00"),
            makeEvent("3", "Meeting 3", "2025-06-09T16:00:00", "2025-06-09T17:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.density).toBe("moderate");
    });

    it("calculates density correctly for heavy load", () => {
        const events = [
            makeEvent("1", "Meeting 1", "2025-06-09T08:00:00", "2025-06-09T10:00:00"),
            makeEvent("2", "Meeting 2", "2025-06-09T10:00:00", "2025-06-09T12:00:00"),
            makeEvent("3", "Meeting 3", "2025-06-09T13:00:00", "2025-06-09T15:00:00"),
            makeEvent("4", "Meeting 4", "2025-06-09T15:00:00", "2025-06-09T16:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.density).toBe("heavy");
    });

    it("detects overloaded density (8+ hours)", () => {
        const events = [
            makeEvent("1", "Meeting 1", "2025-06-09T08:00:00", "2025-06-09T12:00:00"),
            makeEvent("2", "Meeting 2", "2025-06-09T13:00:00", "2025-06-09T17:00:00"),
            makeEvent("3", "Meeting 3", "2025-06-09T17:00:00", "2025-06-09T18:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.density).toBe("overloaded");
    });

    it("detects overlapping events", () => {
        const events = [
            makeEvent("1", "Meeting A", "2025-06-09T10:00:00", "2025-06-09T11:00:00"),
            makeEvent("2", "Meeting B", "2025-06-09T10:30:00", "2025-06-09T11:30:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");

        const overlaps = result.conflicts.filter((c) => c.type === "overlap");
        expect(overlaps).toHaveLength(1);
        expect(overlaps[0].severity).toBe("high");
        expect(overlaps[0].affectedEvents).toContain("1");
        expect(overlaps[0].affectedEvents).toContain("2");
    });

    it("does not flag non-overlapping events", () => {
        const events = [
            makeEvent("1", "Meeting A", "2025-06-09T09:00:00", "2025-06-09T10:00:00"),
            makeEvent("2", "Meeting B", "2025-06-09T10:00:00", "2025-06-09T11:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const overlaps = result.conflicts.filter((c) => c.type === "overlap");
        expect(overlaps).toHaveLength(0);
    });

    it("detects overcommitment when exceeding maxMeetingsPerDay", () => {
        const events = Array.from({ length: 8 }, (_, i) =>
            makeEvent(
                String(i),
                `Meeting ${i}`,
                `2025-06-09T${String(8 + i).padStart(2, "0")}:00:00`,
                `2025-06-09T${String(8 + i).padStart(2, "0")}:30:00`
            )
        );
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const overcommitments = result.conflicts.filter((c) => c.type === "overcommitment");
        expect(overcommitments).toHaveLength(1);
    });

    it("does not flag overcommitment when within limit", () => {
        const events = Array.from({ length: 5 }, (_, i) =>
            makeEvent(
                String(i),
                `Meeting ${i}`,
                `2025-06-09T${String(8 + i).padStart(2, "0")}:00:00`,
                `2025-06-09T${String(8 + i).padStart(2, "0")}:30:00`
            )
        );
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const overcommitments = result.conflicts.filter((c) => c.type === "overcommitment");
        expect(overcommitments).toHaveLength(0);
    });

    it("detects energy mismatch for long events in low-energy periods", () => {
        // 13:00 is a low-energy time in our preferences, 90min event
        const events = [
            makeEvent("1", "Big presentation", "2025-06-09T13:00:00", "2025-06-09T14:30:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const mismatches = result.conflicts.filter((c) => c.type === "energy_mismatch");
        expect(mismatches).toHaveLength(1);
    });

    it("does not flag short events for energy mismatch", () => {
        // 30min event during low energy — should be ignored (threshold is 60 min)
        const events = [
            makeEvent("1", "Quick sync", "2025-06-09T13:00:00", "2025-06-09T13:30:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const mismatches = result.conflicts.filter((c) => c.type === "energy_mismatch");
        expect(mismatches).toHaveLength(0);
    });

    it("warns about back-to-back events", () => {
        const events = [
            makeEvent("1", "Meeting A", "2025-06-09T09:00:00", "2025-06-09T10:00:00"),
            makeEvent("2", "Meeting B", "2025-06-09T10:05:00", "2025-06-09T11:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.warnings.some((w) => w.includes("back-to-back"))).toBe(true);
    });

    it("warns about high total hours", () => {
        const events = [
            makeEvent("1", "Work block", "2025-06-09T08:00:00", "2025-06-09T17:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.warnings.some((w) => w.includes("hours of events"))).toBe(true);
    });

    it("categorizes events into life areas", () => {
        const events = [
            // "gym" matches fitness (note: "Gym workout" would match work via "work" substring)
            makeEvent("1", "Gym session", "2025-06-09T08:00:00", "2025-06-09T09:00:00"),
            makeEvent("2", "Sprint planning", "2025-06-09T10:00:00", "2025-06-09T11:00:00"),
            makeEvent("3", "Dinner with friends", "2025-06-09T19:00:00", "2025-06-09T20:00:00"),
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        const breakdown = Object.fromEntries(
            result.lifeAreaBreakdown.map((b) => [b.area, b.scheduledHours])
        );
        expect(breakdown.fitness).toBe(1);
        expect(breakdown.work).toBe(1);
        expect(breakdown.social).toBe(1);
    });

    it("handles events with missing start/end gracefully", () => {
        const events: CalendarEvent[] = [
            { id: "1", summary: "Broken event", start: null, end: null },
        ];
        // Should not throw
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.date).toBe("2025-06-09");
    });

    it("handles events with all-day date format", () => {
        const events: CalendarEvent[] = [
            {
                id: "1",
                summary: "All day meeting",
                start: { date: "2025-06-09" },
                end: { date: "2025-06-10" },
            },
        ];
        const result = analyzeDay(events, basePrefs, "2025-06-09");
        expect(result.date).toBe("2025-06-09");
    });
});

// ---------------------------------------------------------------------------
// findFreeSlots
// ---------------------------------------------------------------------------

describe("findFreeSlots", () => {
    it("returns the full day (7am-9pm) when no events", () => {
        const slots = findFreeSlots([], basePrefs, "2025-06-09");
        // With protected lunch block on Monday, expect 2 slots: 7-12, 13-21
        expect(slots.length).toBeGreaterThanOrEqual(1);
        const totalMinutes = slots.reduce((sum, s) => sum + s.duration, 0);
        // 14 hours = 840 min total, minus 60 min lunch = 780
        expect(totalMinutes).toBe(780);
    });

    it("subtracts event time from free slots", () => {
        const events = [
            makeEvent("1", "Meeting", "2025-06-09T09:00:00", "2025-06-09T10:00:00"),
        ];
        const slots = findFreeSlots(events, basePrefs, "2025-06-09");
        const totalMinutes = slots.reduce((sum, s) => sum + s.duration, 0);
        // 780 (full day on Monday) - 60 (meeting) = 720
        expect(totalMinutes).toBe(720);
    });

    it("filters by minimum duration", () => {
        const events = [
            makeEvent("1", "Meeting A", "2025-06-09T09:00:00", "2025-06-09T09:50:00"),
            makeEvent("2", "Meeting B", "2025-06-09T10:00:00", "2025-06-09T11:00:00"),
        ];
        // Gap between 9:50 and 10:00 is only 10 minutes
        const slots30 = findFreeSlots(events, basePrefs, "2025-06-09", 30);
        const slots5 = findFreeSlots(events, basePrefs, "2025-06-09", 5);

        // The 10-min gap should not appear in 30-min filter
        const has10minSlot30 = slots30.some((s) => s.duration === 10);
        expect(has10minSlot30).toBe(false);

        // But should appear in 5-min filter
        const has10minSlot5 = slots5.some((s) => s.duration === 10);
        expect(has10minSlot5).toBe(true);
    });

    it("filters by energy level", () => {
        const slots = findFreeSlots([], basePrefs, "2025-06-09", 30, "high");
        for (const slot of slots) {
            expect(slot.energyLevel).toBe("high");
        }
    });

    it("includes energy level on each slot", () => {
        const slots = findFreeSlots([], basePrefs, "2025-06-09");
        for (const slot of slots) {
            expect(["high", "medium", "low"]).toContain(slot.energyLevel);
        }
    });

    it("respects protected blocks", () => {
        // Monday has a protected lunch block 12-13
        const slots = findFreeSlots([], basePrefs, "2025-06-09");
        for (const slot of slots) {
            const slotStart = new Date(slot.start);
            const slotEnd = new Date(slot.end);
            // No slot should span across noon to 1pm on Monday
            const lunchStart = new Date("2025-06-09T12:00:00");
            const lunchEnd = new Date("2025-06-09T13:00:00");
            const overlapsLunch = slotStart < lunchEnd && slotEnd > lunchStart;
            expect(overlapsLunch).toBe(false);
        }
    });

    it("handles overlapping busy periods correctly (merges them)", () => {
        const events = [
            makeEvent("1", "Meeting A", "2025-06-09T09:00:00", "2025-06-09T10:30:00"),
            makeEvent("2", "Meeting B", "2025-06-09T10:00:00", "2025-06-09T11:00:00"),
        ];
        const slots = findFreeSlots(events, basePrefs, "2025-06-09");
        // The two overlapping meetings should merge to 9:00-11:00
        const totalMinutes = slots.reduce((sum, s) => sum + s.duration, 0);
        // 780 (full Monday) - 120 (merged block) = 660
        expect(totalMinutes).toBe(660);
    });
});

// ---------------------------------------------------------------------------
// analyzeWeek
// ---------------------------------------------------------------------------

describe("analyzeWeek", () => {
    it("analyzes a week with empty days", () => {
        const eventsByDay = new Map<string, CalendarEvent[]>();
        for (let i = 9; i <= 15; i++) {
            eventsByDay.set(`2025-06-${String(i).padStart(2, "0")}`, []);
        }

        const result = analyzeWeek(eventsByDay, basePrefs, "2025-06-09", "2025-06-15");

        expect(result.startDate).toBe("2025-06-09");
        expect(result.endDate).toBe("2025-06-15");
        expect(result.days).toHaveLength(7);
        expect(result.summary.totalEvents).toBe(0);
        expect(result.summary.averageDensity).toBe("light");
    });

    it("sums life area hours across days", () => {
        const eventsByDay = new Map<string, CalendarEvent[]>();
        eventsByDay.set("2025-06-09", [
            makeEvent("1", "Sprint planning", "2025-06-09T09:00:00", "2025-06-09T10:00:00"),
        ]);
        eventsByDay.set("2025-06-10", [
            makeEvent("2", "Gym session", "2025-06-10T08:00:00", "2025-06-10T09:00:00"),
        ]);

        const result = analyzeWeek(eventsByDay, basePrefs, "2025-06-09", "2025-06-15");

        const workArea = result.summary.lifeAreaBreakdown.find((b) => b.area === "work");
        const fitnessArea = result.summary.lifeAreaBreakdown.find((b) => b.area === "fitness");
        expect(workArea?.scheduledHours).toBe(1);
        expect(fitnessArea?.scheduledHours).toBe(1);
    });

    it("calculates correct total events", () => {
        const eventsByDay = new Map<string, CalendarEvent[]>();
        eventsByDay.set("2025-06-09", [
            makeEvent("1", "Meeting 1", "2025-06-09T09:00:00", "2025-06-09T10:00:00"),
            makeEvent("2", "Meeting 2", "2025-06-09T11:00:00", "2025-06-09T12:00:00"),
        ]);
        eventsByDay.set("2025-06-10", [
            makeEvent("3", "Meeting 3", "2025-06-10T09:00:00", "2025-06-10T10:00:00"),
        ]);

        const result = analyzeWeek(eventsByDay, basePrefs, "2025-06-09", "2025-06-15");
        expect(result.summary.totalEvents).toBe(3);
    });

    it("calculates average density across days", () => {
        const eventsByDay = new Map<string, CalendarEvent[]>();
        // One heavy day (7 hours)
        eventsByDay.set("2025-06-09", [
            makeEvent("1", "Work", "2025-06-09T08:00:00", "2025-06-09T15:00:00"),
        ]);
        // One light day
        eventsByDay.set("2025-06-10", [
            makeEvent("2", "Quick sync", "2025-06-10T09:00:00", "2025-06-10T09:30:00"),
        ]);

        const result = analyzeWeek(eventsByDay, basePrefs, "2025-06-09", "2025-06-15");
        // heavy=3, light=1, avg=2 => moderate
        expect(result.summary.averageDensity).toBe("moderate");
    });

    it("calculates delta from weekly targets", () => {
        const eventsByDay = new Map<string, CalendarEvent[]>();
        eventsByDay.set("2025-06-09", []);

        const result = analyzeWeek(eventsByDay, basePrefs, "2025-06-09", "2025-06-15");
        const workArea = result.summary.lifeAreaBreakdown.find((b) => b.area === "work");
        // 0 scheduled - 40 target = -40
        expect(workArea?.delta).toBe(-40);
    });
});
