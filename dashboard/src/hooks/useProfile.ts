import type { UserProfile } from "@planner/types";
import { useApi } from "./useApi";

export function useProfile() {
    return useApi<UserProfile>("/api/profile");
}
