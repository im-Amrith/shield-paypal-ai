// Tiny JSON-file store. Good enough for a hackathon demo and keeps judges'
// setup to "npm install && npm run dev". Swap for Postgres later if needed.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";
import { seedDB } from "./seed";

// turbopackIgnore keeps the build from tracing the whole project for this runtime path.
const DB_PATH = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SHIELD_DB_PATH || "data/db.json");

let cache: DB | null = null;
let cacheMtime = 0;

// Pages and API routes are bundled separately in production, so each holds its
// own copy of this module. Re-read whenever the file changed on disk so every
// bundle sees the latest writes.
function load(): DB {
  let mtime = -1;
  try {
    mtime = fs.statSync(DB_PATH).mtimeMs;
  } catch {
    /* no file yet */
  }
  if (cache && mtime === cacheMtime) return cache;
  if (mtime >= 0) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as DB;
      cacheMtime = mtime;
      return cache;
    } catch {
      /* corrupt or mid-write: fall through to reseed only if we have nothing */
      if (cache) return cache;
    }
  }
  cache = seedDB();
  persist();
  return cache;
}

function persist() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
  cacheMtime = fs.statSync(DB_PATH).mtimeMs;
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
