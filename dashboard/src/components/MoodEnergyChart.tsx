import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyLog } from "@planner/types";

interface Props {
    logs: DailyLog[];
}

const MOOD_VALUES: Record<string, number> = {
    great: 5,
    good: 4,
    okay: 3,
    rough: 2,
    bad: 1,
};

export default function MoodEnergyChart({ logs }: Props) {
    if (logs.length < 2) {
        return (
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Mood and energy trends will appear after a few days of daily
                check-ins.
            </p>
        );
    }

    const data = [...logs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((log) => ({
            date: log.date,
            label: format(parseISO(log.date), "MMM d"),
            mood: log.reflection.mood
                ? MOOD_VALUES[log.reflection.mood]
                : undefined,
            energy: log.reflection.energyRating ?? undefined,
        }));

    return (
        <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                />
                <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    width={30}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#f3f4f6",
                        fontSize: "0.875rem",
                    }}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="mood"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    name="Mood"
                />
                <Line
                    type="monotone"
                    dataKey="energy"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    name="Energy"
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
