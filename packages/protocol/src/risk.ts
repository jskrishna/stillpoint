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
}

/** Anything that can screen an utterance. Swap in a real model here. */
export interface RiskScreen {
  assess(utterance: string): RiskAssessment;
}

interface Rule {
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
const RULES: readonly Rule[] = [
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
      // Danda, double danda, and the zero-width joiners that a mobile keyboard
      // leaves inside a conjunct.
      .replace(/[\u0964\u0965\u200c\u200d]/gu, ' ')
      // `\p{Script=Devanagari}` rather than the code-point range: it says what
      // it means, it covers the extended block as well, and a hand-written
      // range that includes combining marks is the thing
      // `no-misleading-character-class` is right to object to.
      .replace(/[^a-z'\p{Script=Devanagari} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * The baseline screen.
 *
 * Reports the single most severe match, so an utterance that trips both a
 * medium and a high rule is treated as high.
 */
export const baselineRiskScreen: RiskScreen = {
  assess(utterance: string): RiskAssessment {
    const text = normalise(utterance);
    if (text === '') return { level: 'none' };

    let best:
      | { level: Exclude<SafetyLevel, 'none'>; category: SafetyCategory; matched: string }
      | undefined;

    for (const rule of RULES) {
      for (const phrase of rule.phrases) {
        if (!text.includes(phrase)) continue;
        if (best === undefined || SEVERITY[rule.level] > SEVERITY[best.level]) {
          best = { level: rule.level, category: rule.category, matched: phrase };
        }
      }
    }

    return best === undefined
      ? { level: 'none' }
      : { level: best.level, category: best.category, matched: best.matched };
  },
};

/** A screen that finds nothing, for tests that are not about safety. */
export const noRiskScreen: RiskScreen = {
  assess: () => ({ level: 'none' }),
};
