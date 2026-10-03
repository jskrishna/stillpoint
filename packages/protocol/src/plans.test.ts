import { describe, expect, it } from 'vitest';
import {
  ALLOWANCE_WINDOW_DAYS,
  FULL_SESSIONS_PER_WEEK,
  PLAN_IDS,
  fullSessionsLeft,
  isPlanId,
  mayStartSession,
} from './plans.js';

describe('the plans', () => {
  it('names the three the pricing page lists', () => {
    expect([...PLAN_IDS]).toEqual(['free', 'plus', 'coach']);
    expect(Object.keys(FULL_SESSIONS_PER_WEEK)).toEqual([...PLAN_IDS]);
  });

  it('allows Free three full sessions a week, as the pricing page says', () => {
    expect(FULL_SESSIONS_PER_WEEK.free).toBe(3);
    expect(ALLOWANCE_WINDOW_DAYS).toBe(7);
  });

  it('does not limit the paid plans', () => {
    expect(FULL_SESSIONS_PER_WEEK.plus).toBeNull();
    expect(FULL_SESSIONS_PER_WEEK.coach).toBeNull();
  });

  it('narrows a stored plan string', () => {
    expect(isPlanId('free')).toBe(true);
    expect(isPlanId('enterprise')).toBe(false);
  });
});

describe('whether a session may start', () => {
  it('lets a free user start their first three full sessions', () => {
    for (const used of [0, 1, 2]) {
      expect(mayStartSession('full', 'free', used).allowed).toBe(true);
    }
  });

  it('stops the fourth full session in the window', () => {
    const decision = mayStartSession('full', 'free', 3);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.limit).toBe(3);
    // The reason says what they can do instead, not only what they cannot.
    expect(decision.reason).toContain('quick session is always available');
  });

  it('always allows a quick session, however many have been used', () => {
    // Not an exception to the rule — the point of it. The limit exists to
    // price the long session, and someone who is upset should never be told to
    // come back next week.
    for (const used of [0, 3, 50]) {
      expect(mayStartSession('quick', 'free', used).allowed).toBe(true);
    }
  });

  it('never stops a paid plan', () => {
    expect(mayStartSession('full', 'plus', 99).allowed).toBe(true);
    expect(mayStartSession('full', 'coach', 99).allowed).toBe(true);
  });
});

describe('how many are left', () => {
  it('counts down and stops at zero', () => {
    expect(fullSessionsLeft('free', 0)).toBe(3);
    expect(fullSessionsLeft('free', 2)).toBe(1);
    expect(fullSessionsLeft('free', 3)).toBe(0);
    // Never negative, even if the count somehow overshot.
    expect(fullSessionsLeft('free', 9)).toBe(0);
  });

  it('is null when the plan does not limit them', () => {
    expect(fullSessionsLeft('plus', 40)).toBeNull();
  });
});
