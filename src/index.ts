#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleCalendarService } from "./services/calendar.js";

const server = new McpServer({
    name: "personal-planner",
    version: "0.1.0",
});

const calendarService = new GoogleCalendarService();

server.tool("ping", "Check server status and Google Calendar auth status", {}, async () => {
    let calendarStatus = "not configured";

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const authenticated = await calendarService.authenticate();
        calendarStatus = authenticated ? "authenticated" : "credentials configured, not authenticated (run `npm run auth`)";
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(
                    {
                        status: "ok",
                        server: "personal-planner",
                        version: "0.1.0",
                        googleCalendar: calendarStatus,
                    },
                    null,
                    2
                ),
            },
        ],
    };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Personal Planner MCP server running on stdio");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
