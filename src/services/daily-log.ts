import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DailyLog, Habit } from "../types.js";
import { readJSON, writeJSON } from "./storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const LOGS_DIR = "daily-logs";

function logPath(date: string): string {
    return join(LOGS_DIR, `${date}.json`);
}

function todayDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getDailyLog(date?: string): Promise<DailyLog | null> {
    const targetDate = date || todayDate();
    try {
        return await readJSON<DailyLog>(logPath(targetDate));
    } catch {
        return null;
    }
}

export async function saveDailyLog(log: DailyLog): Promise<void> {
    await writeJSON(logPath(log.date), log);
}

export async function createDailyLog(
    date: string,
    habits: Habit[]
): Promise<DailyLog> {
    const now = new Date().toISOString();
    const log: DailyLog = {
        date,
        habits: habits.map((h) => ({
            habitId: h.id,
            habitName: h.name,
            completed: false,
        })),
        reflection: { notes: "" },
        plannedHighlights: [],
        actualHighlights: [],
        adjustments: [],
        createdAt: now,
        updatedAt: now,
    };
    await saveDailyLog(log);
    return log;
}

export async function updateDailyLog(
    date: string,
    updates: {
        habits?: DailyLog["habits"];
        reflection?: Partial<DailyLog["reflection"]>;
        plannedHighlights?: string[];
        actualHighlights?: string[];
        adjustments?: string[];
    }
): Promise<DailyLog> {
    let log = await getDailyLog(date);
    if (!log) {
        log = {
            date,
            habits: [],
            reflection: { notes: "" },
            plannedHighlights: [],
            actualHighlights: [],
            adjustments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    if (updates.habits !== undefined) log.habits = updates.habits;
    if (updates.reflection !== undefined) {
        log.reflection = { ...log.reflection, ...updates.reflection };
    }
    if (updates.plannedHighlights !== undefined) log.plannedHighlights = updates.plannedHighlights;
    if (updates.actualHighlights !== undefined) log.actualHighlights = updates.actualHighlights;
    if (updates.adjustments !== undefined) log.adjustments = updates.adjustments;

    log.updatedAt = new Date().toISOString();
    await saveDailyLog(log);
    return log;
}

export async function getRecentLogs(days: number = 7): Promise<DailyLog[]> {
    let files: string[];
    try {
        files = await readdir(join(DATA_DIR, LOGS_DIR));
    } catch {
        return [];
    }

    const dates = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .sort()
        .reverse()
        .slice(0, days);

    const logs: DailyLog[] = [];
    for (const date of dates) {
        const log = await getDailyLog(date);
        if (log) logs.push(log);
    }
    return logs;
}
