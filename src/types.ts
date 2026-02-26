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

export interface SchedulingRules {
    minBreakBetweenEvents: number; // minutes
    maxMeetingsPerDay: number;
    protectedBlocks: TimeBlock[];
    preferredPlanningDay: string;
    plannerCalendarId?: string;
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
    schedulingRules: SchedulingRules;
    categoryKeywords?: Record<string, string[]>;
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

export interface ChecklistItem {
    id: string;
    area: string;
    text: string;
    size?: "quick" | "medium" | "long";
    deadline?: string; // YYYY-MM-DD
    completed: boolean;
    carriedFrom?: string;
    completedAt?: string;
    completionNote?: string;
    billableHours?: number;
}

export interface DailyChecklist {
    date: string;
    items: ChecklistItem[];
}

export interface UserProfile {
    name: string;
    bio: string;
    goals: string[];
    planningCadence: {
        weeklyPlanningTime: string;
        dailyCheckinTime: string;
        weeklyReviewTime: string;
    };
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export interface DailyLog {
    date: string;
    habits: HabitEntry[];
    reflection: {
        notes: string;
        mood?: "great" | "good" | "okay" | "rough" | "bad";
        energyRating?: number;
    };
    plannedHighlights: string[];
    actualHighlights: string[];
    adjustments: string[];
    createdAt: string;
    updatedAt: string;
}

export interface HabitEntry {
    habitId: string;
    habitName: string;
    completed: boolean;
    duration?: number;
    notes?: string;
}

export interface SetupStatus {
    technicalSetupComplete: boolean;
    personalSetupComplete: boolean;
    completedAt?: string;
}
