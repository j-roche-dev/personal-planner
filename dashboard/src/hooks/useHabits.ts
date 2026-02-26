import type { Habit } from "@planner/types";
import { useApi } from "./useApi";

export function useHabits() {
    return useApi<Habit[]>("/api/habits");
}
