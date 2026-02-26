const DEFAULT_AREA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    work: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
    fitness: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-800" },
    learning: { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-800" },
    music: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" },
    personal: { bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800" },
    health: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
    social: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
};

const FALLBACK_COLOR = { bg: "bg-gray-100 dark:bg-gray-800/60", text: "text-gray-600 dark:text-gray-300", border: "border-gray-200 dark:border-gray-700" };

export function getAreaColor(area: string) {
    return DEFAULT_AREA_COLORS[area] ?? FALLBACK_COLOR;
}

export const SIZE_LABELS: Record<string, string> = {
    quick: "S",
    medium: "M",
    long: "L",
};

export const MOOD_EMOJI: Record<string, string> = {
    great: "\u{1F7E2}",
    good: "\u{1F535}",
    okay: "\u{1F7E1}",
    rough: "\u{1F7E0}",
    bad: "\u{1F534}",
};

export function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export function todayDateStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DeadlineStatus = "overdue" | "urgent" | "upcoming";

export function getDeadlineStatus(deadline: string): DeadlineStatus | null {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = deadline.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "overdue";
    if (diffDays <= 1) return "urgent";
    return "upcoming";
}

export function formatDeadlineLabel(deadline: string): string {
    const [y, m, d] = deadline.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    return `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
