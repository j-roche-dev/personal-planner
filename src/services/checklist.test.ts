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
        // Return filenames that match dates in the store
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

const { getChecklist, addItem, updateItem, removeItem, chainItems, unchainItem } = await import("./checklist.js");

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
        // Should get a new ID
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

    it("sets billing fields on completion", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Invoice prep", completed: false }],
        });

        const result = await updateItem("item-1", {
            completed: true,
            completionNote: "Feb invoice prep and delivery",
            billableHours: 1.5,
        });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.completed).toBe(true);
        expect(item.completedAt).toBeTruthy();
        expect(item.completionNote).toBe("Feb invoice prep and delivery");
        expect(item.billableHours).toBe(1.5);
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

// ---------------------------------------------------------------------------
// sortItems — chain behavior
// ---------------------------------------------------------------------------

describe("sortItems — chains", () => {
    it("sorts chained items before standalone within same area", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Standalone", size: "quick", completed: false },
            { id: "2", area: "work", text: "Chain B", completed: false, chainId: "c1", chainOrder: 1 },
            { id: "3", area: "work", text: "Chain A", completed: false, chainId: "c1", chainOrder: 0 },
        ];
        const sorted = sortItems(items);
        expect(sorted.map((i) => i.id)).toEqual(["3", "2", "1"]);
    });

    it("groups multiple chains separately, sorted by chainOrder", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Chain2 Step2", completed: false, chainId: "c2", chainOrder: 1 },
            { id: "2", area: "work", text: "Chain1 Step1", completed: false, chainId: "c1", chainOrder: 0 },
            { id: "3", area: "work", text: "Chain2 Step1", completed: false, chainId: "c2", chainOrder: 0 },
            { id: "4", area: "work", text: "Chain1 Step2", completed: false, chainId: "c1", chainOrder: 1 },
        ];
        const sorted = sortItems(items);
        // Chains grouped together, each sorted by chainOrder
        const chain1 = sorted.filter((i) => i.chainId === "c1");
        const chain2 = sorted.filter((i) => i.chainId === "c2");
        expect(chain1.map((i) => i.chainOrder)).toEqual([0, 1]);
        expect(chain2.map((i) => i.chainOrder)).toEqual([0, 1]);
        // All chained items before any standalone
        expect(sorted.length).toBe(4);
    });

    it("does not affect cross-area sorting", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "fitness", text: "Fitness standalone", completed: false },
            { id: "2", area: "work", text: "Work chained", completed: false, chainId: "c1", chainOrder: 0 },
        ];
        const priority = { work: 1, fitness: 2 };
        const sorted = sortItems(items, priority);
        expect(sorted[0].area).toBe("work");
        expect(sorted[1].area).toBe("fitness");
    });

    it("completed chained items sort with completed group", () => {
        const items: ChecklistItem[] = [
            { id: "1", area: "work", text: "Open", completed: false },
            { id: "2", area: "work", text: "Done chained", completed: true, completedAt: "2025-01-01T10:00:00Z", chainId: "c1", chainOrder: 0 },
        ];
        const sorted = sortItems(items);
        expect(sorted[0].id).toBe("1");
        expect(sorted[1].id).toBe("2");
    });
});

// ---------------------------------------------------------------------------
// addItem — chain fields
// ---------------------------------------------------------------------------

describe("addItem — chain fields", () => {
    it("accepts and persists chainId and chainOrder", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, { date: t, items: [] });

        const result = await addItem("Step 1", "work", "medium", undefined, "chain-abc", 0);
        expect(result.items[0].chainId).toBe("chain-abc");
        expect(result.items[0].chainOrder).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// updateItem — chain fields
// ---------------------------------------------------------------------------

describe("updateItem — chain fields", () => {
    it("adds chain fields to an item", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Task", completed: false }],
        });

        const result = await updateItem("item-1", { chainId: "chain-x", chainOrder: 2 });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.chainId).toBe("chain-x");
        expect(item.chainOrder).toBe(2);
    });

    it("unchains an item when chainId is null", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Task", completed: false, chainId: "c1", chainOrder: 0 }],
        });

        const result = await updateItem("item-1", { chainId: null });
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.chainId).toBeUndefined();
        expect(item.chainOrder).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// chainItems
// ---------------------------------------------------------------------------

