import { useState } from "react";
import { useRecentLogs } from "../hooks/useDailyLog";
import { useHabits } from "../hooks/useHabits";
import HabitGrid from "../components/HabitGrid";
import MoodEnergyChart from "../components/MoodEnergyChart";
import ChecklistThroughput from "../components/ChecklistThroughput";

type Range = 7 | 14 | 30;

export default function Trends() {
    const [range, setRange] = useState<Range>(7);
    const logs = useRecentLogs(range);
    const habits = useHabits();

    const hasData =
        !logs.loading && logs.data != null && logs.data.length >= 1;

    return (
        <div className="space-y-6">
            {/* Header + range toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-bold">Trends</h1>
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-700">
                    {([7, 14, 30] as Range[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                                range === r
                                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                                    : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                            }`}
                        >
                            {r}d
                        </button>
                    ))}
                </div>
            </div>

            {logs.loading && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    Loading...
                </div>
            )}

            {/* Empty state */}
            {!logs.loading && (!logs.data || logs.data.length === 0) && (
                <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-gray-500 dark:text-gray-400">
                        Trends will appear after a few days of daily check-ins.
                    </p>
                    <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                        Use the daily check-in to start logging habits,
                        mood, and energy.
                    </p>
                </div>
            )}

            {hasData && (
                <div className="space-y-6">
                    {/* Habit completion grid */}
                    <Section title="Habit Completion">
                        <HabitGrid
                            habits={habits.data ?? []}
                            logs={logs.data!}
                            days={range}
                        />
                    </Section>

                    {/* Mood / energy chart */}
                    <Section title="Mood & Energy">
                        <MoodEnergyChart logs={logs.data!} />
                    </Section>

                    {/* Checklist throughput */}
                    <Section title="Checklist Throughput">
                        <ChecklistThroughput days={range} />
                    </Section>
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {title}
            </h2>
            {children}
        </div>
    );
}
