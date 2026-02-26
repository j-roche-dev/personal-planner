import { randomUUID } from "node:crypto";
import type { Habit, DailyLog } from "../types.js";
import { readJSON, writeJSON } from "./storage.js";

const HABITS_FILE = "habits.json";

export async function getHabits(): Promise<Habit[]> {
    try {
        return await readJSON<Habit[]>(HABITS_FILE);
    } catch {
        return [];
    }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
    await writeJSON(HABITS_FILE, habits);
}

export async function addHabit(
    habit: Omit<Habit, "id">
): Promise<Habit> {
    const habits = await getHabits();
    const created: Habit = { id: randomUUID(), ...habit };
    habits.push(created);
    await saveHabits(habits);
    return created;
}

export async function updateHabit(
    id: string,
    updates: Partial<Omit<Habit, "id">>
): Promise<Habit> {
    const habits = await getHabits();
    const idx = habits.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error(`Habit not found: ${id}`);
    habits[idx] = { ...habits[idx], ...updates };
    await saveHabits(habits);
    return habits[idx];
}

export async function removeHabit(id: string): Promise<void> {
    const habits = await getHabits();
    const idx = habits.findIndex((h) => h.id === id);
    if (idx === -1) throw new Error(`Habit not found: ${id}`);
    habits.splice(idx, 1);
    await saveHabits(habits);
}

export function getHabitCompletionRate(
    habitId: string,
    logs: DailyLog[]
): { completed: number; total: number; rate: number } {
    let completed = 0;
    let total = 0;
    for (const log of logs) {
        const entry = log.habits.find((h) => h.habitId === habitId);
        if (entry) {
            total++;
            if (entry.completed) completed++;
        }
    }
    return {
        completed,
        total,
        rate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
}
