import type { DailyChecklist } from "@planner/types";
import { useApi } from "./useApi";

export function useChecklist(date: string) {
    return useApi<DailyChecklist>(`/api/checklist/${date}`);
}

export function useChecklistDates() {
    return useApi<string[]>("/api/checklist/dates");
}
