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
import { summarise } from './coach.js';
import { isSubstantiveAnswer, literalExtraction } from './extraction.js';
import type { JournalEntry } from './journal.js';
import { baselineRiskScreen } from './risk.js';
import type { StepId } from './steps.js';

interface RiskCase {
  readonly utterance: string;
  readonly level: string;
  readonly category: string | null;
  readonly matched: string | null;
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

interface Cases {
  readonly risk: readonly RiskCase[];
  readonly extraction: readonly ExtractionCase[];
  readonly coach: readonly CoachCase[];
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
      }).toEqual({ level: c.level, category: c.category, matched: c.matched });
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
