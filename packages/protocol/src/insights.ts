/**
 * Insights: what the journal adds up to over a window.
 *
 * The insights screen shows three counts, the feelings chosen most, and the
 * belief that keeps coming back. Everything here is derived from journal
 * entries, so insights can never drift from what the user can read.
 *
 * Deliberately plain arithmetic, no inference about the user. Telling someone
 * upset what a model thinks of their pattern is a product decision nobody has
 * taken, so this only counts what they themselves said.
 */

import { FEELINGS, type FeelingId } from './feelings.js';
import type { JournalEntry } from './journal.js';

/** The window the insights screen reports on. */
export const DEFAULT_WINDOW_DAYS = 30;

/** How often one feeling was chosen. */
export interface FeelingCount {
  readonly id: FeelingId;
  readonly label: string;
  readonly count: number;
}

/** A belief that recurred across sessions. */
export interface RecurringBelief {
  /** The wording as the user last put it. */
  readonly belief: string;
  /** How many sessions it appeared in. */
  readonly sessions: number;
}

export interface Insights {
  readonly windowDays: number;
  /** Sessions journalled in the window. */
  readonly sessions: number;
  /** Of those, how many the user said they felt calmer after. */
  readonly feltCalmer: number;
  /** Of those, how many walked all six steps. */
  readonly reachedFinalStep: number;
  /** Feelings chosen most, highest first; only those actually chosen. */
  readonly feelings: readonly FeelingCount[];
  /** The belief appearing in the most sessions, when one repeats at all. */
  readonly recurringBelief?: RecurringBelief;
}

const LABEL: ReadonlyMap<FeelingId, string> = new Map(FEELINGS.map((f) => [f.id, f.label]));

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compares beliefs ignoring case, surrounding quotes, punctuation and spacing,
 * so "I'm not good enough." and "I'm not good enough" count as one.
 */
function normalizeBelief(belief: string): string {
  return belief
    .toLowerCase()
    .replace(/[“”"'’‘.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Entries that fall inside the window ending at `now`. */
export function withinWindow(
  entries: readonly JournalEntry[],
  now: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): readonly JournalEntry[] {
  const from = now.getTime() - windowDays * DAY_MS;
  const to = now.getTime();
  return entries.filter((e) => {
    const t = e.occurredAt.getTime();
    return t >= from && t <= to;
  });
}

/**
 * Summarises the journal over a window.
 *
 * "Felt calmer" counts an explicit `yes` only. "A little" is left out on
 * purpose: the number is shown back to the user as something they said, so it
 * should not round their hedge up into agreement.
 */
export function insights(
  entries: readonly JournalEntry[],
  now: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Insights {
  const scoped = withinWindow(entries, now, windowDays);

  const counts = new Map<FeelingId, number>();
  for (const entry of scoped) {
    // One session counts once per feeling, however often it was named.
    for (const id of new Set(entry.feelings)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const feelings: FeelingCount[] = [...counts.entries()]
    .map(([id, count]) => ({ id, label: LABEL.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const base: Insights = {
    windowDays,
    sessions: scoped.length,
    feltCalmer: scoped.filter((e) => e.calmerRating === 'yes').length,
    reachedFinalStep: scoped.filter((e) => e.reachedFinalStep).length,
    feelings,
  };

  const recurring = recurringBelief(scoped);
  return recurring === undefined ? base : { ...base, recurringBelief: recurring };
}

/**
 * The belief appearing in the most sessions, or `undefined` when none repeats.
 *
 * A belief named once is not a pattern, so the threshold is two. Ties are
 * broken by whichever was said most recently.
 */
export function recurringBelief(entries: readonly JournalEntry[]): RecurringBelief | undefined {
  const groups = new Map<string, { belief: string; at: number; count: number }>();

  for (const entry of entries) {
    const belief = entry.belief;
    if (belief === undefined) continue;

    const key = normalizeBelief(belief);
    if (key === '') continue;

    const at = entry.occurredAt.getTime();
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { belief, at, count: 1 });
    } else {
      groups.set(key, {
        // Keep the most recent wording, which is how the user puts it now.
        belief: at >= existing.at ? belief : existing.belief,
        at: Math.max(at, existing.at),
        count: existing.count + 1,
      });
    }
  }

  let best: { belief: string; at: number; count: number } | undefined;
  for (const group of groups.values()) {
    if (
      best === undefined ||
      group.count > best.count ||
      (group.count === best.count && group.at > best.at)
    ) {
      best = group;
    }
  }

  if (best === undefined || best.count < 2) return undefined;
  return { belief: best.belief, sessions: best.count };
}
