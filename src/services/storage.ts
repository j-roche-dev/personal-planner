import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserPreferences } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
}

export async function readJSON<T>(filename: string): Promise<T> {
    const filepath = join(DATA_DIR, filename);
    const content = await readFile(filepath, "utf-8");
    return JSON.parse(content) as T;
}

export async function writeJSON<T>(filename: string, data: T): Promise<void> {
    await ensureDir(DATA_DIR);
    const filepath = join(DATA_DIR, filename);
    await writeFile(filepath, JSON.stringify(data, null, 4) + "\n", "utf-8");
}

export async function getPreferences(): Promise<UserPreferences> {
    return readJSON<UserPreferences>("preferences.json");
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
    await writeJSON("preferences.json", prefs);
}

export interface OAuthTokens {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
}

export async function getTokens(): Promise<OAuthTokens | null> {
    try {
        return await readJSON<OAuthTokens>("tokens.json");
    } catch {
        return null;
    }
}

export async function saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJSON("tokens.json", tokens);
}
