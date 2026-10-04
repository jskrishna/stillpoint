/**
 * Builds the pack a clinician reads to sign off on the risk screen.
 *
 * Generated rather than written, for one reason: a clinician signing off on a
 * phrase list the code no longer matches would be worse than no sign-off at
 * all. Run it before sending the pack, and run it again after any change to
 * `packages/protocol/src/risk.ts`:
 *
 *     pnpm run clinical:review
 *
 * It reads the rules the screen actually uses, so the document cannot describe
 * a screen that does not exist.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  BASELINE_RULES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  baselineRiskScreen,
  helplinesFor,
} from '../../packages/protocol/dist/index.js';

const LEVELS = ['high', 'medium', 'low'];

const COUNTRY_NAME = { CA: 'Canada', IN: 'India' };

const CATEGORY = {
  self_harm: 'Self-harm or suicide',
  harm_to_others: 'Harm to others',
  medical: 'Medical',
  trauma: 'Trauma or abuse',
};

const WHAT_HAPPENS = {
  high: '**The session ends immediately.** The guide is never consulted. The person is shown a pause screen with the crisis numbers for their country (see below), and the session cannot be resumed or continued. A flag is raised for a reviewer. No journal entry is written.',
  medium:
    'The session continues normally. A flag is raised for a reviewer, with the sentence that matched. The person is not interrupted and is not told anything happened.',
  low: 'The session continues normally. A flag is raised for a reviewer, at the lowest severity. The person is not interrupted and is not told anything happened.',
};

/**
 * What we are asking, as data rather than as seven `w(...)` calls.
 *
 * The opening paragraph says how many there are, and it said "four" for a
 * while after there were seven — in the first thing the reader reads, in a
 * document whose whole point is being accurate about what this screen does.
 * Counted from this array now, so it cannot say a number that is not true.
 */
const QUESTIONS = [
  [
    '**Is this list acceptable as an interim backstop** while a trained model',
    'is built — and if not, what should be removed or added? We would rather be',
    'told it is inadequate than ship it believing otherwise.',
  ],
  [
    '**Is the grading boundary right?** Specifically: should hopelessness and',
    'burdensomeness ever end a session, when ending it means the person cannot',
    'continue and is shown helplines?',
  ],
  [
    '**Is the pause screen clinically appropriate** — what it says, and showing',
    'the numbers listed above, and showing a national line and a provincial',
    'one (988 and Québec’s 1-866-APPELLE) on the same screen?',
  ],
  [
    '**Should a safety flag outlive the person deleting their account?**',
    'Today it is deleted with everything else, because that is what erasure',
    'means. Which also means that if somebody said they were in danger and then',
    'deleted their account, no reviewer can follow it up. If a flag should',
    'survive, in what form and for how long?',
  ],
  [
    '**Should a stop stop anything more than the session?** A person can start',
    'a new one immediately. We think refusing would be worse, and we are not',
    'confident. If something should change — a cooldown, an acknowledgement',
    'before starting again, the same numbers shown on the way in — it is a',
    'product change we would make.',
  ],
  [
    '**How quickly must a flag be read, and by whom?** There is nobody on call',
    'and no alerting today. Your answer decides whether this queue is a',
    'safeguarding process that needs rotas and escalation, or a review log —',
    'and it is the difference between what we have built and what we would',
    'have to build.',
  ],
  [
    '**Should the person be able to read back what they said in a stopped',
    'session?** It is the one thing they typed that they cannot see again.',
    'Handing somebody their own crisis disclosure months later, unprompted, is',
    'not obviously a kindness; nor is keeping it from them. We have written the',
    'argument down both ways and not chosen.',
  ],
];

/**
 * Spelled out, because this is prose a person reads and "7 answers" is not how
 * the sentence was written. Falls back to the digits past ten.
 */
function spelled(n) {
  const words = [
    'no',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
  ];

  return words[n] ?? String(n);
}

function commit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const lines = [];
const w = (s = '') => lines.push(s);

