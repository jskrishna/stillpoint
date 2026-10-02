/**
 * Dates as the journal and home screens write them: "Today", a weekday within
 * the last week, then a date.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Wednesday", or "2 Oct". */
export function relativeDay(at: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return at.toLocaleDateString('en-IN', { weekday: 'long' });
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "14 min", as the journal shows alongside the day. */
export function duration(minutes: number): string {
  return `${String(Math.max(1, Math.round(minutes)))} min`;
}
