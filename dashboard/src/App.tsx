import { useState } from "react";
import Today from "./pages/Today";
import LogBrowser from "./pages/LogBrowser";
import Trends from "./pages/Trends";

type View = "today" | "logs" | "trends";

export default function App() {
    const [view, setView] = useState<View>("today");

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
                    <span className="text-lg font-semibold tracking-tight">
                        Planner
                    </span>
                    <div className="flex gap-1">
                        {(
                            [
                                ["today", "Today"],
                                ["logs", "Daily Logs"],
                                ["trends", "Trends"],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setView(key)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    view === key
                                        ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </nav>
            <main className="mx-auto max-w-7xl px-6 py-6">
                {view === "today" && <Today />}
                {view === "logs" && <LogBrowser />}
                {view === "trends" && <Trends />}
            </main>
        </div>
    );
}
