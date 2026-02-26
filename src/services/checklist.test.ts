import { describe, it, expect, vi, beforeEach } from "vitest";
import { sortItems } from "./checklist.js";
import type { ChecklistItem, DailyChecklist } from "../types.js";

// ---------------------------------------------------------------------------
// Mock storage — intercept readJSON / writeJSON so we never hit disk
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
    getPreferences: vi.fn(async () => {
        if (store.has("preferences.json")) return store.get("preferences.json");
        return {
            energyPatterns: { highEnergy: [], mediumEnergy: [], lowEnergy: [] },
            lifeAreas: [
                { name: "work", weeklyTargetHours: 40, priority: 1 },
                { name: "fitness", weeklyTargetHours: 5, priority: 2 },
                { name: "personal", weeklyTargetHours: 10, priority: 3 },
            ],
            schedulingRules: {
                minBreakBetweenEvents: 15,
                maxMeetingsPerDay: 6,
                protectedBlocks: [],
                preferredPlanningDay: "sunday",
            },
        };
    }),
}));

// Mock readdir for findMostRecentChecklist
vi.mock("node:fs/promises", () => ({
    readdir: vi.fn(async () => {
        const files: string[] = [];
        for (const key of store.keys()) {
            if (key.startsWith("checklists/")) {
                files.push(key.replace("checklists/", ""));
            }
        }
        return files;
    }),
}));

// Mock crypto.randomUUID so IDs are predictable
let uuidCounter = 0;
vi.mock("node:crypto", () => ({
    randomUUID: () => `test-id-${++uuidCounter}`,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { getChecklist, addItem, updateItem, removeItem } = await import("./checklist.js");

function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
    store.clear();
    uuidCounter = 0;
});

// ---------------------------------------------------------------------------
// sortItems (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe("sortItems", () => {
    it("sorts incomplete items before completed items", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Done task", completed: true, completedAt: "2025-01-01T10:00:00Z" },
            { id: "2", area: "work", text: "Open task", completed: false },
        ];
        const sorted = sortItems(items);
        expect(sorted[0].id).toBe("2");
        expect(sorted[1].id).toBe("1");
    });

    it("sorts by area priority when provided", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "personal", text: "Personal task", completed: false },
            { id: "2", area: "work", text: "Work task", completed: false },
            { id: "3", area: "fitness", text: "Fitness task", completed: false },
            { id: "4", area: "other", text: "Other task", completed: false },
        ];
        const priority = { work: 1, fitness: 2, personal: 3 };
        const sorted = sortItems(items, priority);
        expect(sorted.map((i) => i.area)).toEqual(["work", "fitness", "personal", "other"]);
    });

    it("sorts by size within same area (quick > medium > long)", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Long task", size: "long", completed: false },
            { id: "2", area: "work", text: "Quick task", size: "quick", completed: false },
            { id: "3", area: "work", text: "Medium task", size: "medium", completed: false },
        ];
        const sorted = sortItems(items);
        expect(sorted.map((i) => i.size)).toEqual(["quick", "medium", "long"]);
    });

    it("treats missing size as medium", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "No size", completed: false },
            { id: "2", area: "work", text: "Quick", size: "quick", completed: false },
            { id: "3", area: "work", text: "Long", size: "long", completed: false },
        ];
        const sorted = sortItems(items);
        expect(sorted.map((i) => i.id)).toEqual(["2", "1", "3"]);
    });

    it("sorts completed items by completedAt time", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Done later", completed: true, completedAt: "2025-01-01T12:00:00Z" },
            { id: "2", area: "work", text: "Done first", completed: true, completedAt: "2025-01-01T10:00:00Z" },
        ];
        const sorted = sortItems(items);
        expect(sorted[0].id).toBe("2");
        expect(sorted[1].id).toBe("1");
    });
});

// ---------------------------------------------------------------------------
// getChecklist
// ---------------------------------------------------------------------------

