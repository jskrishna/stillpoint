/**
 * How long ago something happened, in as few characters as a table column can
 * spare.
 *
 * It exists for the safety queue, where the age of a flag is the second thing
 * a reviewer needs after its severity — a `high` raised four days ago is a
 * different situation from the same flag raised twenty minutes ago, and the
 * queue used to show neither.
 *
 * Deliberately coarse, and rounded **down**. "3d" for something 3 days and 20
 * hours old understates it, which is the wrong direction for a queue, so the
 * exact timestamp goes in the cell's `title` and `describe()` spells it out
 * for anything that has been waiting long enough to matter.
 *
 * `en-IN`, like every other date in this app.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A short age for a table cell: `now`, `12m`, `5h`, `3d`. */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  const at = parse(iso);
  if (at === null) return '—';

  const elapsed = now - at;
  // A clock that is behind the server's would otherwise read as a negative
  // age, which looks like a bug in the queue rather than in the clock.
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))}m`;
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))}h`;

  return `${String(Math.floor(elapsed / DAY))}d`;
}

/** The same age in words, for a sentence rather than a cell. */
export function describeAge(iso: string | null | undefined, now: number = Date.now()): string {
  const at = parse(iso);
  if (at === null) return 'unknown';

  const elapsed = Math.max(0, now - at);
  if (elapsed < HOUR) return 'less than an hour';

  const hours = Math.floor(elapsed / HOUR);
  if (hours < 24) return hours === 1 ? '1 hour' : `${String(hours)} hours`;

  const days = Math.floor(elapsed / DAY);

  return days === 1 ? '1 day' : `${String(days)} days`;
}

/** The exact moment, for a tooltip beside the rounded one. */
export function exact(iso: string | null | undefined): string | undefined {
  const at = parse(iso);

  return at === null ? undefined : new Date(at).toLocaleString('en-IN');
}

function parse(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined) return null;
  const at = new Date(iso).getTime();

  return Number.isNaN(at) ? null : at;
}