w('# Stillpoint — risk screen, for clinical review');
w();
w(`Generated from \`packages/protocol/src/risk.ts\` at commit \`${commit()}\`.`);
w('Regenerate with `pnpm run clinical:review` after any change to the screen.');
w();
w('## What we are asking for');
w();
w(
  `${spelled(QUESTIONS.length)} answers, in [Questions](#questions-we-need-answered) at the end. You do`,
);
w('not need to read any code: everything the screen does is in this document,');
w('including every phrase it looks for and the grade each one carries.');
w();
w('It is about half an hour of reading. You do not need to use the product');
w(
  `to answer the ${spelled(QUESTIONS.length).toLowerCase()} questions — we can walk you through it if that helps,`,
);
w('but this document is written so that you do not have to.');
w();
w('**We would rather be told this is inadequate than ship it believing');
w('otherwise.** Nothing here is a request for approval.');
w();
w('## What the product is');
w();
w('Stillpoint is a guide that walks an adult through six steps when they are');
w('upset: Notice → Responsibility → Feel → Remember → Inquire → Forgive. It is');
w('not therapy and does not present itself as therapy. The person types their');
w('answers; the guide speaks its questions aloud and asks nothing else of them.');
// Built from `DEFAULT_COUNTRY` and `COUNTRIES` rather than written out. This
// line said "The product is India-first" for a while after it was not — in the
// one document whose whole purpose is to be handed to a clinician in the first
// market, who would have read it and concluded the product was for somewhere
// else. The same mistake as the consent screens keeping their own copy of the
// crisis numbers, in prose instead of code.
w(
  `${COUNTRY_NAME[DEFAULT_COUNTRY] ?? DEFAULT_COUNTRY} is the first market, and ` +
    `a new account is assumed to be there. ` +
    `${COUNTRIES.filter((c) => c !== DEFAULT_COUNTRY)
      .map((c) => COUNTRY_NAME[c] ?? c)
      .join(' and ')} is covered as well.`,
);
w();
w('## What the screen is, and what it is not');
w();
w('It is a **phrase screen**: it looks for fixed phrases in what the person');
w('typed and grades what it finds. It cannot read tone, context, metaphor or');
w('irony. It is not a classifier, it is not a clinical instrument, and nothing');
w('in the product describes it as either.');
w();
w('It exists so that the most unambiguous disclosures cannot be missed while a');
w('trained model is chosen and reviewed. It is **tuned deliberately for recall**:');
w('a false flag costs a reviewer a minute, a missed one costs something that');
w('cannot be undone.');
w();
w('### The order it runs in');
w();
w('1. The person sends an answer.');
w('2. The screen reads it. This happens **before** anything else — before the');
w('   guide is consulted, and before any rate limit can refuse the request.');
w('3. If the grade is **high**, the session ends there and the guide is never');
w('   asked to say anything.');
w('4. Otherwise the guide asks the next question, and any flag is recorded.');
w();
w('This ordering is enforced in code and has tests asserting it. A model');
w('answering somebody who has just said they are not safe is the specific');
w('failure it prevents.');
w();
w('### What the person sees, and what we never tell them');
w();
w('On a high grade the person sees a pause screen with the crisis numbers for');
w('their country:');
w();
for (const country of COUNTRIES) {
  w(`**${COUNTRY_NAME[country] ?? country}**`);
  w();
  for (const line of helplinesFor(country)) {
    w(`- **${line.number}** — ${line.name}. ${line.detail}.`);
  }
  w();
}
w('A country this product has no numbers for is shown **none**, rather than a');
w('plausible-looking number from somewhere else. A wrong crisis number is worse');
w('than none, and that is the whole reason this list is short.');
w();
w('The person is **never** told which rule they tripped, the grade, or the');
w('phrase that matched. A medium or low flag is invisible to them.');
w();
w('### What happens after the session stops');
w();
w('The session is over. It cannot be resumed — there is no path around a');
w('safety stop — and it is **never written to the journal**, so the person');
w('cannot read back what they said in it. Those words exist only in the flag,');
w('which only an administrator can open, and the product’s “export');
w('everything” does not include them.');
w();
w('**And the person can start a new session straight away.** Measured against');
w('the running product: a stop, then a new session accepted at step 1, with no');
w('cooldown and nothing asked of them in between. The stop is a stop on that');
w('session, not a lock on the product. That is deliberate — refusing would');
w('mean telling somebody who has just said they are not safe to go away — but');
w('it means the screen can be walked past by anybody who does not repeat the');
w('phrase, and we would rather you told us whether that is the right call.');
w();
w('### Where a flag goes, and who is watching');
w();
w('To a queue only an administrator can open — not a coach. A flag holds the');
w('grade, the category, when it was raised, and **the sentence the person');
w('typed**. That sentence is the most sensitive thing the product stores. It is');
w('encrypted at rest.');
w();
w('**Nobody is on call.** There is no alert, no email, no notification and no');
w('response time: the only thing that brings a reviewer to that queue is');
w('somebody opening the console. The queue shows each flag’s age, and the');
w('overview reports how long the longest-waiting open flag has been waiting,');
w('precisely because that is the number nobody is otherwise watching. Whether');
w('a flagged disclosure may sit unread for a day is not a question the code');
w('can answer.');
w();
w('## The grading rule');
w();
w('Only **a statement of intent, or of an act**, is high — because high ends the');
w('session, and ending a session is a serious thing to do to somebody who was');
w('asking for help.');
w();
w('Hopelessness and feeling like a burden are **medium** or **low**: flagged for');
w('a reviewer, not stopped on. People say "I can\'t go on" and "I feel like a');
w('burden" on an ordinary bad day often enough that stopping on them would make');
w('the product unusable by the people it is for.');
w();
w('Past tense is included, because people speak that way. This trips on reported');
w('speech — "a film about someone who wanted to die" is graded high and ends the');
w('session. That false positive is deliberate and is recorded as such.');
w();
w('## The languages it covers');
w();
w('**English, French, Hinglish (romanised Hindi) and Hindi in Devanagari** —');
w('and it is thin in all four. French is here because Canada is the first');
w('market and French is one of its two official languages. Hinglish has no');
w('settled spelling, so common variants are listed separately; a missed');
w('spelling is a missed disclosure.');
w();
w('Accents are folded before matching, so "fatigué" and "fatigue" are the same');
w('phrase — a phone keyboard without French accents is ordinary.');
w();
w('### Two different kinds of gap, and only one of them announces itself');
w();
w('When somebody writes in a script the screen has no phrases for at all —');
w('Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi,');
w('Perso-Arabic — it records that **it could not read the text**, rather than');
w('reporting that it found nothing. That is counted and shown to');
w('administrators, so the gap is visible. Nothing is flagged on that basis, and');
w('nothing is stored about which language it was.');
w();
w('**A language written in Latin script that it has no phrases for does not');
w('announce itself.** It normalises cleanly, matches nothing, and comes back');
w('"nothing found" with full confidence — which is exactly what French got');
w('until French was added. Spanish and Portuguese are in that position now.');
w('This is the limitation we would most like your view on: it is not that the');
w('screen is thin, it is that in these cases it cannot tell that it is.');
w();
w('**And the honest answer depends on the keyboard, not on the person.** The');
w('rows below are the same sentence in the same language, typed two ways. In');
w('its own script the screen says it could not read it. Typed in Latin letters');
w('— which is how a great many people type on a phone — the same words come');
w('back as nothing found, with confidence. Punjabi, Mandarin, Cantonese,');
w('Arabic and Tagalog all have large communities in Canada, which is the first');
w('market.');
w();
w('| Said | In its own script | Typed in Latin letters |');
w('| --- | --- | --- |');
for (const [language, native, roman] of [
  ['Hindi', 'मुझे मरना है', 'mujhe marna hai'],
  ['Punjabi', 'ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ', 'main marna chahunda han'],
  ['Mandarin', '我想死', 'wo xiang si'],
  ['Russian', 'я хочу умереть', 'ya hochu umeret'],
]) {
  const describe = (text) => {
    const r = baselineRiskScreen.assess(text);
    if (r.unreadable) return 'Not read, and says so';
    if (r.level === 'high') return 'Session ends, helplines shown';
    if (r.level === 'none') return '**Nothing found** — stated confidently';
    return 'Flag raised';
  };
  w(`| ${language}: "${native}" / "${roman}" | ${describe(native)} | ${describe(roman)} |`);
}
w();
w('Hindi is the row that is not a problem, and it shows what closing the gap');
w('costs: it is graded both ways because somebody wrote out the Hinglish');
w('spellings by hand. Every other row needs the same work, per language, and a');
w('missed spelling is a missed disclosure. That is the argument for the');
w('classifier being multilingual from the start rather than English translated');
w('— and it is a clinical question as much as an engineering one, because');
w('somebody has to judge whether a phrase in a language they do not speak');
w('means what the list says it means.');
w();
w('## The phrases, in full');
w();
w('Matched as substrings of the answer after lowercasing, straightening curly');
w('apostrophes, and removing punctuation. So "KILL MYSELF." and "...kill');
w('myself..." both match `kill myself`.');
w();

