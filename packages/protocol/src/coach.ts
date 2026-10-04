/**
 * What a coach can see of a client.
 *
 * The coach portal states the rule plainly: "You only see sessions your clients
 * choose to share." So sharing is enforced here, once, rather than trusted to
 * every query and screen that touches a client's journal. A coach's view is
 * always derived through {@link sharedWith}.
 */

import { recurringBelief, type RecurringBelief } from './insights.js';
import type { JournalEntry } from './journal.js';
import type { CoachSharing } from './onboarding.js';

/**
 * Where a client is in their relationship with the coach.
 *
 * One value, and that is the point: **a pairing means an accepted pairing.**
 * There used to be an `'invited'` state here and in `App\Domain\ClientStatus`,
 * from before invitations had a table of their own. Nothing wrote it, and what
 * it described is a pairing the client never agreed to — which a coach could
 * read shared journal entries through, because sharing is a property of the
 * entry rather than of the pairing.
 *
 * An invitation that has not been accepted is a `coach_invites` row, and the
 * coach's screen already lists those separately.
 */
export type ClientStatus = 'active';

export interface Client {
  readonly id: string;
  /** As the coach lists them, e.g. "Priya S.". */
  readonly name: string;
  readonly status: ClientStatus;
  /** When they joined, for "Client since June". */
  readonly since?: Date;
  readonly nextCallAt?: Date;
}

/**
 * Whether a session written now is shared with the coach straight away.
 *
 * The settings screen offers three choices and they were decoration: the
 * column was stored, validated and printed back, and nothing in either
 * language read it. "Share every session" shared nothing. So these two
 * functions are what the labels already promise, and they live here beside
 * {@link sharedWith} because sharing is one rule or it is none.
 *
 * `hasCoach` is why this takes two arguments. "Share every session" is sharing
 * it *with somebody*, and marking entries shared while nobody is paired would
 * mean that accepting a coach later hands them a backlog the user chose the
 * setting before ever seeing. Nothing to share with, nothing shared.
 */
export function sharesNewEntry(setting: CoachSharing, hasCoach: boolean): boolean {
  return setting === 'always' && hasCoach;
}

/**
 * Whether the owner may turn sharing **on** for one entry.
 *
 * False only for `never`, which is what makes that choice mean something: with
 * it off, `never` and `ask_each_time` would be the same behaviour under two
 * labels. It is a lock the person it protects can unlock, by changing the
 * setting — which is the only kind of sharing rule worth having, since a rule
 * the sharer cannot inspect or reverse is a promise about somebody else.
 *
 * Turning sharing **off** is always allowed, whatever the setting. Somebody
 * who has just chosen "Never share" is the last person to be told they cannot
 * unshare something.
 *
 * What this deliberately does **not** do is rewrite entries already shared.
 * Ending a pairing does not unshare them either — `shared_with_coach` is a
 * decision the user made about one session and it stays where they put it —
 * and a setting that silently rewrote the past would be the same surprise in
 * the other direction. Whether choosing "Never share" should offer to unshare
 * what is already out there is a product question; `DECISIONS.md` has it.
 */
export function mayShareEntry(setting: CoachSharing): boolean {
  return setting !== 'never';
}

/**
 * Narrows a client's journal to what they have shared.
 *
 * This is the only way a coach's view should ever be built. Everything else in
 * this module takes the result of this function, so an unshared entry cannot
 * reach a coach by being passed to the wrong helper.
 */
export function sharedWith(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return entries.filter((e) => e.sharedWithCoach);
}

/** What the coach's client list shows per row. */
export interface ClientSummary {
  /** How many sessions the client has shared. */
  readonly sharedCount: number;
  /** The most recent shared session, if any. */
  readonly lastSharedAt?: Date;
  /** The belief recurring across shared sessions. */
  readonly recurringBelief?: RecurringBelief;
}

/**
 * Summarises what a coach can see of one client.
 *
 * Takes the client's whole journal and shares it down itself, so a caller
 * cannot accidentally summarise private entries.
 */
export function summarise(entries: readonly JournalEntry[]): ClientSummary {
  const shared = sharedWith(entries);

  const lastSharedAt = shared.reduce<Date | undefined>(
    (latest, e) => (latest === undefined || e.occurredAt > latest ? e.occurredAt : latest),
    undefined,
  );
  const belief = recurringBelief(shared);

  return {
    sharedCount: shared.length,
    ...(lastSharedAt === undefined ? {} : { lastSharedAt }),
    ...(belief === undefined ? {} : { recurringBelief: belief }),
  };
}

/**
 * Whether a client needs the coach's attention.
 *
 * A session that ended for safety is never journalled, so it can never be
 * shared — a coach learns of one through the product telling them, not by
 * reading it. This flag is that telling, and it is deliberately separate from
 * the journal.
 */
export interface Attention {
  readonly clientId: string;
  readonly reason: string;
  readonly at: Date;
}
