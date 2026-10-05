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
  /**
   * What the person said at step 1, in full.
   *
   * **It was not on this interface at all**, and `entryFrom` dropped it —
   * where `App\Models\JournalEntry` stores `what_happened` and both entry
   * screens render it as the first row under "What happened". So this type
   * carried `title`, which is the first 60 characters of this field, and not
   * the field.
   *
   * Optional because a session can end before step 1 is answered, which is
   * also why the PHP column is nullable.
   */
  readonly whatHappened?: string;
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
  /**
   * Whether this entry is shared with the owner's coach from the start.
   *
   * **It was hardcoded `false` here**, as `JournalEntry::fromSession()` once
   * hardcoded it — which is how "Share every session" came to share nothing.
   * That was fixed in the PHP, which takes the decision as an argument, and
   * the docblock recording the bug lives there; this half kept the hardcode
   * and had no slot to pass anything in.
   *
   * The decision is `sharesNewEntry()` in `./coach.js`, exported from this
   * package and parity-compared over all three settings against both pairing
   * states — one module away from the function that ignored it.
   *
   * Defaulted `false` rather than required, matching the PHP signature, and
   * because `false` is the fail-closed answer: an entry nobody decided about
   * is not shared.
   */
  readonly sharedWithCoach?: boolean;
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
    sharedWithCoach: ctx.sharedWithCoach ?? false,
  };

  // exactOptionalPropertyTypes: an absent field is omitted, never set to
  // undefined, so "no belief" and "belief: undefined" cannot diverge.
  const whatHappened = data.whatHappened;
  const memory = data.memory;
  const belief = data.belief;
  const forgiveness = data.forgiveness ?? forgivenessFor(belief);
  const calmerRating = data.calmerRating;

  return {
    ...base,
    ...(whatHappened === undefined ? {} : { whatHappened }),
    ...(memory === undefined ? {} : { memory }),
    ...(belief === undefined ? {} : { belief }),
    ...(forgiveness === undefined ? {} : { forgiveness }),
    ...(calmerRating === undefined ? {} : { calmerRating }),
  };
}

/**
 * The summary line the journal list shows under the title and date.
 *
 * **An empty belief is no belief**, which this did not say and its PHP twin
 * did. `JournalEntry::listSummary()` guards on `null` *and* `''`; this guarded
 * only on `undefined`, so measured: an empty belief gave `“”` here — a pair of
 * quotation marks with nothing between them — and "Session" there.
 *
 * It is not reachable through a turn: the route validates `utterance` as
 * `required`, which Laravel trims, so a whitespace-only answer is refused 422
 * before anything is recorded (measured against the running API). It is fixed
 * anyway for the reason `'ca'` is in `parity/cases.json`: the two languages
 * disagreeing is the thing that is wrong, and whether today's clients can
 * produce the input is a separate and more fragile question.
 *
 * **And note where the PHP half lives**, because it is why the parity fixture
 * never caught this: `listSummary()` is a method on `App\Models\JournalEntry`,
 * an Eloquent model, rather than on anything in `app/Domain`. The fixture
 * compares the Domain, and `tests/Unit/ParityTest.php` is a plain
 * `PHPUnit\Framework\TestCase` with no application booted — so the journal's
 * display rules are the one part of the protocol the comparison structurally
 * cannot reach. Moving them into the Domain is a change to where a rule lives
 * rather than to what it says, and nobody is waiting on it; what is fixed here
 * is the disagreement.
 */
export function listSummary(entry: JournalEntry): string {
  if (entry.belief !== undefined && entry.belief !== '') return `“${entry.belief}”`;
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

/**
 * Entries newest first, then by id — as the journal lists them.
 *
 * The second key was missing here, exactly as it was in `byUrgency`, and those
 * two are this package's only exported orderings — the third `sort` in it, over
 * feelings in `insights()`, has its tiebreaker and is parity-compared.
 * `scopeNewestFirst()` orders
 * `occurred_at DESC, id DESC`, and `occurred_at` is not unique: the journal is
 * cursor-paged, a cursor is built from the ordering columns, and a tie with no
 * tiebreaker makes a page repeat a row or skip one.
 * `JournalApiTest::test_paging_is_stable_when_entries_share_a_timestamp` is
 * the PHP half, and there was no TypeScript half.
 *
 * Nothing calls this — the journal is paged by the server and both surfaces
 * render the order they are given — so it was never a live defect, and that is
 * the point rather than the excuse. Two of two orderings in the unconsumed
 * half of this package had drifted the same way, which is a class and not two
 * slips: a rule written down here is read as the rule, and these two were
 * written down wrong.
 *
 * Ids are ULIDs, which sort lexicographically in creation order, so comparing
 * them as strings descending is the database's `id DESC`.
 */
export function byNewest(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return [...entries].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id),
  );
}

/** Total steps in the protocol, for surfaces reporting "reached step 6". */
export const FINAL_STEP_ORDINAL = STEP_ORDER.length;
