import { google } from "googleapis";
import { createServer } from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { getTokens, saveTokens, type OAuthTokens } from "./storage.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

export class GoogleCalendarService {
    private oauth2Client;
    private calendar;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            REDIRECT_URI
        );

        this.oauth2Client.on("tokens", (tokens) => {
            if (tokens.refresh_token) {
                saveTokens(tokens as OAuthTokens).catch((err) =>
                    console.error("Failed to save refreshed tokens:", err)
                );
            }
        });

        this.calendar = google.calendar({
            version: "v3",
            auth: this.oauth2Client,
        });
    }

    async authenticate(): Promise<boolean> {
        const tokens = await getTokens();
        if (tokens) {
            this.oauth2Client.setCredentials(tokens);
            return true;
        }
        return false;
    }

    async runOAuthFlow(): Promise<void> {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: SCOPES,
            prompt: "consent",
        });

        return new Promise((resolve, reject) => {
            const server = createServer(async (req, res) => {
                try {
                    const url = new URL(req.url!, `http://localhost:3000`);
                    if (url.pathname !== "/oauth2callback") return;

                    const code = url.searchParams.get("code");
                    if (!code) {
                        res.writeHead(400);
                        res.end("Missing authorization code");
                        return;
                    }

                    const { tokens } = await this.oauth2Client.getToken(code);
                    this.oauth2Client.setCredentials(tokens);
                    await saveTokens(tokens as OAuthTokens);

                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(
                        "<h1>Authentication successful!</h1><p>You can close this tab.</p>"
                    );

                    server.close();
                    resolve();
                } catch (err) {
                    res.writeHead(500);
                    res.end("Authentication failed");
                    server.close();
                    reject(err);
                }
            });

            server.listen(3000, () => {
                console.error(`Opening browser for Google OAuth...`);
                exec(`open "${authUrl}"`);
            });
        });
    }

    isAuthenticated(): boolean {
        return !!this.oauth2Client.credentials?.access_token;
    }

    async getEvents(
        timeMin: string,
        timeMax: string,
        calendarId = "primary"
    ) {
        const response = await this.calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
        });
        return response.data.items ?? [];
    }

    async createEvent(
        event: {
            summary: string;
            description?: string;
            start: { dateTime: string; timeZone?: string };
            end: { dateTime: string; timeZone?: string };
            colorId?: string;
        },
        calendarId = "primary"
    ) {
        const response = await this.calendar.events.insert({
            calendarId,
            requestBody: event,
        });
        return response.data;
    }

    async updateEvent(
        eventId: string,
        updates: {
            summary?: string;
            description?: string;
            start?: { dateTime: string; timeZone?: string };
            end?: { dateTime: string; timeZone?: string };
            colorId?: string;
        },
        calendarId = "primary"
    ) {
        const response = await this.calendar.events.patch({
            calendarId,
            eventId,
            requestBody: updates,
        });
        return response.data;
    }

    async deleteEvent(eventId: string, calendarId = "primary") {
        await this.calendar.events.delete({
            calendarId,
            eventId,
        });
    }

    async listCalendars(): Promise<{ id: string; summary: string }[]> {
        const response = await this.calendar.calendarList.list();
        return (response.data.items ?? []).map((cal) => ({
            id: cal.id ?? "",
            summary: cal.summary ?? "",
        }));
    }

    async getEventsMultiCalendar(
        timeMin: string,
        timeMax: string,
        calendarIds: string[]
    ) {
        const results = await Promise.all(
            calendarIds
                .filter(Boolean)
                .map((id) => this.getEvents(timeMin, timeMax, id))
        );
        const all = results.flat();
        all.sort((a, b) => {
            const aStart = a.start?.dateTime || a.start?.date || "";
            const bStart = b.start?.dateTime || b.start?.date || "";
            return aStart.localeCompare(bStart);
        });
        return all;
    }

    async getFreeBusy(timeMin: string, timeMax: string, calendarId = "primary") {
        const response = await this.calendar.freebusy.query({
            requestBody: {
                timeMin,
                timeMax,
                items: [{ id: calendarId }],
            },
        });
        return response.data.calendars?.[calendarId]?.busy ?? [];
    }
}

// Standalone auth mode: run with `npm run auth`
const isDirectRun = process.argv[1]?.endsWith("calendar.ts") ||
    process.argv[1]?.endsWith("calendar.js");

if (isDirectRun) {
    const dotenv = await import("dotenv");
    dotenv.config();

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error(
            "Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env"
        );
        console.error("See .env.example for setup instructions.");
        process.exit(1);
    }

    const service = new GoogleCalendarService();
    const hasTokens = await service.authenticate();

    if (hasTokens) {
        console.error("Already authenticated! Tokens found in data/tokens.json");
    } else {
        console.error("Starting OAuth flow...");
        await service.runOAuthFlow();
        console.error("Authentication complete! Tokens saved to data/tokens.json");
    }

    process.exit(0);
}
