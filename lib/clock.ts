// Demo clock: lets judges fast-forward week-long flows (invoice reminders,
// Vault auto-release, Guardian cooling-off) in seconds.
import { db, mutate } from "./store";

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function now(): Date {
  return new Date(Date.now() + (db().clockOffsetMs || 0));
}

export function nowIso(): string {
  return now().toISOString();
}

export function advanceClock(ms: number): Date {
  mutate((d) => {
    d.clockOffsetMs = (d.clockOffsetMs || 0) + ms;
  });
  return now();
}

export function hoursBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / HOUR;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY;
}
