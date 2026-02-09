export interface TimeRange {
    start: string; // "HH:mm"
    end: string;
}

export interface TimeBlock {
    day: string; // "monday", "tuesday", etc.
    start: string;
    end: string;
    label: string; // "Lunch", "Family time"
}

export interface TimeSlot {
    start: string; // ISO datetime
    end: string;
    duration: number; // minutes
    energyLevel: "high" | "medium" | "low";
}

export interface UserPreferences {
    energyPatterns: {
        highEnergy: TimeRange[];
        mediumEnergy: TimeRange[];
        lowEnergy: TimeRange[];
    };
    lifeAreas: {
        name: string;
        weeklyTargetHours: number;
        priority: number; // 1 = highest
    }[];
    schedulingRules: {
        minBreakBetweenEvents: number; // minutes
        maxMeetingsPerDay: number;
        protectedBlocks: TimeBlock[];
        preferredPlanningDay: string;
    };
}

export interface Habit {
    id: string;
    name: string;
    weeklyTarget: number;
    lifeArea: string;
    defaultDuration: number; // minutes
    preferredTimeOfDay: "morning" | "afternoon" | "evening" | "any";
}

export interface HabitLog {
    habitId: string;
    date: string; // ISO date
    completed: boolean;
    duration?: number; // actual minutes
    notes?: string;
}

export interface ScheduleAnalysis {
    date: string;
    density: "light" | "moderate" | "heavy" | "overloaded";
    conflicts: Conflict[];
    lifeAreaBreakdown: {
        area: string;
        scheduledHours: number;
        targetHours: number;
        dailyTarget: number;
        delta: number;
    }[];
    freeSlots: TimeSlot[];
    warnings: string[];
}

export interface Conflict {
    type: "overlap" | "overcommitment" | "energy_mismatch" | "habit_gap";
    severity: "low" | "medium" | "high";
    description: string;
    affectedEvents: string[];
    suggestedResolutions: string[];
}
