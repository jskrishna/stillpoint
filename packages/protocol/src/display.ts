/**
 * Client-side display state: the small pure functions every surface needs to
 * put the domain on a screen.
 *
 * This is not presentation in the sense the package forbids — there are no
 * colours here, no copy of the guide's and no framework. It is the formatting
 * that would otherwise be written once in the web app and again on the phone,
 * and then disagree about what "Yesterday" means.
 *
 * Dates read as the journal and home screens write them: "Today", a weekday
 * within the last week, then a date. The locale is `en-IN` throughout, because
 * the product is India-first and a weekday rendered in the device's locale
 * would be the one thing on the screen in another language.
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

/* ------------------------------------------------------------- greeting */

/**
 * The home screen's greeting, e.g. "Good evening, Aarav".
 *
 * Local to the viewer's clock, which is the only sense in which a greeting is
 * ever correct.
 */

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

/** Which part of the day an hour falls in. */
export function partOfDay(hour: number): PartOfDay {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** The greeting line, with a name when one is known. */
export function greeting(at: Date, name?: string): string {
  const part = partOfDay(at.getHours());
  const base = `Good ${part}`;
  return name === undefined || name.trim() === '' ? base : `${base}, ${name.trim()}`;
}
