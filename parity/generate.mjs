/**
 * Regenerates `parity/cases.json` from the TypeScript implementation.
 *
 * The TypeScript protocol package is where these rules were written and its
 * tests were the specification the PHP port was built against, so it is the
 * side that generates. Both suites then assert against the same file:
 * `packages/protocol/src/parity.test.ts` and
 * `apps/api/tests/Unit/ParityTest.php`. A rule changed in one language and not
 * the other fails one of the two.
 *
 * Run it after deliberately changing a screened phrase or an extraction rule —
 * in the same commit as the change to both languages — with:
 *
 *     pnpm run parity:generate
 *
 * Regenerating to make a red test green is the wrong move: it records the
 * divergence instead of fixing it.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Imported from the built output by path, not by package name: `parity/` is
// deliberately not a workspace package, because the fixture belongs to neither
// side. Run `pnpm run build:packages` first, which `parity:generate` does.
import {
  baselineRiskScreen,
  isSubstantiveAnswer,
  literalExtraction,
  mayStartSession,
  fullSessionsLeft,
  PLAN_IDS,
  summarise,
} from '../packages/protocol/dist/index.js';

/** Utterances the screen must agree on, with why a surprising one is there. */
const UTTERANCES = [
  ['', 'nothing said'],
  ['   \n  ', 'whitespace only'],
  ['My manager called out my mistake in front of the whole team', 'ordinary upset'],
  ['I felt ashamed and rejected', 'naming feelings is not a risk signal'],
  [
    'I keep messing up. Sometimes I think everyone would be better off without me.',
    'the phrasing the designs themselves use',
  ],
  ['I want to die', null],
  ['I have been thinking about ending my life', null],
  ['sometimes I just want to hurt myself', null],
  ['there is no reason to live', null],
  ['I wish I was dead', null],
  ['I don’t want to be here any more', 'curly apostrophe'],
  ["I don't want to be here any more", 'straight apostrophe, same rule'],
  ['I WANT TO KILL MYSELF!!!', 'case and punctuation'],
  ['He hit me again last night', null],
  ['my husband threatens me when he drinks', 'a disclosure of threats, not a feeling'],
  ['I have not eaten in three days on purpose', null],
  ['I drank a whole bottle to stop feeling it', null],
  ['I feel like a burden to everyone', 'perceived burdensomeness: flagged, not stopped'],
  ['nothing matters any more', 'hopelessness: the lowest grade, still recorded'],
  ['I am so angry I could kill him', 'harm to others, not self-harm'],
  [
    'that film was about someone who wanted to die',
    'A deliberate false positive. Past tense is in the screen because people say it that way, and reported speech trips it. Leave it: a reviewer loses a minute, which is the error this screen is meant to make.',
  ],
];

/** Step answers both implementations must read the same way. */
const STEP_CASES = [
  ['notice', 'My manager dismissed my work in front of the team'],
  ['notice', 'no'],
  ['notice', '   '],
  ['notice', 'x'.repeat(100)],
  ['responsibility', 'I can see how I took it that way'],
  ['feel', 'angry'],
  ['feel', 'angry, hurt'],
  ['feel', 'Angry; Sad; Hurt'],
  ['feel', 'sad sad'],
  ['feel', 'I do not know what I feel'],
  ['feel', ''],
  ['remember', 'Being talked over at school when I was nine'],
  ['inquire', 'I am not good enough'],
  ['inquire', '“I’m not good enough.”'],
  ['inquire', 'I’m worthless'],
  ['forgive', 'I let that belief go'],
];

/**
 * Journals a coach is summarised from.
 *
 * The rule is "you only see sessions your clients choose to share", and it has
 * to mean the same thing in both languages — including that the recurring
 * belief is drawn from the shared set only. A belief said twice in private is
 * not a pattern a coach gets to see.
 */
