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
