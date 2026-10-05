/**
 * Screening what a user says for signs they may be in danger.
 *
 * ## What this is, and what it is not
 *
 * This is a **backstop, not the detector.** It is a small, deliberately
 * over-eager phrase screen that runs on every utterance so that the obvious
 * cases can never be missed while a real classifier is chosen and reviewed.
 *
 * It will miss things. It cannot read tone, context, metaphor or irony, or any
 * of the ways people actually say that they are not safe. **No one should ship
 * this as the only screen, and no clinical claim should rest on it.** A real
 * deployment needs a trained model and sign-off from someone qualified to
 * judge it.
 *
 * ## It used to be blind to half the country
 *
 * The product is India-first, and this screen knew English phrasings only —
 * which was written down as a limitation and was worse than it sounded.
 * `normalise()` dropped every character outside `[a-z' ]`, so an utterance in
 * Devanagari did not merely go unmatched: it became an empty string and
 * returned `none` before any rule ran. Somebody typing "मुझे मरना है" got
 * nothing at all.
 *
 * So the normaliser keeps Devanagari now, and there are Hinglish and Hindi
 * phrases below, graded by the same rule as the English ones: only a statement
 * of intent or of an act is `high`.
 *
 * **This is still thin, and the thinness is the point to take away.** Matching
 * literal substrings in Devanagari is brittle — "हूँ" and "हूं" are the same
 * word and different strings — and Hinglish has no settled spelling, so
 * "khudkushi" and "khudkhushi" are both common. India has many more languages
 * than two. What this buys is that the most unambiguous phrasings are no
 * longer invisible; it does not make the screen adequate, and if anything it
 * shows why the classifier has to be multilingual rather than translated.
 *
 * Given that, it is tuned for recall over precision: a false flag costs a
 * reviewer a minute, and a missed one costs something that cannot be undone.
 * Where a phrase is ambiguous it is graded *up*, not down.
 */

import type { SafetyCategory, SafetyLevel } from './safety.js';

/** What a screen concluded about one utterance. */
export interface RiskAssessment {
  readonly level: SafetyLevel;
  /** Absent when the level is `none`. */
  readonly category?: SafetyCategory;
  /** The phrase that triggered it, for the flag a reviewer reads. */
  readonly matched?: string;
  /**
   * True when part of the utterance was in a script this screen cannot read.
   *
   * A `none` beside `unreadable: true` means **not read**, rather than read
   * and clear. Those were the same answer until now, and it is the more
   * dangerous of the two to leave unsaid: the screen reported `none` with full
   * confidence about text it had deleted.
   *
   * Deliberately not a risk level. Grading an unreadable utterance up would
   * invent a signal out of an absence of evidence, and flagging every one of
   * them would drown the queue and make the product unusable for whole
   * languages. It is an admission, recorded so that somebody can see how often
   * it happens and decide which language to cover next.
   *
   * A `high` match still stops the session, and can carry `unreadable: true`
   * beside it: the screen read enough of that utterance to be sure, and not
   * all of it.
   *
   * It describes the text, so `false` is the right answer wherever no
   * utterance was screened at all — a refused turn is not evidence about any
   * language.
   */
  readonly unreadable: boolean;
}

/**
 * Scripts the screen has phrases for.
 *
 * Latin covers English and Hinglish; Devanagari covers Hindi and Marathi's
 * spelling of these words. Everything else — Bengali, Tamil, Telugu, Gujarati,
 * Kannada, Malayalam, Odia, Gurmukhi, the Perso-Arabic of Urdu — it cannot
 * read at all, and this is the list that says so out loud instead of leaving
 * it to be inferred from the phrase tables.
 *
 * Adding a script here without adding phrases for it would be the wrong fix:
 * it would make `unreadable` say no about text that still nobody reads.
 *
 * See `SCRIPTLESS` for why this is safe to compare with the server's
 * `\p{Latin}`, which is not always the same property.
 */
const READABLE_SCRIPTS = /[\p{Script=Latin}\p{Script=Devanagari}]+/gu;

