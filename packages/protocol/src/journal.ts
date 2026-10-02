/**
 * The journal: what a finished session leaves behind.
 *
 * "Only you can see these." A journal entry is private to its user until they
 * choose to share it with a coach, and they can delete it. The entry is derived
 * from the session rather than stored twice, so a session and its entry cannot
 * disagree.
 */

import {
  forgivenessFor,
  type CalmerRating,
  type Memory,
  type Session,
  type SessionKind,
} from './session.js';
import type { FeelingId } from './feelings.js';
import { STEP_ORDER } from './steps.js';

/** One finished session, as the journal lists and the detail screen shows. */
export interface JournalEntry {
  readonly id: string;
  /** Short title, e.g. "Called out at work". */
  readonly title: string;
  readonly occurredAt: Date;
  readonly durationMinutes: number;
  readonly kind: SessionKind;
  readonly feelings: readonly FeelingId[];
  readonly memory?: Memory;
  /** The old belief, in the user's own words. */
  readonly belief?: string;
  /** The forgiveness spoken at step 6. */
  readonly forgiveness?: string;
  /** The user's own note, which they write and edit afterwards. */
  readonly note?: string;
  readonly calmerRating?: CalmerRating;
  /** Whether the session walked all six steps. */
  readonly reachedFinalStep: boolean;
  /** Entries are private until the user shares one. */
  readonly sharedWithCoach: boolean;
}

/** What the caller must supply that the session itself does not carry. */
export interface EntryContext {
  readonly id: string;
  readonly occurredAt: Date;
  readonly durationMinutes: number;
  /** Falls back to the session's own title, then to "Session". */
  readonly title?: string;
}

/**
 * Builds a journal entry from a finished session.
 *
 * A session that ended for safety is not journalled: the user was handed to a
 * helpline, and turning that into a diary entry would be the wrong thing to put
 * in front of them later. Returns `undefined` in that case, and while a session
 * is still running.
 */
export function entryFrom(session: Session, ctx: EntryContext): JournalEntry | undefined {
  if (session.phase !== 'ended') return undefined;
  if (session.endReason === 'safety_stop') return undefined;

  const { data } = session;
  const base: JournalEntry = {
    id: ctx.id,
    title: ctx.title ?? data.title ?? 'Session',
    occurredAt: ctx.occurredAt,
    durationMinutes: ctx.durationMinutes,
    kind: session.kind,
    feelings: data.feelings,
    reachedFinalStep: session.endReason === 'completed',
    sharedWithCoach: false,
  };

  // exactOptionalPropertyTypes: an absent field is omitted, never set to
  // undefined, so "no belief" and "belief: undefined" cannot diverge.
  const memory = data.memory;
  const belief = data.belief;
  const forgiveness = data.forgiveness ?? forgivenessFor(belief);
  const calmerRating = data.calmerRating;

  return {
    ...base,
    ...(memory === undefined ? {} : { memory }),
    ...(belief === undefined ? {} : { belief }),
    ...(forgiveness === undefined ? {} : { forgiveness }),
    ...(calmerRating === undefined ? {} : { calmerRating }),
  };
}

/** The summary line the journal list shows under the title and date. */
export function listSummary(entry: JournalEntry): string {
  if (entry.belief !== undefined) return `“${entry.belief}”`;
  return entry.kind === 'quick' ? 'Quick session' : 'Session';
}

/** Attaches or replaces the user's note. */
export function withNote(entry: JournalEntry, note: string): JournalEntry {
  const trimmed = note.trim();
  const { note: _dropped, ...rest } = entry;
  return trimmed === '' ? rest : { ...rest, note: trimmed };
}

/** Shares an entry with the user's coach, or withdraws it again. */
export function withSharing(entry: JournalEntry, shared: boolean): JournalEntry {
  return { ...entry, sharedWithCoach: shared };
}

/** Entries newest first, as the journal lists them. */
export function byNewest(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return [...entries].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

/** Total steps in the protocol, for surfaces reporting "reached step 6". */
export const FINAL_STEP_ORDINAL = STEP_ORDER.length;
