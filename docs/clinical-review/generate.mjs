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
import {
  BASELINE_RULES,
  COUNTRIES,
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
w('Four answers, in [Questions](#questions-we-need-answered) at the end. You do');
w('not need to read any code: everything the screen does is in this document.');
w();
w('## What the product is');
w();
w('Stillpoint is a guide that walks an adult through six steps when they are');
w('upset: Notice → Responsibility → Feel → Remember → Inquire → Forgive. It is');
w('not therapy and does not present itself as therapy. The person types their');
w('answers; the guide speaks its questions aloud and asks nothing else of them.');
w('The product is India-first.');
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
w('plausible-looking number from somewhere else. Canada is the first market and');
w('is what a new account is assumed to be in; India is covered as well.');
w();
w('The person is **never** told which rule they tripped, the grade, or the');
w('phrase that matched. A medium or low flag is invisible to them.');
w();
w('### Where a flag goes');
w();
w('To a queue only an administrator can open — not a coach. A flag holds the');
w('grade, the category, when it was raised, and **the sentence the person');
w('typed**. That sentence is the most sensitive thing the product stores. It is');
w('encrypted at rest.');
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
w('1. **Is this list acceptable as an interim backstop** while a trained model');
w('   is built — and if not, what should be removed or added? We would rather be');
w('   told it is inadequate than ship it believing otherwise.');
w('2. **Is the grading boundary right?** Specifically: should hopelessness and');
w('   burdensomeness ever end a session, when ending it means the person cannot');
w('   continue and is shown helplines?');
w('3. **Is the pause screen clinically appropriate** — what it says, and showing');
w('   the numbers listed above, and showing a national line and a provincial');
w('   one (988 and Québec’s 1-866-APPELLE) on the same screen?');
w('4. **Should a safety flag outlive the person deleting their account?**');
w('   Today it is deleted with everything else, because that is what erasure');
w('   means. Which also means that if somebody said they were in danger and then');
w('   deleted their account, no reviewer can follow it up. If a flag should');
w('   survive, in what form and for how long?');
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
writeFileSync(out, `${lines.join('\n')}`);
console.log(`wrote ${String(total)} phrases and ${String(BASELINE_RULES.length)} rules to ${out}`);