const JOURNALS = [
  { name: 'nothing at all', entries: [] },
  {
    name: 'nothing shared',
    entries: [
      { id: 'a', belief: 'I am unlovable', daysAgo: 2, shared: false },
      { id: 'b', belief: 'I am unlovable', daysAgo: 5, shared: false },
    ],
  },
  {
    name: 'one shared, no belief',
    entries: [{ id: 'a', belief: undefined, daysAgo: 1, shared: true }],
  },
  {
    name: 'a belief repeated in shared sessions',
    entries: [
      { id: 'a', belief: 'I am not good enough', daysAgo: 1, shared: true },
      { id: 'b', belief: 'I’m not good enough.', daysAgo: 4, shared: true },
      { id: 'c', belief: 'I am too much', daysAgo: 6, shared: true },
    ],
  },
  {
    name: 'a belief repeated only in private sessions',
    entries: [
      { id: 'a', belief: 'I am unlovable', daysAgo: 1, shared: false },
      { id: 'b', belief: 'I am unlovable', daysAgo: 3, shared: false },
      { id: 'c', belief: 'I am not good enough', daysAgo: 5, shared: true },
    ],
  },
];

/** A fixed day, so the fixture does not change when it is regenerated. */
const EPOCH = Date.parse('2026-03-01T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const journalEntry = (e) => ({
  id: e.id,
  title: `Session ${e.id}`,
  occurredAt: new Date(EPOCH - e.daysAgo * DAY_MS),
  durationMinutes: 12,
  kind: 'full',
  feelings: [],
  reachedFinalStep: true,
  sharedWithCoach: e.shared,
  ...(e.belief === undefined ? {} : { belief: e.belief }),
});

/**
 * Plan allowances, which the pricing page promises and the server keeps.
 *
 * Every plan against every count that matters: under the limit, at it, past
 * it — and a quick session, which is always allowed.
 */
const PLAN_CASES = PLAN_IDS.flatMap((plan) =>
  [0, 2, 3, 4, 99].flatMap((used) => ['full', 'quick'].map((kind) => ({ plan, kind, used }))),
);

const cases = {
  note: 'Generated by parity/generate.mjs from the TypeScript implementation. Both test suites assert against it, so a rule that changes in one language and not the other fails. Do not edit by hand.',
  risk: UTTERANCES.map(([utterance, why]) => {
    const r = baselineRiskScreen.assess(utterance);
    return {
      utterance,
      ...(why === null ? {} : { why }),
      level: r.level,
      category: r.category ?? null,
      matched: r.matched ?? null,
    };
  }),
  extraction: STEP_CASES.map(([stepId, utterance]) => ({
    stepId,
    utterance,
    substantive: isSubstantiveAnswer(stepId, utterance),
    capture: literalExtraction(stepId, utterance) ?? null,
  })),
  plans: PLAN_CASES.map(({ plan, kind, used }) => {
    const decision = mayStartSession(kind, plan, used);
    return {
      plan,
      kind,
      used,
      allowed: decision.allowed,
      limit: decision.allowed ? null : decision.limit,
      left: fullSessionsLeft(plan, used),
    };
  }),
  coach: JOURNALS.map(({ name, entries }) => {
    const summary = summarise(entries.map(journalEntry));
    return {
      name,
      entries: entries.map((e) => ({
        id: e.id,
        belief: e.belief ?? null,
        occurredAt: new Date(EPOCH - e.daysAgo * DAY_MS).toISOString(),
        shared: e.shared,
      })),
      sharedCount: summary.sharedCount,
      // Epoch milliseconds, not a formatted string: the two languages spell
      // the same instant differently (`…Z` against `+00:00`) and the parity
      // check is about the rule, not about date formatting.
      lastSharedAtMs: summary.lastSharedAt?.getTime() ?? null,
      recurringBelief: summary.recurringBelief ?? null,
    };
  }),
};

const out = fileURLToPath(new URL('cases.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`);
console.log(
  `wrote ${String(cases.risk.length)} risk and ${String(cases.extraction.length)} extraction cases to ${out}`,
);
