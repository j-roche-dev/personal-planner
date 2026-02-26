import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import type { DailyChecklist } from "@planner/types";
import { useChecklistDates } from "../hooks/useChecklist";
import { useEffect, useState } from "react";

interface Props {
    days: number;
}

interface DayData {
    label: string;
    completed: number;
    remaining: number;
}

export default function ChecklistThroughput({ days }: Props) {
    const checklistDates = useChecklistDates();
    const [data, setData] = useState<DayData[]>([]);

    const today = new Date();
    const dateRange: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        dateRange.push(format(subDays(today, i), "yyyy-MM-dd"));
    }

    const availableDates = new Set(checklistDates.data ?? []);

    useEffect(() => {
        const datesWithData = dateRange.filter((d) => availableDates.has(d));
        if (datesWithData.length === 0) {
            setData([]);
            return;
        }

        Promise.all(
            datesWithData.map((d) =>
                fetch(`/api/checklist/${d}`)
                    .then((r) => (r.ok ? r.json() : null))
                    .catch(() => null)
            )
        ).then((results) => {
            const chartData: DayData[] = [];
            for (let i = 0; i < datesWithData.length; i++) {
                const checklist = results[i] as DailyChecklist | null;
                if (checklist) {
                    const completed = checklist.items.filter(
                        (item) => item.completed
                    ).length;
                    chartData.push({
                        label: format(parseISO(datesWithData[i]), "MMM d"),
                        completed,
                        remaining: checklist.items.length - completed,
                    });
                }
            }
            setData(chartData);
        });
    }, [checklistDates.data, days]);

    if (data.length === 0) {
        return (
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Checklist throughput will appear once you have checklist data.
            </p>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                />
                <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    width={30}
                    allowDecimals={false}
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
                <Bar
                    dataKey="completed"
                    stackId="a"
                    fill="#22c55e"
                    radius={[0, 0, 0, 0]}
                    name="Completed"
                />
                <Bar
                    dataKey="remaining"
                    stackId="a"
                    fill="#e5e7eb"
                    radius={[4, 4, 0, 0]}
                    name="Remaining"
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
