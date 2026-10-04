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
import { format, resolveConfig } from 'prettier';
// Imported from the built output by path, not by package name: `parity/` is
// deliberately not a workspace package, because the fixture belongs to neither
// side. Run `pnpm run build:packages` first, which `parity:generate` does.
import {
  baselineRiskScreen,
  answerKindOf,
  apply,
  CONSENT_ITEMS,
  COUNTRIES,
  DEFAULT_COUNTRY,
  hasRequiredConsent,
  isUntouched,
  missingConsent,
  REQUIRED_CONSENT,
  startSession,
  STEP_ORDER,
  helplinesFor,
  insights,
  isSubstantiveAnswer,
  literalExtraction,
  mayStartSession,
  fullSessionsLeft,
  PLAN_IDS,
  mayShareEntry,
  sharesNewEntry,
  summarise,
  RECORDED_UTTERANCE_LIMIT,
  recordable,
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

  // India-first, and until recently the screen could not see either of these.
  // `normalise()` dropped every character outside [a-z' ], so a sentence in
  // Devanagari became an empty string and was graded `none` before a rule ran.
  ['मुझे मरना है', 'Hindi, a statement of intent — this used to be invisible'],
  ['मैं आत्महत्या करना चाहता हूँ', 'Hindi, the word for suicide'],
  ['mujhe marna hai yaar', 'Hinglish, the script most people type on a phone'],
  ['khudkhushi kar lunga', 'Hinglish, and the spelling nobody agrees on'],
  ['ab jeene ka mann nahi karta', 'hopelessness, so medium — not a stop'],
  ['main sabke liye bojh ban gaya hu', 'burdensomeness in Hinglish, medium'],
  ['मैं जीने से थक गया हूँ', 'the same in Devanagari, medium'],
  ['aaj mera manager bahut bura bola', 'an ordinary bad day in Hinglish — none'],
  ['मेरा दिन बहुत खराब था', 'an ordinary bad day in Hindi — none'],
  ['my husband threatens me when he drinks', 'a disclosure of threats, not a feeling'],
  ['I have not eaten in three days on purpose', null],
  ['I drank a whole bottle to stop feeling it', null],
  ['I feel like a burden to everyone', 'perceived burdensomeness: flagged, not stopped'],
  ['nothing matters any more', 'hopelessness: the lowest grade, still recorded'],
  ['I am so angry I could kill him', 'harm to others, not self-harm'],
  // Scripts the screen has no phrases for. The grade is `none` and must stay
  // `none` — an unreadable utterance is not evidence of risk — but the screen
  // now says it could not read them, which is a different answer from "read
  // and clear". Both languages have to agree on that, because one saying it
  // and the other not is how the count stops meaning anything.
  ['আমি মরতে চাই', 'Bengali — the screen cannot read this and now says so'],
  ['நான் சாக விரும்புகிறேன்', 'Tamil, the same'],
  ['میں تھک گیا ہوں', 'Urdu in Perso-Arabic, the same'],
  ['I want to die, মা', 'a high match with one unreadable word: still a stop'],
  ['I am fine 😊 — really, 100%', 'emoji and digits are not letters, so readable'],
  [
    'that film was about someone who wanted to die',
    'A deliberate false positive. Past tense is in the screen because people say it that way, and reported speech trips it. Leave it: a reviewer loses a minute, which is the error this screen is meant to make.',
  ],
  // French, because Canada is the first market and French is one of its two
  // official languages. Latin script, so the screen never reported it as
  // unreadable — it folded the accents away, matched nothing, and graded a
  // plain statement of intent `none` with full confidence. These pin both the
  // grading and the accent folding, which the two languages do with the same
  // three Unicode steps and could silently disagree about.
  ['je veux mourir', 'French, intent'],
  ['mettre fin à mes jours', 'French, intent, with accents'],
  ['mettre fin a mes jours', 'the same typed without them'],
  ['tout le monde serait mieux sans moi', 'the designs’ own phrase, in French'],
  ['je n’en peux plus', 'French hopelessness: medium, not high'],
  ['je suis fatigué de vivre', 'accented, and medium'],
  ['je suis fatigue de vivre', 'unaccented, and the same grade'],
  ['à quoi bon', 'broad enough to be low'],
  ['je suis en colère', 'ordinary French upset'],
  ['aujourd’hui mon patron m’a critiqué devant toute l’équipe', 'ordinary, with every accent'],
  // Latin script and not covered: the limitation the folding does not fix, and
  // the one `unreadable` cannot announce. Pinned so it is a known answer
  // rather than a surprise.
  ['quiero morirme', 'Spanish: not covered, and not reported unreadable'],
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

  // The cap, which was a rule only the two grids kept: `MAX_FEELINGS` refused
  // the fourth tap and `FeelingId::MAX_CHOICES` was used by nothing, so a turn
  // naming all twelve recorded all twelve — the journal listed twelve and
  // insights counted twelve for one session, which is a ranking of nothing.
  // The first three in the order given, so these also pin the order, which is
  // where the two languages could disagree without the count noticing.
  ['feel', 'angry hurt sad afraid'],
  [
    'feel',
    'angry afraid anxious sad guilty ashamed rejected unworthy lonely hurt ' +
      'overwhelmed powerless humiliated',
  ],
  ['feel', 'powerless lonely angry sad'],
  ['remember', 'Being talked over at school when I was nine'],
  ['inquire', 'I am not good enough'],
  ['inquire', '“I’m not good enough.”'],
  ['inquire', 'I’m worthless'],
  ['forgive', 'I let that belief go'],

  // Hindi, where the two languages could most easily disagree without anyone
  // noticing: a title is cut to 60, and JavaScript counts UTF-16 units while
  // PHP's `mb_substr` counts code points. They agree for Devanagari, which is
  // entirely in the BMP — but that is a fact about the script rather than a
  // guarantee either implementation makes, so it is pinned here.
  ['notice', 'मेरे मैनेजर ने पूरी टीम के सामने मेरे काम को खारिज कर दिया और मुझे बहुत बुरा लगा'],
  ['notice', 'मुझे गुस्सा आ रहा है'],
  ['inquire', 'मैं काफी नहीं हूँ।'],

  // And the case the note above describes but did not cover, which is where
  // the two languages did in fact disagree. An emoji is outside the BMP, so
  // JavaScript counted it as two and PHP as one: the same answer produced a
  // 30-character title in one language and a 40-character one in the other,
  // and the shorter one ended in half of a character, which a journal shows
  // as a replacement glyph. On a phone an emoji is not an unusual thing to
  // type, so this is the realistic version of the hazard rather than the
  // exotic one.
  ['notice', '😢'.repeat(40)],
  ['notice', `a${'😢'.repeat(40)}`],
  ['notice', `${'x'.repeat(59)}😢`],
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
    // The danda is the full stop of Devanagari, and until it was stripped
    // alongside the Latin one these were two beliefs rather than one said
    // twice — so the belief that comes back did not come back.
    name: 'a Hindi belief repeated with and without a danda',
    entries: [
      { id: 'a', belief: 'मैं काफी नहीं हूँ', daysAgo: 1, shared: true },
      { id: 'b', belief: 'मैं काफी नहीं हूँ।', daysAgo: 4, shared: true },
      { id: 'c', belief: 'मैं अकेला हूँ', daysAgo: 6, shared: true },
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

/**
 * One fixture event into the reducer's own shape.
 *
 * The fixture names an operation because the PHP side has a method per event
 * rather than a tagged union; this is the only place the two spellings meet.
 */
const SAFETY_LEVELS = ['none', 'low', 'medium', 'high'];
const RATINGS = ['yes', 'a_little', 'no'];
const OPS = ['guide_turn', 'step_satisfied', 'safety_signal', 'user_stopped', 'rated'];

/**
 * One fixture event into the reducer's own shape.
 *
 * The fixture names an operation because the PHP side has a method per event
 * rather than a tagged union; this is the only place the two spellings meet.
 *
 * **It throws on anything it does not know**, and that is not defensive
 * programming. This file is plain JavaScript, so nothing type-checks the
 * fixture's own spellings: written with `level: 'crisis'` — which reads
 * correctly, and is how CLAUDE.md describes the rule in prose — the reducer
 * found no such level, silently did nothing, and the generator wrote out three
 * cases saying a crisis signal does not end a session. Both suites would then
 * have agreed with that, which is worse than a divergence: a red parity test
 * is a question, and a fixture generated from a typo is a confident answer
 * nobody asked. It was caught by reading the output, which is not a method.
 */
const toEvent = (e) => {
  if (!OPS.includes(e.op)) throw new Error(`unknown session event: ${String(e.op)}`);
  if (e.op === 'step_satisfied') return { type: 'step_satisfied', capture: e.capture ?? {} };
  if (e.op === 'safety_signal') {
    if (!SAFETY_LEVELS.includes(e.level)) {
      throw new Error(
        `unknown safety level: ${String(e.level)} (one of ${SAFETY_LEVELS.join(', ')})`,
      );
    }
    return { type: 'safety_signal', level: e.level };
  }
  if (e.op === 'rated') {
    if (!RATINGS.includes(e.rating)) {
      throw new Error(`unknown rating: ${String(e.rating)} (one of ${RATINGS.join(', ')})`);
    }
    return { type: 'rated', rating: e.rating };
  }
  return { type: e.op };
};

/** A fixed day, so the fixture does not change when it is regenerated. */
const EPOCH = Date.parse('2026-03-01T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const journalEntry = (e) => ({
  id: e.id,
  title: `Session ${e.id}`,
  occurredAt: new Date(EPOCH - e.daysAgo * DAY_MS),
  durationMinutes: 12,
  kind: 'full',
  // The coach cases do not vary these; the insights cases do, so they are
  // parameters with the coach cases' values as the defaults.
  feelings: e.feelings ?? [],
  reachedFinalStep: e.reached ?? true,
  sharedWithCoach: e.shared,
  ...(e.belief === undefined ? {} : { belief: e.belief }),
  ...(e.calmer === undefined || e.calmer === null ? {} : { calmerRating: e.calmer }),
});

/**
 * Consent, which is the server's gate on starting a session at all.
 *
 * Both languages hold which items are required, and a disagreement points
 * either way: a client that thinks fewer are needed walks somebody into a 403
 * three screens later, and one that thinks more are needed blocks a person who
 * has already agreed to everything the server asks.
 *
 * `improve` is in the list and is not required, which is the case that matters
 * — a rule that required everything would pass a fixture of only the required
 * ones.
 */
const CONSENT_CASES = [
  [],
  ['understands'],
  ['adult'],
  ['improve'],
  ['understands', 'adult'],
  ['understands', 'improve'],
  ['understands', 'adult', 'improve'],
  ['adult', 'understands'],
];

/**
 * Sequences of events applied to a fresh session.
 *
 * CLAUDE.md calls three of these rules "not preferences": a crisis signal ends
 * the session, an ended session is terminal apart from the rating, and
 * `safetyLevel` only rises. `furthestStepId` is a fourth of the same kind.
 * All four live in both languages, each with its own tests, and nothing
 * compared them — so a port that forgot one would be caught only by whichever
 * suite happened to cover it, and the rule that decides whether somebody is
 * handed a helpline is the one it is least acceptable to get wrong in one
 * language.
 *
 * The TypeScript side is a reducer over event objects and the PHP side is a
 * set of `with*` methods; they are one-to-one, so a sequence names an
 * operation and both dispatch on it.
 */
const SESSION_SEQUENCES = [
  { name: 'a fresh session', kind: 'full', events: [] },
  { name: 'a fresh quick session', kind: 'quick', events: [] },
  {
    // A thin answer spends a guide turn without moving the step, which is why
    // a screen cannot work out "untouched" from `data` being empty.
    name: 'a guide turn, nothing gathered',
    kind: 'full',
    events: [{ op: 'guide_turn' }],
  },
  {
    name: 'one step satisfied',
    kind: 'full',
    events: [{ op: 'step_satisfied', capture: { whatHappened: 'I was spoken over' } }],
  },
  {
    // Six satisfied steps complete the session, and the furthest step stays at
    // the last one rather than going null with `stepId`.
    name: 'all six steps',
    kind: 'full',
    events: [
      { op: 'step_satisfied', capture: { whatHappened: 'I was spoken over' } },
      { op: 'step_satisfied', capture: {} },
      { op: 'step_satisfied', capture: { feelings: ['angry', 'ashamed'] } },
      { op: 'step_satisfied', capture: { memory: { description: 'A teacher', age: 9 } } },
      { op: 'step_satisfied', capture: { belief: 'I am not good enough' } },
      { op: 'step_satisfied', capture: { forgiveness: 'I forgive myself' } },
    ],
  },
  {
    // Only ever up. A reducer handed a snapshot of a moment that had passed is
    // exactly how a safety level got written back down once.
    name: 'a safety level never falls',
    kind: 'full',
    events: [
      { op: 'safety_signal', level: 'medium' },
      { op: 'safety_signal', level: 'low' },
      { op: 'safety_signal', level: 'none' },
    ],
  },
  {
    name: 'a crisis ends the session',
    kind: 'full',
    events: [{ op: 'safety_signal', level: 'high' }],
  },
  {
    // Terminal. Nothing after the stop may move the step, spend a guide turn,
    // relabel why it ended, or lower the level — and there is no resume path
    // around a safety stop anywhere in the product.
    name: 'an ended session ignores everything but the rating',
    kind: 'full',
    events: [
      { op: 'step_satisfied', capture: { whatHappened: 'I was spoken over' } },
      { op: 'safety_signal', level: 'high' },
      { op: 'step_satisfied', capture: { belief: 'should not land' } },
      { op: 'guide_turn' },
      { op: 'user_stopped' },
      { op: 'safety_signal', level: 'none' },
      { op: 'rated', rating: 'a_little' },
    ],
  },
  {
    // The high-water mark, which is the whole reason it exists: ending clears
    // `stepId`, and a chart about where sessions stop cannot read a field that
    // is cleared when they stop.
    name: 'the furthest step survives the end',
    kind: 'full',
    events: [
      { op: 'step_satisfied', capture: { whatHappened: 'I was spoken over' } },
      { op: 'step_satisfied', capture: {} },
      { op: 'step_satisfied', capture: { feelings: ['sad'] } },
      { op: 'safety_signal', level: 'high' },
    ],
  },
  {
    name: 'the user stops it themselves',
    kind: 'full',
    events: [
      { op: 'step_satisfied', capture: { whatHappened: 'I was spoken over' } },
      { op: 'user_stopped' },
    ],
  },
  {
    // A flag is raised and the session carries on: hopelessness is `medium`
    // and stopping on it would make the product unusable on an ordinary bad
    // day.
    name: 'a medium signal flags without stopping',
    kind: 'full',
    events: [
      { op: 'safety_signal', level: 'medium' },
      { op: 'step_satisfied', capture: { whatHappened: 'I cannot go on like this' } },
    ],
  },
  {
    name: 'a rating on a live session',
    kind: 'full',
    events: [{ op: 'rated', rating: 'yes' }],
  },
];

/**
 * Countries, including the ones this product knows nothing about.
 *
 * The crisis numbers themselves live in both languages — `helplinesFor()` and
 * `App\Domain\Helpline::forCountry()` — each with its own tests, and nothing
 * compared them. Of everything in this repository that could drift, this is
 * the one where drift means somebody in crisis dialling a number that does not
 * answer where they are.
 *
 * It got sharper rather than quieter: the session screen now reads the
 * TypeScript list itself when a turn never reaches the server, so a
 * divergence would mean a dropped request showing different numbers from a
 * delivered one, to the same person, in the same minute.
 *
 * The unknown ones are cases rather than an afterthought. An empty list is the
 * deliberate answer — a plausible-looking wrong number is worse than none —
 * and `'ca'` is in here because neither language lowercases: if a country ever
 * reaches the column in the wrong case, both must agree that the answer is no
 * numbers rather than one of them quietly working.
 */
const COUNTRY_CASES = [...COUNTRIES, 'US', 'GB', 'ca', 'IND', ''];

/**
 * Journals the user's own insights are computed from.
 *
 * `parity/cases.json` had no insights section at all, and insights is a rule
 * in both languages with a lot of surface: a feeling counted once per session
 * however often it was named, feelings ordered by count and then by label,
 * "felt calmer" counting an explicit yes and not "a little", the
 * recurring-belief threshold of two, its tie-break by recency, and the belief
 * normaliser. None of that was compared.
 *
 * The window case is the one that could not be written before this: the
 * TypeScript `insights()` has always narrowed to the window itself, and
 * `Insights::from()` recorded `windowDays` as a label and trusted its caller.
 * Both narrow now, so an out-of-window entry is a case rather than a question
 * nobody had answered.
 */
const INSIGHT_JOURNALS = [
  { name: 'an empty journal', window: 30, entries: [] },
  {
    name: 'one session, nothing repeated',
    window: 30,
    entries: [
      {
        daysAgo: 1,
        belief: 'I am not good enough',
        calmer: 'yes',
        reached: true,
        feelings: ['ashamed'],
      },
    ],
  },
  {
    // One session counts once per feeling, however often it was named. A
    // reducer that counted occurrences would read a single session as three.
    name: 'a feeling named more than once in one session',
    window: 30,
    entries: [
      {
        daysAgo: 1,
        belief: undefined,
        calmer: 'yes',
        reached: true,
        feelings: ['angry', 'angry', 'angry'],
      },
      { daysAgo: 2, belief: undefined, calmer: 'no', reached: false, feelings: ['angry', 'sad'] },
    ],
  },
  {
    // Ties in the count are broken by the label, so the order is stable
    // across both languages rather than by whichever map iterated first.
    name: 'feelings tied on count, ordered by label',
    window: 30,
    entries: [
      {
        daysAgo: 1,
        belief: undefined,
        calmer: 'a_little',
        reached: true,
        feelings: ['sad', 'angry', 'ashamed'],
      },
    ],
  },
  {
    // "A little" is deliberately not counted: the number is shown back to the
    // user as something they said, and rounding a hedge up into agreement is
    // the product telling them they felt better than they said they did.
    name: 'a hedge is not a yes',
    window: 30,
    entries: [
      { daysAgo: 1, belief: undefined, calmer: 'a_little', reached: true, feelings: [] },
      { daysAgo: 2, belief: undefined, calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 3, belief: undefined, calmer: 'no', reached: false, feelings: [] },
      { daysAgo: 4, belief: undefined, calmer: null, reached: false, feelings: [] },
    ],
  },
  {
    // The wording kept is the most recent one, which is how the user puts it
    // now — and the two spellings are one belief because the normaliser
    // expands the contraction and drops the full stop.
    name: 'a belief said twice, in two spellings',
    window: 30,
    entries: [
      { daysAgo: 1, belief: 'I’m not good enough.', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 9, belief: 'I am not good enough', calmer: 'no', reached: true, feelings: [] },
    ],
  },
  {
    // A belief named once is not a pattern, so the threshold is two.
    name: 'two beliefs, each said once',
    window: 30,
    entries: [
      { daysAgo: 1, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 3, belief: 'I am too much', calmer: 'yes', reached: true, feelings: [] },
    ],
  },
  {
    // Two beliefs each said twice: the tie breaks by whichever was said most
    // recently, not by insertion order.
    name: 'two beliefs tied on count, broken by recency',
    window: 30,
    entries: [
      { daysAgo: 8, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 6, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 4, belief: 'I am too much', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 2, belief: 'I am too much', calmer: 'yes', reached: true, feelings: [] },
    ],
  },
  {
    // The danda is Devanagari's full stop, and until it was stripped beside
    // the Latin one these were two beliefs rather than one said twice.
    name: 'a Hindi belief with and without a danda',
    window: 30,
    entries: [
      { daysAgo: 1, belief: 'मैं काफी नहीं हूँ।', calmer: 'yes', reached: true, feelings: [] },
      { daysAgo: 5, belief: 'मैं काफी नहीं हूँ', calmer: 'no', reached: true, feelings: [] },
    ],
  },
  {
    // The case that could not be written while the two languages disagreed
    // about whose job the window was. 40 days ago is outside a 30-day window,
    // so it counts for nothing — not the session, not the feeling, and not
    // towards a belief repeating.
    name: 'an entry outside the window counts for nothing',
    window: 30,
    entries: [
      { daysAgo: 2, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: ['sad'] },
      { daysAgo: 40, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: ['sad'] },
    ],
  },
  {
    // And the window is a parameter, not only its default.
    name: 'a shorter window excludes more',
    window: 7,
    entries: [
      { daysAgo: 1, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: ['sad'] },
      { daysAgo: 10, belief: 'I am unlovable', calmer: 'yes', reached: true, feelings: ['sad'] },
    ],
  },
];

/**
 * Plan allowances, which the pricing page promises and the server keeps.
 *
 * Every plan against every count that matters: under the limit, at it, past
 * it — and a quick session, which is always allowed.
 */
const PLAN_CASES = PLAN_IDS.flatMap((plan) =>
  [0, 2, 3, 4, 99].flatMap((used) => ['full', 'quick'].map((kind) => ({ plan, kind, used }))),
);

/**
 * Every sharing choice against every state that changes the answer.
 *
 * Small on purpose: three settings and two states is the whole input space,
 * and the rule is worth pinning in both languages because it decides whether
 * somebody else reads a session.
 */
const SHARING_CASES = ['ask_each_time', 'never', 'always'].flatMap((setting) =>
  [false, true].map((hasCoach) => ({ setting, hasCoach })),
);

const cases = {
  note: 'Generated by parity/generate.mjs from the TypeScript implementation. Both test suites assert against it, so a rule that changes in one language and not the other fails. Do not edit by hand.',
  // Numbers both languages have to agree on, where a whole case would be
  // unreadable in a checked-in fixture — a 20,000-character utterance is not
  // something anybody should have to scroll past to read this file.
  limits: {
    recordedUtterance: RECORDED_UTTERANCE_LIMIT,
    // A short worked example, so the rule and not only the number is covered:
    // characters rather than bytes, and never a character cut in half.
    keptFromALongAnswer: [...recordable('मुझे मरना है। '.repeat(4000))].length,
    keptFromAnEmojiAnswer: [...recordable('😢'.repeat(RECORDED_UTTERANCE_LIMIT + 10))].length,
  },
  risk: UTTERANCES.map(([utterance, why]) => {
    const r = baselineRiskScreen.assess(utterance);
    return {
      utterance,
      ...(why === null ? {} : { why }),
      level: r.level,
      category: r.category ?? null,
      matched: r.matched ?? null,
      unreadable: r.unreadable,
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
  steps: {
    order: [...STEP_ORDER],
    // The answer kind belongs to the step id and not to a protocol version:
    // staff editing prompts in the console must not be able to turn a
    // selection into a sentence. Step 3 is a grid of twelve feelings and
    // "choose up to 3", so the client posts ids; a language that thought it
    // was prose would judge a selection by its word count and stall the step
    // for anybody who did not happen to pick exactly three.
    kinds: STEP_ORDER.map((id, i) => ({ id, ordinal: i + 1, answerKind: answerKindOf(id) })),
  },
  consent: {
    items: CONSENT_ITEMS.map((i) => ({ id: i.id, required: i.required })),
    required: [...REQUIRED_CONSENT],
    cases: CONSENT_CASES.map((accepted) => ({
      accepted,
      ok: hasRequiredConsent(accepted),
      missing: [...missingConsent(accepted)],
    })),
  },
  sessions: SESSION_SEQUENCES.map(({ name, kind, events }) => {
    let session = startSession(kind);
    for (const event of events) {
      session = apply(session, toEvent(event));
    }
    return {
      name,
      kind,
      events,
      stepId: session.stepId,
      furthestStepId: session.furthestStepId,
      guideTurnsUsed: session.guideTurnsUsed,
      safetyLevel: session.safetyLevel,
      endReason: session.endReason,
      phase: session.phase,
      untouched: isUntouched(session),
      data: {
        whatHappened: session.data.whatHappened ?? null,
        feelings: [...session.data.feelings],
        memory: session.data.memory ?? null,
        belief: session.data.belief ?? null,
        forgiveness: session.data.forgiveness ?? null,
        title: session.data.title ?? null,
        calmerRating: session.data.calmerRating ?? null,
      },
    };
  }),
  helplines: {
    countries: [...COUNTRIES],
    defaultCountry: DEFAULT_COUNTRY,
    forCountry: COUNTRY_CASES.map((country) => ({
      country,
      helplines: helplinesFor(country).map((h) => ({
        name: h.name,
        number: h.number,
        detail: h.detail,
        country: h.country,
        kind: h.kind,
      })),
    })),
  },
  insights: INSIGHT_JOURNALS.map(({ name, window, entries }) => {
    const result = insights(
      entries.map((e, i) =>
        journalEntry({
          id: `i${String(i)}`,
          daysAgo: e.daysAgo,
          shared: false,
          belief: e.belief,
          calmer: e.calmer,
          reached: e.reached,
          feelings: e.feelings,
        }),
      ),
      new Date(EPOCH),
      window,
    );
    return {
      name,
      windowDays: window,
      // Epoch milliseconds for `now`, so both languages read one instant
      // rather than parsing a string two ways.
      nowMs: EPOCH,
      entries: entries.map((e, i) => ({
        id: `i${String(i)}`,
        occurredAt: new Date(EPOCH - e.daysAgo * DAY_MS).toISOString(),
        belief: e.belief ?? null,
        calmerRating: e.calmer ?? null,
        reachedFinalStep: e.reached,
        feelings: e.feelings,
      })),
      sessions: result.sessions,
      feltCalmer: result.feltCalmer,
      reachedFinalStep: result.reachedFinalStep,
      feelings: result.feelings.map((f) => ({ id: f.id, label: f.label, count: f.count })),
      recurringBelief: result.recurringBelief ?? null,
    };
  }),
  sharing: SHARING_CASES.map(({ setting, hasCoach }) => ({
    setting,
    hasCoach,
    sharesNewEntry: sharesNewEntry(setting, hasCoach),
    // Not a function of `hasCoach`, and listed against both anyway: the
    // question "may the owner turn this on" has the same answer whether or not
    // anybody is paired, and a fixture that only ever asked it one way would
    // not say so.
    mayShareEntry: mayShareEntry(setting),
  })),
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

// Written through Prettier, because the repository's `format:check` is a gate
// and `JSON.stringify` does not agree with it about short arrays. Without this,
// regenerating left the tree failing that gate and `git diff` full of
// reformatting that had nothing to do with the rule that changed.
//
// **With the repository's own config**, which it did not read: `format()` with
// only a `filepath` uses Prettier's defaults, and the default `printWidth` is
// 80 where this repository sets 100. That had never mattered, because no
// section of the fixture happened to format differently under the two — and
// then one did, and `pnpm run parity:generate` started leaving the tree
// failing the gate the line above exists to pass.
const options = (await resolveConfig(out)) ?? {};
const formatted = await format(JSON.stringify(cases, null, 2), {
  ...options,
  filepath: out,
});
writeFileSync(out, formatted);
console.log(
  `wrote ${String(cases.risk.length)} risk and ${String(cases.extraction.length)} extraction cases to ${out}`,
);
