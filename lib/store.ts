// Tiny JSON-file store. Good enough for a hackathon demo and keeps judges'
// setup to "npm install && npm run dev". Swap for Postgres later if needed.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";
import { seedDB } from "./seed";

const DB_PATH = path.resolve(process.cwd(), process.env.SHIELD_DB_PATH || "data/db.json");

let cache: DB | null = null;

function load(): DB {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    cache = JSON.parse(raw) as DB;
  } catch {
    cache = seedDB();
    persist();
  }
  return cache!;
}

function persist() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

/** Read-only snapshot of the database. */
export function db(): DB {
  return load();
}

/** Mutate the database and persist it. */
export function mutate<T>(fn: (d: DB) => T): T {
  const d = load();
  const out = fn(d);
  persist();
  return out;
}

/** Reset to seed data (used by the demo "reset" button and tests). */
export function resetDB(): DB {
  cache = seedDB();
  persist();
  return cache;
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
