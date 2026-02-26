import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DailyLog, Habit } from "../types.js";

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

vi.mock("node:fs/promises", () => ({
    readdir: vi.fn(async () => {
        const files: string[] = [];
        for (const key of store.keys()) {
            if (key.startsWith("daily-logs/")) {
                files.push(key.replace("daily-logs/", ""));
            }
        }
        return files;
    }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { getDailyLog, saveDailyLog, createDailyLog, updateDailyLog, getRecentLogs } =
    await import("./daily-log.js");

function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
    store.clear();
});

// ---------------------------------------------------------------------------
// getDailyLog
// ---------------------------------------------------------------------------

describe("getDailyLog", () => {
    it("returns null when no log exists", async () => {
        const log = await getDailyLog("2025-06-10");
        expect(log).toBeNull();
    });

    it("returns existing log", async () => {
        const existing: DailyLog = {
            date: "2025-06-10",
            habits: [],
            reflection: { notes: "Good day" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "2025-06-10T08:00:00Z",
            updatedAt: "2025-06-10T08:00:00Z",
        };
        store.set("daily-logs/2025-06-10.json", existing);
        const log = await getDailyLog("2025-06-10");
        expect(log).toEqual(existing);
    });

    it("defaults to today when no date provided", async () => {
        const t = today();
        const existing: DailyLog = {
            date: t,
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        store.set(`daily-logs/${t}.json`, existing);
        const log = await getDailyLog();
        expect(log?.date).toBe(t);
    });
});

// ---------------------------------------------------------------------------
// saveDailyLog
// ---------------------------------------------------------------------------

describe("saveDailyLog", () => {
    it("persists a log to the correct path", async () => {
        const log: DailyLog = {
            date: "2025-06-10",
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        await saveDailyLog(log);
        expect(store.get("daily-logs/2025-06-10.json")).toEqual(log);
    });
});

// ---------------------------------------------------------------------------
// createDailyLog
// ---------------------------------------------------------------------------

describe("createDailyLog", () => {
    it("creates a log pre-populated with habits", async () => {
        const habits: Habit[] = [
            { id: "h1", name: "Run", weeklyTarget: 3, lifeArea: "fitness", defaultDuration: 30, preferredTimeOfDay: "morning" },
            { id: "h2", name: "Read", weeklyTarget: 5, lifeArea: "learning", defaultDuration: 30, preferredTimeOfDay: "evening" },
        ];
        const log = await createDailyLog("2025-06-10", habits);
        expect(log.date).toBe("2025-06-10");
        expect(log.habits).toHaveLength(2);
        expect(log.habits[0]).toEqual({ habitId: "h1", habitName: "Run", completed: false });
        expect(log.habits[1]).toEqual({ habitId: "h2", habitName: "Read", completed: false });
        expect(log.createdAt).toBeTruthy();
        expect(store.has("daily-logs/2025-06-10.json")).toBe(true);
    });

    it("creates log with empty habits when none provided", async () => {
        const log = await createDailyLog("2025-06-10", []);
        expect(log.habits).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// updateDailyLog
// ---------------------------------------------------------------------------

describe("updateDailyLog", () => {
    it("updates existing log fields", async () => {
        const existing: DailyLog = {
            date: "2025-06-10",
            habits: [{ habitId: "h1", habitName: "Run", completed: false }],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "2025-06-10T08:00:00Z",
            updatedAt: "2025-06-10T08:00:00Z",
        };
        store.set("daily-logs/2025-06-10.json", existing);

        const updated = await updateDailyLog("2025-06-10", {
            habits: [{ habitId: "h1", habitName: "Run", completed: true, duration: 35 }],
            reflection: { notes: "Felt great", mood: "good" },
        });

        expect(updated.habits[0].completed).toBe(true);
        expect(updated.habits[0].duration).toBe(35);
        expect(updated.reflection.notes).toBe("Felt great");
        expect(updated.reflection.mood).toBe("good");
    });

    it("creates a new log if none exists", async () => {
        const updated = await updateDailyLog("2025-06-10", {
            actualHighlights: ["Shipped feature X"],
        });
        expect(updated.date).toBe("2025-06-10");
        expect(updated.actualHighlights).toEqual(["Shipped feature X"]);
        expect(updated.habits).toEqual([]);
    });

    it("merges reflection fields (preserves existing mood when only updating notes)", async () => {
        const existing: DailyLog = {
            date: "2025-06-10",
            habits: [],
            reflection: { notes: "Old notes", mood: "good", energyRating: 4 },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        store.set("daily-logs/2025-06-10.json", existing);

        const updated = await updateDailyLog("2025-06-10", {
            reflection: { notes: "New notes" },
        });
        expect(updated.reflection.notes).toBe("New notes");
        expect(updated.reflection.mood).toBe("good");
        expect(updated.reflection.energyRating).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// getRecentLogs
// ---------------------------------------------------------------------------

describe("getRecentLogs", () => {
    it("returns empty array when no logs directory exists", async () => {
        const logs = await getRecentLogs();
        expect(logs).toEqual([]);
    });

    it("returns logs sorted descending by date", async () => {
        const log1: DailyLog = {
            date: "2025-06-08",
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        const log2: DailyLog = {
            date: "2025-06-10",
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        const log3: DailyLog = {
            date: "2025-06-09",
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: "",
            updatedAt: "",
        };
        store.set("daily-logs/2025-06-08.json", log1);
        store.set("daily-logs/2025-06-10.json", log2);
        store.set("daily-logs/2025-06-09.json", log3);

        const logs = await getRecentLogs(7);
        expect(logs.map((l) => l.date)).toEqual(["2025-06-10", "2025-06-09", "2025-06-08"]);
    });

    it("limits to N most recent days", async () => {
        for (let i = 1; i <= 5; i++) {
            const date = `2025-06-${String(i).padStart(2, "0")}`;
            store.set(`daily-logs/${date}.json`, {
                date,
                habits: [],
                reflection: { notes: "" },
                plannedHighlights: [],
                actualHighlights: [],
                adjustments: [],
                createdAt: "",
                updatedAt: "",
            });
        }
        const logs = await getRecentLogs(3);
        expect(logs).toHaveLength(3);
        expect(logs[0].date).toBe("2025-06-05");
    });
});