describe("chainItems", () => {
    it("chains items in specified order", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [
                { id: "a", area: "work", text: "First", completed: false },
                { id: "b", area: "work", text: "Second", completed: false },
                { id: "c", area: "work", text: "Third", completed: false },
            ],
        });

        const result = await chainItems(["a", "b", "c"]);
        const chained = result.items.filter((i) => i.chainId);
        expect(chained).toHaveLength(3);
        // All share the same chainId
        const ids = new Set(chained.map((i) => i.chainId));
        expect(ids.size).toBe(1);
        // Orders are sequential
        const byOrder = chained.sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));
        expect(byOrder.map((i) => i.id)).toEqual(["a", "b", "c"]);
        expect(byOrder.map((i) => i.chainOrder)).toEqual([0, 1, 2]);
    });

    it("throws for missing item ID", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "a", area: "work", text: "Only one", completed: false }],
        });

        await expect(chainItems(["a", "nonexistent"])).rejects.toThrow("Checklist item not found");
    });

    it("throws when items are in different areas", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [
                { id: "a", area: "work", text: "Work task", completed: false },
                { id: "b", area: "fitness", text: "Fitness task", completed: false },
            ],
        });

        await expect(chainItems(["a", "b"])).rejects.toThrow("same area");
    });

    it("throws when fewer than 2 items", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, { date: t, items: [] });

        await expect(chainItems(["a"])).rejects.toThrow("at least 2 items");
    });
});

// ---------------------------------------------------------------------------
// unchainItem
// ---------------------------------------------------------------------------

describe("unchainItem", () => {
    it("removes item from chain and renumbers remaining", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [
                { id: "a", area: "work", text: "First", completed: false, chainId: "c1", chainOrder: 0 },
                { id: "b", area: "work", text: "Second", completed: false, chainId: "c1", chainOrder: 1 },
                { id: "c", area: "work", text: "Third", completed: false, chainId: "c1", chainOrder: 2 },
            ],
        });

        const result = await unchainItem("b");
        const unchained = result.items.find((i) => i.id === "b")!;
        expect(unchained.chainId).toBeUndefined();
        expect(unchained.chainOrder).toBeUndefined();

        const remaining = result.items.filter((i) => i.chainId === "c1");
        expect(remaining).toHaveLength(2);
        expect(remaining.map((i) => i.chainOrder)).toEqual([0, 1]);
    });

    it("dissolves chain when only one item would remain", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [
                { id: "a", area: "work", text: "First", completed: false, chainId: "c1", chainOrder: 0 },
                { id: "b", area: "work", text: "Second", completed: false, chainId: "c1", chainOrder: 1 },
            ],
        });

        const result = await unchainItem("a");
        // Both should be unchained now
        for (const item of result.items) {
            expect(item.chainId).toBeUndefined();
            expect(item.chainOrder).toBeUndefined();
        }
    });

    it("throws for item not in a chain", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "a", area: "work", text: "Standalone", completed: false }],
        });

        await expect(unchainItem("a")).rejects.toThrow("not part of a chain");
    });
});

// ---------------------------------------------------------------------------
// Carry-over — chain fields
// ---------------------------------------------------------------------------