describe("getChecklist", () => {
    it("returns an empty checklist for a new date with no prior data", async () => {
        const result = await getChecklist("2025-06-10");
        expect(result.date).toBe("2025-06-10");
        expect(result.items).toEqual([]);
    });

    it("returns existing checklist if one exists", async () => {
        const existing: DailyChecklist = {
            date: "2025-06-10",
            items: [
                { id: "abc", area: "work", text: "Existing task", completed: false },
            ],
        };
        store.set("checklists/2025-06-10.json", existing);

        const result = await getChecklist("2025-06-10");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].text).toBe("Existing task");
    });

    it("carries over incomplete items from most recent prior checklist", async () => {
        const prior: DailyChecklist = {
            date: "2025-06-09",
            items: [
                { id: "old-1", area: "work", text: "Incomplete task", completed: false },
                { id: "old-2", area: "fitness", text: "Done task", completed: true, completedAt: "2025-06-09T15:00:00Z" },
            ],
        };
        store.set("checklists/2025-06-09.json", prior);

        const result = await getChecklist("2025-06-10");
        expect(result.date).toBe("2025-06-10");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].text).toBe("Incomplete task");
        expect(result.items[0].carriedFrom).toBe("2025-06-09");
        expect(result.items[0].id).not.toBe("old-1");
    });

    it("preserves original carriedFrom when carrying over already-carried items", async () => {
        const prior: DailyChecklist = {
            date: "2025-06-09",
            items: [
                { id: "old-1", area: "work", text: "Old carried task", completed: false, carriedFrom: "2025-06-07" },
            ],
        };
        store.set("checklists/2025-06-09.json", prior);

        const result = await getChecklist("2025-06-10");
        expect(result.items[0].carriedFrom).toBe("2025-06-07");
    });

    it("preserves deadline through carry-over", async () => {
        const prior: DailyChecklist = {
            date: "2025-06-09",
            items: [
                { id: "old-1", area: "work", text: "Deadline task", completed: false, deadline: "2025-06-12" },
            ],
        };
        store.set("checklists/2025-06-09.json", prior);

        const result = await getChecklist("2025-06-10");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].deadline).toBe("2025-06-12");
        expect(result.items[0].carriedFrom).toBe("2025-06-09");
    });

    it("persists the newly created checklist to storage", async () => {
        await getChecklist("2025-06-10");
        expect(store.has("checklists/2025-06-10.json")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// addItem
// ---------------------------------------------------------------------------

describe("addItem", () => {
    it("adds an item to today's checklist", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, { date: t, items: [] });

        const result = await addItem("Deploy changes", "work", "medium");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].text).toBe("Deploy changes");
        expect(result.items[0].area).toBe("work");
        expect(result.items[0].size).toBe("medium");
        expect(result.items[0].completed).toBe(false);
    });

    it("adds an item with a deadline", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, { date: t, items: [] });

        const result = await addItem("Ship feature", "work", "medium", "2025-06-15");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].deadline).toBe("2025-06-15");
    });

    it("adds items in sorted order", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, { date: t, items: [] });

        await addItem("Personal errand", "personal", "long");
        const result = await addItem("Quick work fix", "work", "quick");

        // work (priority 1) should come before personal (priority 3)
        expect(result.items[0].area).toBe("work");
        expect(result.items[1].area).toBe("personal");
    });
});

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

describe("updateItem", () => {
    it("marks an item as completed and sets completedAt", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Task", completed: false }],
        });

        const result = await updateItem("item-1", { completed: true });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.completed).toBe(true);
        expect(item.completedAt).toBeTruthy();
    });

    it("clears completedAt when marking incomplete", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Task", completed: true, completedAt: "2025-06-10T10:00:00Z" }],
        });

        const result = await updateItem("item-1", { completed: false });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.completed).toBe(false);
        expect(item.completedAt).toBeUndefined();
    });

    it("updates text and area", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Old text", completed: false }],
        });

        const result = await updateItem("item-1", { text: "New text", area: "fitness" });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.text).toBe("New text");
        expect(item.area).toBe("fitness");
    });

    it("updates an item's deadline", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Task", completed: false }],
        });

        const result = await updateItem("item-1", { deadline: "2025-07-01" });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.deadline).toBe("2025-07-01");
    });

    it("throws for non-existent item", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [],
        });

        await expect(updateItem("nonexistent", { completed: true })).rejects.toThrow(
            "Checklist item not found"
        );
    });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe("removeItem", () => {
    it("removes an item from the checklist", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [
                { id: "item-1", area: "work", text: "Task 1", completed: false },
                { id: "item-2", area: "fitness", text: "Task 2", completed: false },
            ],
        });

        const result = await removeItem("item-1");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe("item-2");
    });

    it("throws for non-existent item", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [],
        });

        await expect(removeItem("nonexistent")).rejects.toThrow("Checklist item not found");
    });
});
