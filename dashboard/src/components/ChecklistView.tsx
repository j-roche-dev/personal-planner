import type { ChecklistItem } from "@planner/types";
import { getAreaColor, SIZE_LABELS, getDeadlineStatus, formatDeadlineLabel } from "../constants";

interface Props {
    items: ChecklistItem[];
}

function groupByArea(items: ChecklistItem[]): [string, ChecklistItem[]][] {
    const groups = new Map<string, ChecklistItem[]>();
    for (const item of items) {
        const group = groups.get(item.area) ?? [];
        group.push(item);
        groups.set(item.area, group);
    }
    // Preserve insertion order — items arrive pre-sorted from server
    return [...groups.entries()];
}

export default function ChecklistView({ items }: Props) {
    if (items.length === 0) {
        return (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                No checklist items for this day.
            </div>
        );
    }

    const groups = groupByArea(items);

    return (
        <div className="space-y-4">
            {groups.map(([area, areaItems]) => {
                const color = getAreaColor(area);
                return (
                    <div
                        key={area}
                        className={`rounded-lg border bg-white dark:bg-gray-900 ${color.border}`}
                    >
                        <div className={`rounded-t-lg px-4 py-2 ${color.bg}`}>
                            <span
                                className={`text-sm font-semibold uppercase tracking-wider ${color.text}`}
                            >
                                {area}
                            </span>
                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                {areaItems.filter((i) => i.completed).length}/
                                {areaItems.length}
                            </span>
                        </div>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {areaItems.map((item) => (
                                <li
                                    key={item.id}
                                    className={`flex items-center gap-3 px-4 py-2.5 ${
                                        item.completed
                                            ? "opacity-50"
                                            : ""
                                    }`}
                                >
                                    <span
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                            item.completed
                                                ? "border-green-400 bg-green-100 text-green-600 dark:border-green-600 dark:bg-green-900/40 dark:text-green-400"
                                                : "border-gray-300 dark:border-gray-600"
                                        }`}
                                    >
                                        {item.completed && (
                                            <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={3}
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        )}
                                    </span>
                                    <span
                                        className={`flex-1 text-sm ${
                                            item.completed
                                                ? "line-through text-gray-400 dark:text-gray-500"
                                                : "text-gray-800 dark:text-gray-200"
                                        }`}
                                    >
                                        {item.text}
                                    </span>
                                    {item.deadline && (() => {
                                        const status = getDeadlineStatus(item.deadline);
                                        const label = formatDeadlineLabel(item.deadline);
                                        const styles = item.completed
                                            ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                                            : status === "overdue"
                                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                            : status === "urgent"
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                            : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
                                        return (
                                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles}`}>
                                                {label}
                                            </span>
                                        );
                                    })()}
                                    {item.size && (
                                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                            {SIZE_LABELS[item.size] ?? item.size}
                                        </span>
                                    )}
                                    {item.carriedFrom && (
                                        <span className="text-xs text-amber-500" title={`Carried from ${item.carriedFrom}`}>
                                            ↩
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