describe("carry-over — chain fields", () => {
    it("preserves chainId and chainOrder through carry-over", async () => {
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [
                { id: "a", area: "work", text: "Chained task", completed: false, chainId: "c1", chainOrder: 0 },
                { id: "b", area: "work", text: "Chained task 2", completed: false, chainId: "c1", chainOrder: 1 },
            ],
        });

        const result = await getChecklist("2025-06-10");
        expect(result.items).toHaveLength(2);
        expect(result.items[0].chainId).toBe("c1");
        expect(result.items[0].chainOrder).toBe(0);
        expect(result.items[1].chainId).toBe("c1");
        expect(result.items[1].chainOrder).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Explicit date parameter
// ---------------------------------------------------------------------------

describe("explicit date parameter", () => {
    it("updateItem with explicit date updates that day's checklist", async () => {
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [{ id: "item-1", area: "work", text: "Old task", completed: false }],
        });

        const result = await updateItem("item-1", { completed: true }, "2025-06-09");
        const item = result.items.find((i) => i.id === "item-1")!;
        expect(item.completed).toBe(true);
        expect(result.date).toBe("2025-06-09");
    });

    it("addItem with explicit date targets the correct checklist", async () => {
        store.set("checklists/2025-06-09.json", { date: "2025-06-09", items: [] });

        const result = await addItem("New task", "work", "medium", undefined, undefined, undefined, "2025-06-09");
        expect(result.date).toBe("2025-06-09");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].text).toBe("New task");
    });

    it("removeItem with explicit date targets the correct checklist", async () => {
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [
                { id: "item-1", area: "work", text: "Task 1", completed: false },
                { id: "item-2", area: "fitness", text: "Task 2", completed: false },
            ],
        });

        const result = await removeItem("item-1", "2025-06-09");
        expect(result.date).toBe("2025-06-09");
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe("item-2");
    });

    it("chainItems with explicit date targets the correct checklist", async () => {
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [
                { id: "a", area: "work", text: "First", completed: false },
                { id: "b", area: "work", text: "Second", completed: false },
            ],
        });

        const result = await chainItems(["a", "b"], "2025-06-09");
        expect(result.date).toBe("2025-06-09");
        const chained = result.items.filter((i) => i.chainId);
        expect(chained).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// Cascade — completing past items marks carried-over copies complete
// ---------------------------------------------------------------------------

describe("cascade on past item completion", () => {
    it("completing a past item cascades to carried-over copy in a subsequent day", async () => {
        const t = today();
        // Yesterday's checklist with an incomplete item
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [{ id: "orig-1", area: "work", text: "Deploy changes", completed: false }],
        });
        // Today's checklist with a carried-over copy
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "carried-1", area: "work", text: "Deploy changes", completed: false, carriedFrom: "2025-06-09" }],
        });

        // Complete the original item on the past date
        await updateItem("orig-1", { completed: true }, "2025-06-09");

        // Check that today's copy is also marked complete
        const todayChecklist = store.get(`checklists/${t}.json`) as DailyChecklist;
        const carriedItem = todayChecklist.items.find((i) => i.id === "carried-1")!;
        expect(carriedItem.completed).toBe(true);
        expect(carriedItem.completedAt).toBeTruthy();
    });

    it("cascade propagates completionNote and billableHours", async () => {
        const t = today();
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [{ id: "orig-1", area: "work", text: "Invoice prep", completed: false }],
        });
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "carried-1", area: "work", text: "Invoice prep", completed: false, carriedFrom: "2025-06-09" }],
        });

        await updateItem("orig-1", {
            completed: true,
            completionNote: "February invoice",
            billableHours: 1.5,
        }, "2025-06-09");

        const todayChecklist = store.get(`checklists/${t}.json`) as DailyChecklist;
        const carriedItem = todayChecklist.items.find((i) => i.id === "carried-1")!;
        expect(carriedItem.completed).toBe(true);
        expect(carriedItem.completionNote).toBe("February invoice");
        expect(carriedItem.billableHours).toBe(1.5);
    });

    it("no cascade when item text differs (edited after carry-over)", async () => {
        const t = today();
        store.set("checklists/2025-06-09.json", {
            date: "2025-06-09",
            items: [{ id: "orig-1", area: "work", text: "Deploy changes", completed: false }],
        });
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "carried-1", area: "work", text: "Deploy changes v2", completed: false, carriedFrom: "2025-06-09" }],
        });

        await updateItem("orig-1", { completed: true }, "2025-06-09");

        const todayChecklist = store.get(`checklists/${t}.json`) as DailyChecklist;
        const carriedItem = todayChecklist.items.find((i) => i.id === "carried-1")!;
        expect(carriedItem.completed).toBe(false);
    });

    it("no cascade when updating today's items (only past dates trigger cascade)", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Today task", completed: false }],
        });

        // Completing an item on today should NOT trigger cascade logic
        const result = await updateItem("item-1", { completed: true }, t);
        expect(result.items.find((i) => i.id === "item-1")!.completed).toBe(true);
    });

    it("no cascade when completing without explicit date (defaults to today)", async () => {
        const t = today();
        store.set(`checklists/${t}.json`, {
            date: t,
            items: [{ id: "item-1", area: "work", text: "Today task", completed: false }],
        });

        const result = await updateItem("item-1", { completed: true });
        expect(result.items.find((i) => i.id === "item-1")!.completed).toBe(true);
    });
});
