import type { DailyLog } from "@planner/types";
import { useApi } from "./useApi";

export function useDailyLog(date: string) {
    return useApi<DailyLog>(`/api/daily-log/${date}`);
}

export function useDailyLogDates() {
    return useApi<string[]>("/api/daily-log/dates");
}

export function useRecentLogs(days: number) {
    return useApi<DailyLog[]>(`/api/daily-log/recent/${days}`);
}
