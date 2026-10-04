/**
 * The TypeScript half of the cross-language parity check.
 *
 * `apps/api/app/Domain` is the authority on the protocol and the PHP there is a
 * port of this package. Two implementations of a crisis-stop rule is the worst
 * outcome available: they drift, and the one that drifts decides whether
 * someone gets a helpline.
 *
 * So both sides assert against one checked-in file, `parity/cases.json`. This
 * test is the TypeScript half; `apps/api/tests/Unit/ParityTest.php` is the
 * other. A rule changed in one language and not the other fails one of them.
 *
 * When a change to a screened phrase or an extraction rule is deliberate,
 * change both languages and regenerate with `pnpm run parity:generate`.
 * Regenerating to turn a red test green records the divergence instead of
 * fixing it.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mayShareEntry, sharesNewEntry, summarise } from './coach.js';
import type { CoachSharing } from './onboarding.js';
import { fullSessionsLeft, mayStartSession, type PlanId } from './plans.js';
import { isSubstantiveAnswer, literalExtraction } from './extraction.js';
import { insights } from './insights.js';
import type { FeelingId } from './feelings.js';
import type { JournalEntry } from './journal.js';
import type { CalmerRating, SessionKind } from './session.js';
import { baselineRiskScreen } from './risk.js';
import { RECORDED_UTTERANCE_LIMIT, recordable } from './utterance.js';
import type { StepId } from './steps.js';

interface RiskCase {
  readonly utterance: string;
  readonly level: string;
  readonly category: string | null;
  readonly matched: string | null;
  readonly unreadable: boolean;
}

interface ExtractionCase {
  readonly stepId: StepId;
  readonly utterance: string;
  readonly substantive: boolean;
  readonly capture: Record<string, unknown> | null;
}

interface CoachCase {
  readonly name: string;
  readonly entries: readonly {
    id: string;
    belief: string | null;
    occurredAt: string;
    shared: boolean;
  }[];
  readonly sharedCount: number;
  readonly lastSharedAtMs: number | null;
  readonly recurringBelief: { belief: string; sessions: number } | null;
}

interface PlanCase {
  readonly plan: PlanId;
  readonly kind: SessionKind;
  readonly used: number;
  readonly allowed: boolean;
  readonly limit: number | null;
  readonly left: number | null;
}

interface Limits {
  readonly recordedUtterance: number;
  readonly keptFromALongAnswer: number;
  readonly keptFromAnEmojiAnswer: number;
}

interface InsightsCase {
  readonly name: string;
  readonly windowDays: number;
  readonly nowMs: number;
  readonly entries: readonly {
    readonly id: string;
    readonly occurredAt: string;
    readonly belief: string | null;
    readonly calmerRating: string | null;
    readonly reachedFinalStep: boolean;
    readonly feelings: readonly string[];
  }[];
  readonly sessions: number;
  readonly feltCalmer: number;
  readonly reachedFinalStep: number;
  readonly feelings: readonly {
    readonly id: string;
    readonly label: string;
    readonly count: number;
  }[];
  readonly recurringBelief: { readonly belief: string; readonly sessions: number } | null;
}

interface SharingCase {
  readonly setting: CoachSharing;
  readonly hasCoach: boolean;
  readonly sharesNewEntry: boolean;
  readonly mayShareEntry: boolean;
}

interface Cases {
  readonly risk: readonly RiskCase[];
  readonly insights: readonly InsightsCase[];
  readonly sharing: readonly SharingCase[];
  readonly extraction: readonly ExtractionCase[];
  readonly plans: readonly PlanCase[];
  readonly coach: readonly CoachCase[];
  readonly limits: Limits;
}

const cases = JSON.parse(
  readFileSync(new URL('../../../parity/cases.json', import.meta.url), 'utf8'),
) as Cases;

describe('the risk screen matches the shared cases', () => {
  it('has cases to check', () => {
    expect(cases.risk.length).toBeGreaterThan(10);
  });

  for (const c of cases.risk) {
    it(`grades ${JSON.stringify(c.utterance)} as ${c.level}`, () => {
      const result = baselineRiskScreen.assess(c.utterance);
      expect({
        level: result.level,
        category: result.category ?? null,
        matched: result.matched ?? null,
        unreadable: result.unreadable,
      }).toEqual({
        level: c.level,
        category: c.category,
        matched: c.matched,
        unreadable: c.unreadable,
      });
    });
  }
});

describe('extraction matches the shared cases', () => {
  for (const c of cases.extraction) {
    it(`reads ${c.stepId}: ${JSON.stringify(c.utterance)}`, () => {
      expect(isSubstantiveAnswer(c.stepId, c.utterance)).toBe(c.substantive);
      expect(literalExtraction(c.stepId, c.utterance) ?? null).toEqual(c.capture);
    });
  }
});

describe('the user\u2019s own insights match the shared cases', () => {
  for (const c of cases.insights) {
    it(c.name, () => {
      const entries: JournalEntry[] = c.entries.map((e) => ({
        id: e.id,
        title: `Session ${e.id}`,
        occurredAt: new Date(e.occurredAt),
        durationMinutes: 12,
        kind: 'full',
        feelings: e.feelings as FeelingId[],
        reachedFinalStep: e.reachedFinalStep,
        sharedWithCoach: false,
        ...(e.belief === null ? {} : { belief: e.belief }),
        ...(e.calmerRating === null ? {} : { calmerRating: e.calmerRating as CalmerRating }),
      }));

      const result = insights(entries, new Date(c.nowMs), c.windowDays);

      expect({
        sessions: result.sessions,
        feltCalmer: result.feltCalmer,
        reachedFinalStep: result.reachedFinalStep,
        feelings: result.feelings.map((f) => ({ id: f.id, label: f.label, count: f.count })),
        recurringBelief: result.recurringBelief ?? null,
      }).toEqual({
        sessions: c.sessions,
        feltCalmer: c.feltCalmer,
        reachedFinalStep: c.reachedFinalStep,
        feelings: c.feelings,
        recurringBelief: c.recurringBelief,
      });
    });
  }
});

describe('the coach-sharing setting matches the shared cases', () => {
  for (const c of cases.sharing) {
    it(`${c.setting} with${c.hasCoach ? '' : 'out'} a coach`, () => {
      expect({
        sharesNewEntry: sharesNewEntry(c.setting, c.hasCoach),
        mayShareEntry: mayShareEntry(c.setting),
      }).toEqual({ sharesNewEntry: c.sharesNewEntry, mayShareEntry: c.mayShareEntry });
    });
  }
});

describe('a coach’s view matches the shared cases', () => {
  for (const c of cases.coach) {
    it(`summarises ${c.name}`, () => {
      const entries: JournalEntry[] = c.entries.map((e) => ({
        id: e.id,
        title: `Session ${e.id}`,
        occurredAt: new Date(e.occurredAt),
        durationMinutes: 12,
        kind: 'full',
        feelings: [],
        reachedFinalStep: true,
        sharedWithCoach: e.shared,
        ...(e.belief === null ? {} : { belief: e.belief }),
      }));

      const summary = summarise(entries);
      expect({
        sharedCount: summary.sharedCount,
        lastSharedAtMs: summary.lastSharedAt?.getTime() ?? null,
        recurringBelief: summary.recurringBelief ?? null,
      }).toEqual({
        sharedCount: c.sharedCount,
        lastSharedAtMs: c.lastSharedAtMs,
        recurringBelief: c.recurringBelief,
      });
    });
  }
});

describe('plan allowances match the shared cases', () => {
  for (const c of cases.plans) {
    it(`${c.plan}: a ${c.kind} session after ${String(c.used)} full ones`, () => {
      const decision = mayStartSession(c.kind, c.plan, c.used);

      expect({
        allowed: decision.allowed,
        limit: decision.allowed ? null : decision.limit,
        left: fullSessionsLeft(c.plan, c.used),
      }).toEqual({ allowed: c.allowed, limit: c.limit, left: c.left });
    });
  }
});

/**
 * A number in the fixture rather than a case, because a case would be a
 * 20,000-character utterance in a checked-in file nobody could then read.
 *
 * It is here at all because the bound is a rule: the two languages trimming an
 * answer at different lengths would mean the journal and the safety queue
 * disagreeing about what somebody said.
 */
describe('the recorded-utterance bound matches the shared limits', () => {
  it('is the same number in both languages', () => {
    expect(RECORDED_UTTERANCE_LIMIT).toBe(cases.limits.recordedUtterance);
  });

  it('keeps the same amount of a long answer in Devanagari', () => {
    // Characters, not bytes. A byte bound would keep a third as much Hindi as
    // English, in a product that is India-first.
    expect([...recordable('मुझे मरना है। '.repeat(4000))]).toHaveLength(
      cases.limits.keptFromALongAnswer,
    );
  });

  it('keeps the same amount of an answer made of surrogate pairs', () => {
    // Code points, so the bound never lands inside a character and leaves half
    // of one as the last thing somebody wrote.
    expect([...recordable('😢'.repeat(RECORDED_UTTERANCE_LIMIT + 10))]).toHaveLength(
      cases.limits.keptFromAnEmojiAnswer,
    );
  });
});
