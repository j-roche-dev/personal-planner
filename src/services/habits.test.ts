import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Habit, DailyLog } from "../types.js";

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------

const store = new Map<string, unknown>();

vi.mock("./storage.js", () => ({
    readJSON: vi.fn(async (path: string) => {
        if (store.has(path)) return store.get(path);
        throw new Error("ENOENT");
    }),
    writeJSON: vi.fn(async (path: string, data: unknown) => {
        store.set(path, data);
    }),
}));

let uuidCounter = 0;
vi.mock("node:crypto", () => ({
    randomUUID: () => `habit-${++uuidCounter}`,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { getHabits, saveHabits, addHabit, updateHabit, removeHabit, getHabitCompletionRate } =
    await import("./habits.js");

beforeEach(() => {
    store.clear();
    uuidCounter = 0;
});

// ---------------------------------------------------------------------------
// getHabits
// ---------------------------------------------------------------------------

describe("getHabits", () => {
    it("returns empty array when no file exists", async () => {
        const habits = await getHabits();
        expect(habits).toEqual([]);
    });

    it("returns stored habits", async () => {
        const existing: Habit[] = [
            { id: "h1", name: "Meditate", weeklyTarget: 5, lifeArea: "personal", defaultDuration: 15, preferredTimeOfDay: "morning" },
        ];
        store.set("habits.json", existing);
        const habits = await getHabits();
        expect(habits).toHaveLength(1);
        expect(habits[0].name).toBe("Meditate");
    });
});

// ---------------------------------------------------------------------------
// saveHabits
// ---------------------------------------------------------------------------

describe("saveHabits", () => {
    it("writes habits to storage", async () => {
        const habits: Habit[] = [
            { id: "h1", name: "Run", weeklyTarget: 3, lifeArea: "fitness", defaultDuration: 30, preferredTimeOfDay: "morning" },
        ];
        await saveHabits(habits);
        expect(store.get("habits.json")).toEqual(habits);
    });
});

// ---------------------------------------------------------------------------
// addHabit
// ---------------------------------------------------------------------------

describe("addHabit", () => {
    it("adds a habit with generated ID", async () => {
        store.set("habits.json", []);
        const habit = await addHabit({
            name: "Read",
            weeklyTarget: 5,
            lifeArea: "learning",
            defaultDuration: 30,
            preferredTimeOfDay: "evening",
        });
        expect(habit.id).toBe("habit-1");
        expect(habit.name).toBe("Read");
        const stored = store.get("habits.json") as Habit[];
        expect(stored).toHaveLength(1);
    });

    it("appends to existing habits", async () => {
        store.set("habits.json", [
            { id: "existing", name: "Run", weeklyTarget: 3, lifeArea: "fitness", defaultDuration: 30, preferredTimeOfDay: "morning" },
        ]);
        await addHabit({
            name: "Meditate",
            weeklyTarget: 7,
            lifeArea: "personal",
            defaultDuration: 10,
            preferredTimeOfDay: "morning",
        });
        const stored = store.get("habits.json") as Habit[];
        expect(stored).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// updateHabit
// ---------------------------------------------------------------------------

describe("updateHabit", () => {
    it("updates habit fields", async () => {
        store.set("habits.json", [
            { id: "h1", name: "Run", weeklyTarget: 3, lifeArea: "fitness", defaultDuration: 30, preferredTimeOfDay: "morning" },
        ]);
        const updated = await updateHabit("h1", { weeklyTarget: 5, defaultDuration: 45 });
        expect(updated.weeklyTarget).toBe(5);
        expect(updated.defaultDuration).toBe(45);
        expect(updated.name).toBe("Run");
    });

    it("throws for non-existent habit", async () => {
        store.set("habits.json", []);
        await expect(updateHabit("nope", { name: "X" })).rejects.toThrow("Habit not found: nope");
    });
});

// ---------------------------------------------------------------------------
// removeHabit
// ---------------------------------------------------------------------------

describe("removeHabit", () => {
    it("removes a habit by id", async () => {
        store.set("habits.json", [
            { id: "h1", name: "Run", weeklyTarget: 3, lifeArea: "fitness", defaultDuration: 30, preferredTimeOfDay: "morning" },
            { id: "h2", name: "Read", weeklyTarget: 5, lifeArea: "learning", defaultDuration: 30, preferredTimeOfDay: "evening" },
        ]);
        await removeHabit("h1");
        const stored = store.get("habits.json") as Habit[];
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe("h2");
    });

    it("throws for non-existent habit", async () => {
        store.set("habits.json", []);
        await expect(removeHabit("nope")).rejects.toThrow("Habit not found: nope");
    });
});

// ---------------------------------------------------------------------------
// getHabitCompletionRate (pure function)
// ---------------------------------------------------------------------------

describe("getHabitCompletionRate", () => {
    it("calculates rate from daily logs", () => {
        const logs: DailyLog[] = [
            {
                date: "2025-06-10",
                habits: [{ habitId: "h1", habitName: "Run", completed: true }],
                reflection: { notes: "" },
                plannedHighlights: [],
                actualHighlights: [],
                adjustments: [],
                createdAt: "",
                updatedAt: "",
            },
            {
                date: "2025-06-11",
                habits: [{ habitId: "h1", habitName: "Run", completed: false }],
                reflection: { notes: "" },
                plannedHighlights: [],
                actualHighlights: [],
                adjustments: [],
                createdAt: "",
                updatedAt: "",
            },
            {
                date: "2025-06-12",
                habits: [{ habitId: "h1", habitName: "Run", completed: true }],
                reflection: { notes: "" },
                plannedHighlights: [],
                actualHighlights: [],
                adjustments: [],
                createdAt: "",
                updatedAt: "",
            },
        ];
        const result = getHabitCompletionRate("h1", logs);
        expect(result.completed).toBe(2);
        expect(result.total).toBe(3);
        expect(result.rate).toBe(67);
    });

    it("returns zero rate for no matching entries", () => {
        const result = getHabitCompletionRate("h1", []);
        expect(result).toEqual({ completed: 0, total: 0, rate: 0 });
    });

    it("ignores logs without the habit", () => {
        const logs: DailyLog[] = [
            {
                date: "2025-06-10",
                habits: [{ habitId: "other", habitName: "Meditate", completed: true }],
                reflection: { notes: "" },
                plannedHighlights: [],
                actualHighlights: [],
                adjustments: [],
                createdAt: "",
                updatedAt: "",
            },
        ];
        const result = getHabitCompletionRate("h1", logs);
        expect(result).toEqual({ completed: 0, total: 0, rate: 0 });
    });
});
