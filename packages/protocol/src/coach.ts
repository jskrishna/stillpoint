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

/** Where a client is in their relationship with the coach. */
export type ClientStatus = 'active' | 'invited';

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
