/**
 * UTC calendar helpers. All daily-puzzle logic uses UTC so every player on
 * Earth receives the same puzzle for the same UTC date. No locale APIs are
 * used (YouTube Playables forbids browser localization APIs), so month names
 * are spelled out here in English.
 */
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DAY_MS = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD for the given instant, in UTC. */
export function utcDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateKey(key: string): boolean {
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return utcDateKey(new Date(t)) === key;
}

/** Milliseconds at 00:00 UTC for a YYYY-MM-DD key. */
export function dateKeyToUtcMs(key: string): number {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Whole days from `fromKey` to `toKey` (can be negative). */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcMs(toKey) - dateKeyToUtcMs(fromKey)) / DAY_MS);
}

export function addDays(key: string, days: number): string {
  return utcDateKey(new Date(dateKeyToUtcMs(key) + days * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday for a date key. */
export function weekdayOf(key: string): number {
  return new Date(dateKeyToUtcMs(key)).getUTCDay();
}

/** "October 27, 2026" */
export function formatLongDate(key: string): string {
  const d = new Date(dateKeyToUtcMs(key));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Oct 27" */
export function formatShortDate(key: string): string {
  const d = new Date(dateKeyToUtcMs(key));
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}
