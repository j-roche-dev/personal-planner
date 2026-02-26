import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

const DATA_DIR = resolve(__dirname, "../data");

async function readJsonFile(path: string): Promise<unknown> {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
}

async function listJsonDates(dir: string): Promise<string[]> {
    let files: string[];
    try {
        files = await readdir(dir);
    } catch {
        return [];
    }
    return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .sort()
        .reverse();
}

export function dataApiPlugin(): Plugin {
    return {
        name: "planner-data-api",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url ?? "";

                if (!url.startsWith("/api/")) {
                    return next();
                }

                const sendJson = (data: unknown) => {
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(data));
                };

                const send404 = (msg: string) => {
                    res.statusCode = 404;
                    sendJson({ error: msg });
                };

                const handleAsync = async () => {
                    try {
                        // GET /api/checklist/dates
                        if (url === "/api/checklist/dates") {
                            const dates = await listJsonDates(
                                join(DATA_DIR, "checklists")
                            );
                            return sendJson(dates);
                        }

                        // GET /api/checklist/:date
                        const checklistMatch = url.match(
                            /^\/api\/checklist\/(\d{4}-\d{2}-\d{2})$/
                        );
                        if (checklistMatch) {
                            const filePath = join(
                                DATA_DIR,
                                "checklists",
                                `${checklistMatch[1]}.json`
                            );
                            try {
                                const data = await readJsonFile(filePath);
                                return sendJson(data);
                            } catch {
                                return send404("Checklist not found");
                            }
                        }

                        // GET /api/daily-log/dates
                        if (url === "/api/daily-log/dates") {
                            const dates = await listJsonDates(
                                join(DATA_DIR, "daily-logs")
                            );
                            return sendJson(dates);
                        }

                        // GET /api/daily-log/recent/:days
                        const recentMatch = url.match(
                            /^\/api\/daily-log\/recent\/(\d+)$/
                        );
                        if (recentMatch) {
                            const days = parseInt(recentMatch[1], 10);
                            const dates = await listJsonDates(
                                join(DATA_DIR, "daily-logs")
                            );
                            const recentDates = dates.slice(0, days);
                            const logs = [];
                            for (const date of recentDates) {
                                try {
                                    const log = await readJsonFile(
                                        join(
                                            DATA_DIR,
                                            "daily-logs",
                                            `${date}.json`
                                        )
                                    );
                                    logs.push(log);
                                } catch {
                                    // skip missing files
                                }
                            }
                            return sendJson(logs);
                        }

                        // GET /api/daily-log/:date
                        const logMatch = url.match(
                            /^\/api\/daily-log\/(\d{4}-\d{2}-\d{2})$/
                        );
                        if (logMatch) {
                            const filePath = join(
                                DATA_DIR,
                                "daily-logs",
                                `${logMatch[1]}.json`
                            );
                            try {
                                const data = await readJsonFile(filePath);
                                return sendJson(data);
                            } catch {
                                return send404("Daily log not found");
                            }
                        }

                        // GET /api/habits
                        if (url === "/api/habits") {
                            try {
                                const data = await readJsonFile(
                                    join(DATA_DIR, "habits.json")
                                );
                                return sendJson(data);
                            } catch {
                                return sendJson([]);
                            }
                        }

                        // GET /api/profile
                        if (url === "/api/profile") {
                            try {
                                const data = await readJsonFile(
                                    join(DATA_DIR, "profile.json")
                                );
                                return sendJson(data);
                            } catch {
                                return send404("Profile not found");
                            }
                        }

                        // GET /api/preferences
                        if (url === "/api/preferences") {
                            try {
                                const data = await readJsonFile(
                                    join(DATA_DIR, "preferences.json")
                                );
                                return sendJson(data);
                            } catch {
                                return send404("Preferences not found");
                            }
                        }

                        send404("Unknown API endpoint");
                    } catch (err) {
                        res.statusCode = 500;
                        sendJson({
                            error:
                                err instanceof Error
                                    ? err.message
                                    : "Internal error",
                        });
                    }
                };

                handleAsync();
            });
        },
    };
}
