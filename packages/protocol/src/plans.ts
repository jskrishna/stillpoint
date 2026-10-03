/**
 * What a plan allows.
 *
 * The pricing page states it: Free gets "3 full sessions a week" and
 * "Unlimited quick sessions". That is a rule about whether a session may
 * start, so it is domain and lives here — the *prices* are presentation and
 * live in the surface, where `[PRICE]/mo` stays a placeholder until the PRD
 * supplies the figures.
 *
 * Ported in `App\Domain\Plan`; the parity fixture covers it.
 *
 * ## What is deliberately not here
 *
 * The Coach plan says "Up to 25 clients". What a coach on some *other* plan is
 * allowed is not stated anywhere, so nothing enforces a client cap: a limit
 * applied to people the designs never mentioned would be a product decision
 * made by a guess. See `CLAUDE.md`.
 *
 * And a quick session runs the same six steps as a full one, because nothing
 * says otherwise. The designs show quick sessions as shorter in practice and
 * label them in the journal, but they do not say which steps are skipped. That
 * is the PRD's to say, like the step copy.
 */

import type { SessionKind } from './session.js';

export type PlanId = 'free' | 'plus' | 'coach';

/** Every plan, in the order the pricing page lists them. */
export const PLAN_IDS = ['free', 'plus', 'coach'] as const satisfies readonly PlanId[];

/** The window the allowance is counted over. */
export const ALLOWANCE_WINDOW_DAYS = 7;

/**
 * Full sessions a plan allows per week. `null` is unlimited.
 *
 * Quick sessions are not here because no plan limits them — that is what
 * "Unlimited quick sessions" means, and a limit of `null` for every plan would
 * be the same statement written three times.
 */
export const FULL_SESSIONS_PER_WEEK: Readonly<Record<PlanId, number | null>> = {
  free: 3,
  plus: null,
  coach: null,
};

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** Whether a session of this kind may start. */
export type StartDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /** Shown to the user, so it says what they can do instead. */
      readonly reason: string;
      /** How many full sessions the plan allows in the window. */
      readonly limit: number;
      /** Whether a quick session is still available, which it always is. */
      readonly quickStillAllowed: true;
    };

/**
 * Whether a session may start, given the plan and how many full sessions have
 * been started in the window.
 *
 * A quick session is **always** allowed. That is the point of the rule rather
 * than an exception to it: the limit exists to price the long session, and
 * someone who is upset should never be told to come back next week.
 */
export function mayStartSession(
  kind: SessionKind,
  plan: PlanId,
  fullSessionsInWindow: number,
): StartDecision {
  if (kind === 'quick') return { allowed: true };

  const limit = FULL_SESSIONS_PER_WEEK[plan];
  if (limit === null || fullSessionsInWindow < limit) return { allowed: true };

  return {
    allowed: false,
    reason: `Your plan includes ${String(limit)} full sessions a week, and you have used ${String(
      fullSessionsInWindow,
    )}. A quick session is always available, or upgrade for unlimited full ones.`,
    limit,
    quickStillAllowed: true,
  };
}

/** How many full sessions are left, or `null` when the plan does not limit them. */
export function fullSessionsLeft(plan: PlanId, fullSessionsInWindow: number): number | null {
  const limit = FULL_SESSIONS_PER_WEEK[plan];
  return limit === null ? null : Math.max(0, limit - fullSessionsInWindow);
}