const total = BASELINE_RULES.reduce((n, r) => n + r.phrases.length, 0);
w(`There are ${String(total)} phrases in ${String(BASELINE_RULES.length)} rules.`);
w();

for (const level of LEVELS) {
  const rules = BASELINE_RULES.filter((r) => r.level === level);
  if (rules.length === 0) continue;

  w(`### Graded ${level}`);
  w();
  w(WHAT_HAPPENS[level]);
  w();
  for (const rule of rules) {
    w(`**${CATEGORY[rule.category] ?? rule.category}** — ${String(rule.phrases.length)} phrases`);
    w();
    for (const phrase of rule.phrases) w(`- \`${phrase}\``);
    w();
  }
}

w('## Worked examples');
w();
w('What the screen actually returns, run against it while generating this.');
w();
w('| What was typed | Grade | What happens |');
w('| --- | --- | --- |');
for (const said of [
  'My manager called out my mistake in front of the whole team',
  'I felt ashamed and rejected',
  'Sometimes I think everyone would be better off without me',
  'I want to die',
  'I can’t go on like this',
  'I feel like a burden to everyone',
  'I stopped my meds last week',
  'he hit me when I was small',
  'a film about someone who wanted to die',
  'मुझे मरना है',
  'ab jeene ka mann nahi karta',
  'je veux mourir',
  'je n’en peux plus',
  'je suis fatigué de vivre',
  'quiero morirme',
  'আমি মরতে চাই',
]) {
  const r = baselineRiskScreen.assess(said);
  const outcome = r.unreadable
    ? 'Not read — the screen has no phrases for this script. Counted, not flagged.'
    : r.level === 'high'
      ? 'Session ends, helplines shown, flag raised'
      : r.level === 'none'
        ? 'Nothing'
        : 'Flag raised, session continues';
  w(
    `| ${said.replace(/\|/g, '\\|')} | ${r.level}${r.unreadable ? ' (unreadable)' : ''} | ${outcome} |`,
  );
}
w();
w('The last rows are the point of the previous section. The Hinglish and');
w('French ones are graded. The Bengali one is not read at all and says so. The');
w('Spanish one — "quiero morirme", "I want to kill myself" — is the gap that');
w('does not announce itself: read cleanly, matched against nothing, and');
w('returned as though there were nothing there.');
w();
w('## Questions we need answered');
w();
QUESTIONS.forEach(([first, ...rest], i) => {
  w(`${String(i + 1)}. ${first}`);
  for (const line of rest) w(`   ${line}`);
});
w();
w('## What we will do with the answers');
w();
w('Your corrections go into the phrase list and the grading, and your sign-off');
w('or your refusal is recorded in the repository alongside this document. If the');
w('answer is that this should not ship in this form, that is an answer we will');
w('act on.');
w();
w('Nothing in the product currently claims clinical review. It will not until');
w('there is one.');
w();

const out = fileURLToPath(new URL('RISK-SCREEN-REVIEW.md', import.meta.url));

// Through Prettier, with this repository's own config — the lesson
// `parity/generate.mjs` already carries, which this generator never had.
//
// `RISK-SCREEN-REVIEW.md` is a checked-in file and `pnpm run check` runs
// `format:check` over it, so a regeneration whose output Prettier would rewrite
// leaves the tree failing that gate. It had passed up to now by luck rather
// than by design: nothing this file wrote happened to exceed the print width,
// and then a table of the same sentence in two scripts did, and regenerating
// turned `check` red in a file nobody had edited by hand.
//
// `resolveConfig` matters as much as `format` does. Given only a `filepath`,
// Prettier uses its own defaults, whose `printWidth` is 80 against this
// repository's 100 — so formatting without the config would rewrite the whole
// document to a width the gate does not want.
const options = (await resolveConfig(out)) ?? {};
writeFileSync(out, await format(lines.join('\n'), { ...options, filepath: out }));
console.log(`wrote ${String(total)} phrases and ${String(BASELINE_RULES.length)} rules to ${out}`);