/**
 * Characters that belong to no one script, taken out before a script is asked
 * about.
 *
 * **A script's name does not mean one thing in PHP.** `\p{Latin}` is matched
 * by PCRE2, and from 10.40 that library matches a script's name against
 * Script_Extensions where before it matched Script. Which one a server has is
 * a fact about how its PHP was built. So the same line of
 * `App\Domain\PhraseRiskScreen` called an English sentence typed with U+02BC
 * readable on one machine and unreadable on another. That character is the
 * modifier apostrophe some keyboards type for an ordinary one: Common script,
 * used with Latin, which is exactly the difference between the two
 * properties.
 *
 * It was found twice. First on a Mac, where PHP said readable and this file,
 * which said `Script=`, said not; this side was changed to match. Then in CI,
 * where the same PHP source said unreadable, and the fixture generated on the
 * Mac went red. Matching one engine was never the fix. The fix is that the
 * answer must not depend on the engine, so every character the two
 * properties disagree about is removed before either is consulted: the
 * modifier letters (U+02B0 to U+02FF), the Vedic signs (U+0951, U+0952 and
 * U+1CD0 to U+1CFF), one combining mark (U+20F0) and the North Indic number
 * forms (U+A830 to U+A839). Compared over every code point, with those gone
 * the two properties agree for Latin and for Devanagari.
 *
 * None of them is evidence of a language, which is what `unreadable` is about,
 * and in the text that is matched they become spaces, as any other mark does.
 * `PhraseRiskScreen::SCRIPTLESS` is the same class.
 */
const SCRIPTLESS = /[\u02b0-\u02ff]|[\u0951\u0952]|[\u1cd0-\u1cff]|\u20f0|[\ua830-\ua839]/gu;

/**
 * Whether every letter in the utterance is in a script the screen can read.
 *
 * Any single unreadable letter is enough to answer no. There is no threshold,
 * on purpose: a threshold would be a guess about how much of a sentence has to
 * be missed before it matters, and this answer costs nothing when it is
 * over-eager — it does not flag anyone and it does not change what the user
 * sees. It only stops the screen claiming to have read something it did not.
 *
 * Combining marks are not `\p{Letter}`, so a Devanagari matra never counts as
 * an unreadable letter in its own right.
 */
function readsEverything(utterance: string): boolean {
  const letters = utterance.replace(SCRIPTLESS, '').replace(/[^\p{Letter}]+/gu, '');

  return letters.replace(READABLE_SCRIPTS, '') === '';
}

/**
 * Anything that can screen an utterance. Swap in a real model here.
 *
 * The enforcement is the server's — `App\Domain\RiskScreen` — and that is
 * where the decision about a classifier that cannot answer is written down. In
 * one line: falling back to the phrase screen is the only one of the three
 * available answers that is not worse than the problem.
 */
export interface RiskScreen {
  assess(utterance: string): RiskAssessment;
}

export interface Rule {
  readonly level: Exclude<SafetyLevel, 'none'>;
  readonly category: SafetyCategory;
  readonly phrases: readonly string[];
}

/**
 * Phrase rules, grouped by what they indicate.
 *
 * Phrases are matched as substrings of a normalised utterance, so they must be
 * distinctive enough that ordinary speech does not trip them — but when in
 * doubt, a trip is the safer error.
 */
/**
 * Exported so `docs/clinical-review/generate.mjs` can build the review pack a
 * clinician reads from the rules themselves, rather than from a copy of them
 * that drifts. A clinician signing off on a list the code no longer matches
 * would be worse than no sign-off at all.
 *
 * Exporting these discloses nothing: `baselineRiskScreen` is already in the
 * browser bundle as the instant-feedback copy, so the phrases have always
 * shipped to clients. The enforcement is the server's, and the server does not
 * read this list from a client.
 */
