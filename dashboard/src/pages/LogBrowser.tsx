import { useState } from "react";
import { addDays, subDays, format, parseISO } from "date-fns";
import { useDailyLog, useDailyLogDates } from "../hooks/useDailyLog";
import { useChecklist } from "../hooks/useChecklist";
import ChecklistView from "../components/ChecklistView";
import { formatDate, todayDateStr, MOOD_EMOJI } from "../constants";

function toDateStr(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

export default function LogBrowser() {
    const [currentDate, setCurrentDate] = useState(() => parseISO(todayDateStr()));
    const dateStr = toDateStr(currentDate);

    const log = useDailyLog(dateStr);
    const checklist = useChecklist(dateStr);
    const logDates = useDailyLogDates();

    const hasLogForDate = new Set(logDates.data ?? []);
    const isToday = dateStr === todayDateStr();

    const goBack = () => setCurrentDate((d) => subDays(d, 1));
    const goForward = () => setCurrentDate((d) => addDays(d, 1));

    return (
        <div className="space-y-6">
            {/* Date navigation */}
            <div className="flex items-center gap-4">
                <button
                    onClick={goBack}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                    &larr; Prev
                </button>
                <div className="flex-1 text-center">
                    <h1 className="text-xl font-bold">{formatDate(dateStr)}</h1>
                    {isToday && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Today
                        </span>
                    )}
                </div>
                <button
                    onClick={goForward}
                    disabled={isToday}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                    Next &rarr;
                </button>
            </div>

            {/* Date indicator dots */}
            {logDates.data && logDates.data.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {logDates.data.slice(0, 30).map((d) => (
                        <button
                            key={d}
                            onClick={() => setCurrentDate(parseISO(d))}
                            title={d}
                            className={`h-2.5 w-2.5 rounded-full transition-colors ${
                                d === dateStr
                                    ? "bg-blue-500"
                                    : "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500"
                            }`}
                        />
                    ))}
                </div>
            )}

            {/* Loading */}
            {log.loading && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    Loading...
                </div>
            )}

            {/* No log exists */}
            {!log.loading && !log.data && (
                <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-gray-500 dark:text-gray-400">
                        No log for this date.
                    </p>
                    <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                        Logs are created during daily check-ins.
                        {!hasLogForDate.has(dateStr) &&
                            logDates.data &&
                            logDates.data.length > 0 &&
                            " Try clicking a dot above to jump to a date with data."}
                    </p>
                </div>
            )}

            {/* Log details */}
            {log.data && (
                <div className="space-y-5">
                    {/* Reflection */}
                    <Section title="Reflection">
                        <div className="flex flex-wrap gap-4 text-sm">
                            {log.data.reflection.mood && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Mood:
                                    </span>
                                    <span className="font-medium">
                                        {MOOD_EMOJI[log.data.reflection.mood]}{" "}
                                        {log.data.reflection.mood}
                                    </span>
                                </div>
                            )}
                            {log.data.reflection.energyRating != null && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Energy:
                                    </span>
                                    <EnergyBar
                                        rating={log.data.reflection.energyRating}
                                    />
                                </div>
                            )}
                        </div>
                        {log.data.reflection.notes && (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {log.data.reflection.notes}
                            </p>
                        )}
                    </Section>

                    {/* Habits */}
                    {log.data.habits.length > 0 && (
                        <Section title="Habits">
                            <div className="space-y-2">
                                {log.data.habits.map((h) => (
                                    <div
                                        key={h.habitId}
                                        className="flex items-center gap-3 text-sm"
                                    >
                                        <span
                                            className={`text-lg ${
                                                h.completed
                                                    ? "text-green-500"
                                                    : "text-red-400"
                                            }`}
                                        >
                                            {h.completed ? "\u2713" : "\u2717"}
                                        </span>
                                        <span className="font-medium text-gray-800 dark:text-gray-200">
                                            {h.habitName}
                                        </span>
                                        {h.duration && (
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {h.duration}min
                                            </span>
                                        )}
                                        {h.notes && (
                                            <span className="text-gray-400 dark:text-gray-500">
                                                — {h.notes}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Highlights */}
                    {(log.data.plannedHighlights.length > 0 ||
                        log.data.actualHighlights.length > 0) && (
                        <div className="grid gap-5 sm:grid-cols-2">
                            {log.data.plannedHighlights.length > 0 && (
                                <Section title="Planned Highlights">
                                    <ul className="space-y-1">
                                        {log.data.plannedHighlights.map(
                                            (h, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-gray-700 dark:text-gray-300"
                                                >
                                                    {h}
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </Section>
                            )}
                            {log.data.actualHighlights.length > 0 && (
                                <Section title="Actual Highlights">
                                    <ul className="space-y-1">
                                        {log.data.actualHighlights.map(
                                            (h, i) => (
                                                <li
                                                    key={i}
                                                    className="text-sm text-gray-700 dark:text-gray-300"
                                                >
                                                    {h}
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </Section>
                            )}
                        </div>
                    )}

                    {/* Adjustments */}
                    {log.data.adjustments.length > 0 && (
                        <Section title="Adjustments">
                            <ul className="space-y-1">
                                {log.data.adjustments.map((a, i) => (
                                    <li
                                        key={i}
                                        className="text-sm text-gray-700 dark:text-gray-300"
                                    >
                                        {a}
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}
                </div>
            )}

            {/* Checklist for this date */}
            {!checklist.loading && checklist.data && checklist.data.items.length > 0 && (
                <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Checklist
                    </h2>
                    <ChecklistView items={checklist.data.items} />
                </div>
            )}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {title}
            </h2>
            {children}
        </div>
    );
}

function EnergyBar({ rating }: { rating: number }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <div
                    key={n}
                    className={`h-3 w-3 rounded-sm ${
                        n <= rating
                            ? "bg-amber-400 dark:bg-amber-500"
                            : "bg-gray-200 dark:bg-gray-700"
                    }`}
                />
            ))}
            <span className="ml-1 text-sm font-medium">{rating}/5</span>
        </div>
    );
}
