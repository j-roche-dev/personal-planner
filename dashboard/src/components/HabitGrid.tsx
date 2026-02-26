import { format, parseISO, subDays } from "date-fns";
import type { Habit, DailyLog } from "@planner/types";

interface Props {
    habits: Habit[];
    logs: DailyLog[];
    days: number;
}

export default function HabitGrid({ habits, logs, days }: Props) {
    if (habits.length === 0) {
        return (
            <p className="text-sm text-gray-500 dark:text-gray-400">
                No habits defined yet.
            </p>
        );
    }

    const today = new Date();
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        dates.push(format(subDays(today, i), "yyyy-MM-dd"));
    }

    const logMap = new Map(logs.map((l) => [l.date, l]));

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr>
                        <th className="sticky left-0 bg-white pr-3 text-left font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                            Habit
                        </th>
                        {dates.map((d) => (
                            <th
                                key={d}
                                className="px-0.5 pb-1 text-center text-xs font-normal text-gray-400 dark:text-gray-500"
                            >
                                {format(parseISO(d), "EEE").charAt(0)}
                            </th>
                        ))}
                        <th className="pl-3 text-right font-medium text-gray-500 dark:text-gray-400">
                            Rate
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {habits.map((habit) => {
                        let completed = 0;
                        let tracked = 0;

                        const cells = dates.map((d) => {
                            const log = logMap.get(d);
                            const entry = log?.habits.find(
                                (h) => h.habitId === habit.id
                            );
                            if (entry) {
                                tracked++;
                                if (entry.completed) completed++;
                            }
                            return { date: d, entry };
                        });

                        const rate =
                            tracked > 0
                                ? Math.round((completed / tracked) * 100)
                                : null;

                        return (
                            <tr key={habit.id}>
                                <td className="sticky left-0 bg-white py-1 pr-3 font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                    {habit.name}
                                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                                        {completed}/{habit.weeklyTarget}w
                                    </span>
                                </td>
                                {cells.map(({ date, entry }) => (
                                    <td key={date} className="px-0.5 py-1">
                                        <div
                                            className={`mx-auto h-4 w-4 rounded-sm ${
                                                entry == null
                                                    ? "bg-gray-100 dark:bg-gray-800"
                                                    : entry.completed
                                                      ? "bg-green-400 dark:bg-green-500"
                                                      : "bg-red-300 dark:bg-red-500/60"
                                            }`}
                                            title={`${date}: ${
                                                entry == null
                                                    ? "no data"
                                                    : entry.completed
                                                      ? "done"
                                                      : "missed"
                                            }`}
                                        />
                                    </td>
                                ))}
                                <td className="py-1 pl-3 text-right text-sm">
                                    {rate != null ? (
                                        <span
                                            className={
                                                rate >= 70
                                                    ? "text-green-600 dark:text-green-400"
                                                    : rate >= 40
                                                      ? "text-amber-600 dark:text-amber-400"
                                                      : "text-red-600 dark:text-red-400"
                                            }
                                        >
                                            {rate}%
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-500">
                                            —
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
