import { useChecklist } from "../hooks/useChecklist";
import { useDailyLog } from "../hooks/useDailyLog";
import ChecklistView from "../components/ChecklistView";
import DailyLogPanel from "../components/DailyLogPanel";
import { formatDate, todayDateStr } from "../constants";

export default function Today() {
    const today = todayDateStr();
    const checklist = useChecklist(today);
    const log = useDailyLog(today);

    const items = checklist.data?.items ?? [];
    const completed = items.filter((i) => i.completed).length;
    const total = items.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedItems = items
        .filter((i) => i.completed)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

    return (
        <div className="space-y-6">
            {/* Summary bar */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-2xl font-bold">{formatDate(today)}</h1>
                {total > 0 && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {completed}/{total} completed
                        </span>
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                                className="h-full rounded-full bg-green-500 transition-all"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {pct}%
                        </span>
                    </div>
                )}
            </div>

            {/* Loading state */}
            {checklist.loading && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    Loading...
                </div>
            )}

            {/* Error state */}
            {checklist.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    Error loading checklist: {checklist.error}
                </div>
            )}

            {/* Two-column layout */}
            {!checklist.loading && !checklist.error && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    {/* Left column: Checklist */}
                    <div className="lg:col-span-3">
                        <ChecklistView items={items} />
                    </div>

                    {/* Right column: Daily Log */}
                    <div className="lg:col-span-2">
                        <div className="lg:sticky lg:top-6">
                            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Daily Log
                            </h2>
                            <DailyLogPanel
                                log={log.data ?? null}
                                completedItems={completedItems}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
