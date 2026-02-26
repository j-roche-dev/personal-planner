import type { DailyLog, ChecklistItem } from "@planner/types";
import { getAreaColor, MOOD_EMOJI } from "../constants";

interface Props {
    log: DailyLog | null;
    completedItems: ChecklistItem[];
}

export default function DailyLogPanel({ log, completedItems }: Props) {
    const hasLog = log !== null;
    const hasCompleted = completedItems.length > 0;
    const hasContent = hasLog || hasCompleted;

    if (!hasContent) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Daily Log
                </h2>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                    No log yet. Start your day with a daily check-in.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Planned Highlights */}
            {hasLog && log.plannedHighlights.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Planned Highlights
                    </h3>
                    <ul className="space-y-1">
                        {log.plannedHighlights.map((h, i) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Completed Work */}
            {hasCompleted && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Completed Work
                    </h3>
                    <ul className="space-y-2">
                        {completedItems.map((item) => {
                            const color = getAreaColor(item.area);
                            return (
                                <li key={item.id} className="text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>
                                            {item.area}
                                        </span>
                                        <span className="text-gray-700 dark:text-gray-300">
                                            {item.text}
                                        </span>
                                    </div>
                                    {(item.billableHours || item.completionNote) && (
                                        <div className="ml-[calc(0.375rem+var(--badge-w,0px))] mt-0.5 pl-2 text-xs text-gray-500 dark:text-gray-400">
                                            {item.billableHours != null && (
                                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                                    {item.billableHours}h
                                                </span>
                                            )}
                                            {item.billableHours != null && item.completionNote && (
                                                <span className="mx-1">&middot;</span>
                                            )}
                                            {item.completionNote && (
                                                <span>{item.completionNote}</span>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Actual Highlights */}
            {hasLog && log.actualHighlights.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Actual Highlights
                    </h3>
                    <ul className="space-y-1">
                        {log.actualHighlights.map((h, i) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Mood / Energy / Reflection */}
            {hasLog && (log.reflection.mood || log.reflection.energyRating || log.reflection.notes) && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Reflection
                    </h3>
                    <div className="flex flex-wrap gap-4 text-sm">
                        {log.reflection.mood && (
                            <div>
                                <span className="text-gray-500 dark:text-gray-400">Mood: </span>
                                <span>{MOOD_EMOJI[log.reflection.mood] ?? ""} {log.reflection.mood}</span>
                            </div>
                        )}
                        {log.reflection.energyRating && (
                            <div>
                                <span className="text-gray-500 dark:text-gray-400">Energy: </span>
                                <span>{log.reflection.energyRating}/5</span>
                            </div>
                        )}
                    </div>
                    {log.reflection.notes && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            {log.reflection.notes}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