export const BASELINE_RULES: readonly Rule[] = [
  {
    level: 'high',
    category: 'self_harm',
    phrases: [
      'better off without me',
      'better off if i was gone',
      'kill myself',
      'killing myself',
      'end my life',
      'ending my life',
      'take my own life',
      'want to die',
      'wish i was dead',
      'wish i were dead',
      'no reason to live',
      'nothing to live for',
      'not want to be here',
      "don't want to be here",
      'do not want to be here',
      'hurt myself',
      'harm myself',
      'cut myself',
      'suicide',
      'suicidal',
      // Past tense, because people say it that way: "I wanted to die". This
      // also trips on reported speech ("a film about someone who wanted to
      // die"), which is the error this screen is meant to make.
      'wanted to die',
      'wanted to kill myself',
      'tried to kill myself',
      'tried to end my life',

      // Hinglish, in the Roman script most people actually type on a phone.
      // Spelling is unsettled, so the common variants are all listed — a
      // missed spelling is a missed disclosure.
      'khudkushi',
      'khudkhushi',
      'khud kushi',
      'atmahatya',
      'aatmahatya',
      'mujhe marna hai',
      'mujhe mar jana hai',
      'marna chahta hu',
      'marna chahti hu',
      'marna chahta hoon',
      'marna chahti hoon',
      'jaan de dunga',
      'jaan de dungi',
      'jaan dene ka',
      'nas kaat',
      'khud ko khatam',

      // The same, in Devanagari.
      'खुदकुशी',
      'आत्महत्या',
      'मुझे मरना है',
      'मरना चाहता',
      'मरना चाहती',
      'जान दे दूंगा',
      'जान दे दूँगा',
      'जान दे दूंगी',
      'जान दे दूँगी',
      'जान देने का',
      'नस काट',
      'खुद को खत्म',

      // French. Canada is the first market and French is one of its two
      // official languages — and French is Latin script, so before this the
      // screen graded "je veux mourir" as `none` with `unreadable: false`: a
      // confident clean answer about a plain statement of intent. That is the
      // worst shape this screen can fail in.
      //
      // Written without accents because `normalise()` folds them, which also
      // means somebody typing on a keyboard without them still matches.
      'je veux mourir',
      'je veux me tuer',
      'je vais me tuer',
      'me suicider',
      'je veux en finir',
      'en finir avec la vie',
      'mettre fin a mes jours',
      'me faire du mal',
      'mieux sans moi',
    ],
  },
  {
    // Hopelessness and perceived burdensomeness: among the best-attested
    // warning signs, and nothing like a statement of intent. Medium flags them
    // for a reviewer without ending a session, which is the right trade — an
    // upset person saying "I can't go on" is having an ordinary bad day often
    // enough that stopping on it would make the product unusable.
    level: 'medium',
    category: 'self_harm',
    phrases: [
      'feel like a burden',
      'burden to everyone',
      'burden to my family',
      'burden on everyone',
      "can't go on",
      'cannot go on',
      "can't keep going",
      'tired of living',
      "don't want to live",
      'do not want to live',
      'no point in living',
      "better off if i wasn't here",
      'better off if i was not here',

      // Hinglish. Graded the same as their English counterparts rather than
      // up: "jeene ka mann nahi" is "I don't want to live", which is medium
      // above, and an upset person says it on an ordinary bad day.
      'jeene ka mann nahi',
      'jeena nahi chahta',
      'jeena nahi chahti',
      'jeene ki iccha nahi',
      'sabke liye bojh',
      'sab ke liye bojh',
      'bojh ban gaya hu',
      'bojh ban gayi hu',
      'bojh hu sabpe',
      'jeene se thak',
      'thak gaya hu jeene',
      'thak gayi hu jeene',

      // The same, in Devanagari.
      'जीने का मन नहीं',
      'जीना नहीं चाहता',
      'जीना नहीं चाहती',
      'जीने की इच्छा नहीं',
      'सबके लिए बोझ',
      'बोझ बन गया',
      'बोझ बन गई',
      'जीने से थक',

      // French, graded the same as their English counterparts rather than up.
      // "je n'en peux plus" is "I can't take any more", which is the sentence
      // the ceiling rule exists for: flagged, not stopped on.
      "je n'en peux plus",
      'je ne peux plus continuer',
      'fatigue de vivre',
      // "I don't want to live (any more)" maps to the English `don't want to
      // live`, which is medium. Only intent or an act is high, and wanting not
      // to live is not the same sentence as meaning to end it — that is the
      // whole ceiling rule, and it has to hold in French too or the French
      // half of the screen stops sessions the English half would not.
      'je ne veux pas vivre',
      'je ne veux plus vivre',
      'plus envie de vivre',
      "je n'ai plus d'espoir",
      "plus rien n'a de sens",
      'je suis un fardeau',
      'un poids pour tout le monde',
    ],
  },
  {
    level: 'low',
    category: 'self_harm',
    phrases: [
      'nothing matters any more',
      'nothing matters anymore',
      "what's the point any more",
      "what's the point anymore",

      // French. "a quoi bon" is broad — it is also how somebody gives up on a
      // spreadsheet — and `low` is the level for a signal worth a reviewer's
      // glance and nothing more, which is where a phrase this broad belongs.
      'a quoi bon',
      'plus rien ne compte',
    ],
  },
  {
    level: 'high',
    category: 'harm_to_others',
    phrases: ['kill him', 'kill her', 'kill them', 'want to hurt someone'],
  },
  {
    level: 'medium',
    category: 'harm_to_others',
    phrases: ['could hurt him', 'could hurt her', 'could hurt them', 'want to hit'],
  },
  {
    level: 'medium',
    category: 'medical',
    phrases: [
      'stopped my meds',
      'stopped taking my meds',
      'stopped my medication',
      'stopped taking my medication',
      'off my meds',
      // Disordered eating, stated as a thing the person is doing to themselves.
      "haven't eaten in",
      'have not eaten in',
      'stopped eating',
      'starve myself',
      'starving myself',
      'make myself sick',
      'making myself sick',
      // Drinking or using to blunt feeling, which is what a session is for.
      'drank a whole bottle',
      'drinking every day',
      'drink to forget',
      'relapsed',
    ],
  },
  {
    level: 'medium',
    category: 'trauma',
    phrases: [
      'abused me',
      'he hit me',
      'she hit me',
      'they hit me',
      'hits me',
      'beats me',
      'assaulted me',
      'raped me',
      'molested me',
      // Threats and fear of a specific person: a disclosure, not a feeling.
      'threatens me',
      'threatened me',
      'threatens to kill',
      'threatened to kill',
      'forced me',
      'afraid of him',
      'afraid of her',
      'scared of him',
      'scared of her',
    ],
  },
  {
    level: 'low',
    category: 'medical',
    phrases: ['not sleeping at all', "can't stop drinking", 'cannot stop drinking'],
  },
];

