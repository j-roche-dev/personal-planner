import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { ChecklistItem, DailyChecklist } from "../types.js";
import { readJSON, writeJSON, getPreferences } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const CHECKLISTS_DIR = "checklists";

function checklistPath(date: string): string {
    return join(CHECKLISTS_DIR, `${date}.json`);
}

function todayDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SIZE_PRIORITY: Record<string, number> = {
    quick: 1,
    medium: 2,
    long: 3,
};

export function sortItems(
    items: ChecklistItem[],
    areaPriority?: Record<string, number>
): ChecklistItem[] {
    const incomplete = items.filter((i) => !i.completed);
    const completed = items.filter((i) => i.completed);

    incomplete.sort((a, b) => {
        if (areaPriority) {
            const aPri = areaPriority[a.area] ?? 999;
            const bPri = areaPriority[b.area] ?? 999;
            if (aPri !== bPri) return aPri - bPri;
        }

        const aSize = SIZE_PRIORITY[a.size ?? "medium"] ?? 2;
        const bSize = SIZE_PRIORITY[b.size ?? "medium"] ?? 2;
        return aSize - bSize;
    });

    completed.sort((a, b) => {
        const aTime = a.completedAt ?? "";
        const bTime = b.completedAt ?? "";
        return aTime.localeCompare(bTime);
    });

    return [...incomplete, ...completed];
}

async function getAreaPriority(): Promise<Record<string, number>> {
    try {
        const prefs = await getPreferences();
        const map: Record<string, number> = {};
        for (const area of prefs.lifeAreas) {
            map[area.name] = area.priority;
        }
        return map;
    } catch {
        return {};
    }
}

async function loadChecklist(date: string): Promise<DailyChecklist | null> {
    try {
        return await readJSON<DailyChecklist>(checklistPath(date));
    } catch {
        return null;
    }
}

async function saveChecklist(checklist: DailyChecklist): Promise<void> {
    await writeJSON(checklistPath(checklist.date), checklist);
}

async function findMostRecentChecklist(beforeDate: string): Promise<DailyChecklist | null> {
    let files: string[];
    try {
        files = await readdir(join(DATA_DIR, CHECKLISTS_DIR));
    } catch {
        return null;
    }

    const dates = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .filter((d) => d < beforeDate)
        .sort()
        .reverse();

    if (dates.length === 0) return null;
    return loadChecklist(dates[0]);
}

export async function getChecklist(date?: string): Promise<DailyChecklist> {
    const targetDate = date || todayDate();
    const priority = await getAreaPriority();

    const existing = await loadChecklist(targetDate);
    if (existing) {
        existing.items = sortItems(existing.items, priority);
        return existing;
    }

    const prior = await findMostRecentChecklist(targetDate);
    const carriedItems: ChecklistItem[] = [];

    if (prior) {
        for (const item of prior.items) {
            if (!item.completed) {
                carriedItems.push({
                    ...item,
                    id: randomUUID(),
                    carriedFrom: item.carriedFrom || prior.date,
                });
            }
        }
    }

    const checklist: DailyChecklist = {
        date: targetDate,
        items: sortItems(carriedItems, priority),
    };
    await saveChecklist(checklist);
    return checklist;
}

export async function addItem(
    text: string,
    area: string,
    size?: "quick" | "medium" | "long",
    deadline?: string
): Promise<DailyChecklist> {
    const checklist = await getChecklist();
    const priority = await getAreaPriority();
    const item: ChecklistItem = {
        id: randomUUID(),
        area,
        text,
        size,
        deadline,
        completed: false,
    };
    checklist.items.push(item);
    checklist.items = sortItems(checklist.items, priority);
    await saveChecklist(checklist);
    return checklist;
}

export async function updateItem(
    id: string,
    updates: {
        text?: string;
        area?: string;
        size?: "quick" | "medium" | "long";
        deadline?: string;
        completed?: boolean;
    }
): Promise<DailyChecklist> {
    const checklist = await getChecklist();
    const item = checklist.items.find((i) => i.id === id);
    if (!item) {
        throw new Error(`Checklist item not found: ${id}`);
    }

    if (updates.text !== undefined) item.text = updates.text;
    if (updates.area !== undefined) item.area = updates.area;
    if (updates.size !== undefined) item.size = updates.size;
    if (updates.deadline !== undefined) item.deadline = updates.deadline;
    if (updates.completed !== undefined) {
        item.completed = updates.completed;
        item.completedAt = updates.completed ? new Date().toISOString() : undefined;
    }

    const priority = await getAreaPriority();
    checklist.items = sortItems(checklist.items, priority);
    await saveChecklist(checklist);
    return checklist;
}

export async function removeItem(id: string): Promise<DailyChecklist> {
    const checklist = await getChecklist();
    const idx = checklist.items.findIndex((i) => i.id === id);
    if (idx === -1) {
        throw new Error(`Checklist item not found: ${id}`);
    }
    checklist.items.splice(idx, 1);
    await saveChecklist(checklist);
    return checklist;
}
