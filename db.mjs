import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const defaultDbPath = fileURLToPath(new URL("./responses.sqlite", import.meta.url));
export const dbPath = process.env.DB_PATH ? resolve(process.env.DB_PATH) : defaultDbPath;

mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY,
    morning_share REAL NOT NULL,
    afternoon_share REAL NOT NULL,
    night_share REAL NOT NULL,
    day_scale REAL NOT NULL,
    morning_color TEXT NOT NULL,
    afternoon_color TEXT NOT NULL,
    night_color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answer_date TEXT NOT NULL DEFAULT '',
    is_test INTEGER NOT NULL DEFAULT 0
  )
`);

const existingColumns = new Set(
  db.prepare("PRAGMA table_info(responses)").all().map((column) => column.name)
);

const requiredColumns = [
  "morning_share",
  "afternoon_share",
  "night_share",
  "day_scale",
  "morning_color",
  "afternoon_color",
  "night_color"
];

const missingColumns = requiredColumns.filter((name) => !existingColumns.has(name));
if (missingColumns.length) {
  throw new Error(
    `既存 DB の列が合いません: ${missingColumns.join(", ")}。` +
    "バックアップを取り、正しい responses.sqlite を選んでください。"
  );
}

if (!existingColumns.has("answer_date")) {
  db.exec("ALTER TABLE responses ADD COLUMN answer_date TEXT NOT NULL DEFAULT ''");
}

if (!existingColumns.has("is_test")) {
  db.exec("ALTER TABLE responses ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0");
}
