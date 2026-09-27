import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "homebase.db");
export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('app', 'bookmark')),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const defaultSettings: Record<string, string> = {
  theme: "dark",
  accent_color: "#7c5cff",
  background_image_url: "",
  greeting_name: "",
  search_engine: "https://www.google.com/search?q=%s",
  password_hash: "",
  sabnzbd_url: "",
  sabnzbd_api_key: "",
  sonarr_url: "",
  sonarr_api_key: "",
  radarr_url: "",
  radarr_api_key: "",
  tmdb_api_key: "",
  teslamate_url: "",
  teslamate_api_token: "",
  teslamate_car_id: "1",
  tautulli_url: "",
  tautulli_api_key: "",
  weather_latitude: "",
  weather_longitude: "",
  weather_label: "",
  weather_units: "metric",
  prowlarr_url: "",
  prowlarr_api_key: "",
  portainer_url: "",
  portainer_api_key: "",
  portainer_endpoint_id: "1",
  assistant_provider: "",
  assistant_ollama_url: "",
  assistant_ollama_model: "",
  assistant_anthropic_api_key: "",
  assistant_anthropic_model: "claude-sonnet-4-5",
  assistant_openai_api_key: "",
  assistant_openai_model: "gpt-4o-mini",
  nas_snmp_host: "",
  nas_snmp_port: "161",
  nas_snmp_version: "3",
  nas_snmp_community: "",
  nas_snmp_username: "",
  nas_snmp_auth_protocol: "sha",
  nas_snmp_auth_key: "",
  nas_snmp_priv_protocol: "aes",
  nas_snmp_priv_key: "",
};

const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);
const seedSettings = db.transaction(() => {
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
});
seedSettings();

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}