const SEVERITY: Readonly<Record<Exclude<SafetyLevel, 'none'>, number>> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Normalises an utterance for matching.
 *
 * Curly apostrophes become straight so "don't" and "don’t" match the same rule,
 * and runs of whitespace and punctuation collapse so line breaks from a
 * transcript do not hide a phrase.
 *
 * Devanagari is kept. It used to be stripped along with everything else outside
 * `[a-z' ]`, which turned a sentence written in Hindi into an empty string and
 * graded it `none` without a rule ever running. Lower-casing is a no-op for the
 * script, and its own punctuation — the danda and the double danda — is removed
 * with the rest.
 */
function normalise(utterance: string): string {
  return (
    utterance
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      // Latin diacritics folded, so "fatigué" matches `fatigue` and so does
      // "fatigue" typed without the accent. It is both halves of one problem:
      // the filter below keeps `a-z` and nothing else, so every accent used to
      // become a space — "je suis fatigué" normalised to "je suis fatigu" —
      // while `readsEverything()` reported the text as perfectly readable
      // because é is Latin script. The two disagreed about what reading means,
      // and French is an official language of the first market.
      //
      // Decompose, drop the Latin combining marks, recompose. The range is the
      // Combining Diacritical Marks block, which is Latin and Greek: a
      // Devanagari vowel sign is U+0900-U+097F and is untouched, and the
      // recompose puts back the few Devanagari characters that decompose at
      // all (क़ and its kin). `App\Domain\PhraseRiskScreen` does the same
      // three steps with the same range.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]+/gu, '')
      .normalize('NFC')
      // Danda, double danda, and the zero-width joiners that a mobile keyboard
      // leaves inside a conjunct.
      .replace(/[\u0964\u0965\u200c\u200d]/gu, ' ')
      // Before the script is asked about, for the reason `SCRIPTLESS` gives:
      // whether these count as Devanagari depends on the regex engine.
      .replace(SCRIPTLESS, ' ')
      // The script's own property rather than the code-point range: it says
      // what it means, it covers the extended block as well, and a
      // hand-written range that includes combining marks is the thing
      // `no-misleading-character-class` is right to object to.
      .replace(/[^a-z'\p{Script=Devanagari} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * What a keyboard types where an apostrophe goes.
 *
 * The curly pair and the backtick, which the strict reading already folds,
 * and the ones it does not: the reversed quotation mark, the acute accent, the
 * modifier apostrophe and the okina, the prime, and the fullwidth apostrophe.
 */
const APOSTROPHE_LIKE = /[\u2018\u2019\u201b`\u00b4\u02bc\u02bb\u2032\uff07]/g;

/**
 * Characters with no width, which sit inside a word and split it in two for a
 * substring match: the zero-width space and the two joiners, the word joiner,
 * the byte-order mark and the soft hyphen.
 */
// An alternation and not a character class: a joiner between two other
// characters in a class is what `no-misleading-character-class` objects to,
// and it would be right about most classes that looked like this one.
const INVISIBLE = /\u200b|\u200c|\u200d|\u2060|\ufeff|\u00ad/g;

/** A listed phrase as the forgiving reading spells it. */
const withoutApostrophes = (phrase: string): string => phrase.replace(/'/g, '');

/**
 * A second, more forgiving reading of the same utterance.
 *
 * `normalise()` reads text as it was typed, and four ordinary things a phone
 * does made a listed phrase unrecognisable to it. Measured over the rules
 * themselves, before this existed:
 *
 * - **An apostrophe left out.** "dont", "cant", "jai". All twelve phrases that
 *   contain one came back `none` without it, and one of the twelve is `high`:
 *   a statement the screen stops a session for, typed the way a great many
 *   people type, did not stop it. An apostrophe typed as some other character
 *   (U+02BC, an acute accent, a prime) did the same, because everything that
 *   is not a letter becomes a space and "don t" is not "don't".
 * - **A joiner inside a conjunct.** `normalise()` turns U+200C and U+200D into
 *   a space, which is harmless between two words and cuts one word in half.
 *   All three Devanagari phrases with a conjunct came back `none` with a
 *   joiner inside it, two of them `high`.
 * - **A zero-width space or a soft hyphen inside a word**, which is what
 *   copying out of a web page leaves: 131 of 155 phrases came back `none`.
 * - **Fullwidth letters**, which an East Asian keyboard types in its wide
 *   mode: all 135 Latin phrases came back `none` with `unreadable: false`,
 *   since a fullwidth letter is Latin script. A confident clean answer about
 *   text nobody had read, which is what French got before the accents were
 *   folded.
 *
 * So this reading drops what the strict one keeps: apostrophes go, invisible
 * characters go, and the fold is the compatibility one (NFKD), which turns a
 * fullwidth letter, a ligature or a styled alphabet into the plain letter it
 * stands for. Lower-casing comes after the fold because a styled capital has
 * no lower case of its own until it has been folded to a plain one.
 *
 * **It is a second reading and not a changed rule, and that is the point.**
 * `assess()` takes the strict reading first and this one after it, and a match
 * in either counts, so nothing that matched before can stop matching. Deleting
 * a joiner is right inside a word and wrong where it is the only thing between
 * two words, and one rule could be right about only one of those.
 *
 * It adds no phrase and no language. `App\Domain\PhraseRiskScreen` has the
 * same reading in the same order, and the parity fixture covers it.
 */
function normaliseForgivingly(utterance: string): string {
  return utterance
    .replace(APOSTROPHE_LIKE, "'")
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]+/gu, '')
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/'/g, '')
    .replace(/[\u0964\u0965]/gu, ' ')
    .replace(SCRIPTLESS, ' ')
    .replace(/[^a-z\p{Script=Devanagari} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The baseline screen.
 *
 * Reports the single most severe match, so an utterance that trips both a
 * medium and a high rule is treated as high.
 */
export const baselineRiskScreen: RiskScreen = {
  assess(utterance: string): RiskAssessment {
    // Computed from the utterance as it was said, not from the normalised
    // text: normalising is what throws the unreadable scripts away, so by then
    // the evidence is gone. That was the whole bug.
    const unreadable = !readsEverything(utterance);

    // Two readings, strict first. A later match replaces an earlier one only
    // when it is more severe, so whatever the strict reading found is still
    // what is reported, and the forgiving one can only add to it.
    const readings = [
      { text: normalise(utterance), spelt: (phrase: string) => phrase },
      { text: normaliseForgivingly(utterance), spelt: withoutApostrophes },
    ];

    let best:
      | { level: Exclude<SafetyLevel, 'none'>; category: SafetyCategory; matched: string }
      | undefined;

    for (const { text, spelt } of readings) {
      if (text === '') continue;

      for (const rule of BASELINE_RULES) {
        for (const phrase of rule.phrases) {
          if (!text.includes(spelt(phrase))) continue;
          if (best === undefined || SEVERITY[rule.level] > SEVERITY[best.level]) {
            // The phrase as it is listed, whichever reading found it: that is
            // what a reviewer is shown.
            best = { level: rule.level, category: rule.category, matched: phrase };
          }
        }
      }
    }

    return best === undefined
      ? { level: 'none', unreadable }
      : { level: best.level, category: best.category, matched: best.matched, unreadable };
  },
};

/**
 * A screen that finds nothing, for tests that are not about safety.
 *
 * `unreadable: false` is not a claim that it read anything — it reads nothing
 * at all. The field is about the text, and this screen has no opinion on it.
 */
export const noRiskScreen: RiskScreen = {
  assess: () => ({ level: 'none', unreadable: false }),
};
