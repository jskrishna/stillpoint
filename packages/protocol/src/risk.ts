/**
 * Screening what a user says for signs they may be in danger.
 *
 * ## What this is, and what it is not
 *
 * This is a **backstop, not the detector.** It is a small, deliberately
 * over-eager phrase screen that runs on every utterance so that the obvious
 * cases can never be missed while a real classifier is chosen and reviewed.
 *
 * It will miss things. It cannot read tone, context, metaphor, irony, code
 * switching, or any of the ways people actually say that they are not safe. It
 * knows English phrasings only. **No one should ship this as the only screen,
 * and no clinical claim should rest on it.** A real deployment needs a trained
 * model and sign-off from someone qualified to judge it.
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
    ],
  },
  {
    level: 'medium',
    category: 'trauma',
    phrases: ['abused me', 'he hit me', 'she hit me', 'they hit me', 'assaulted me'],
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
 */
function normalise(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
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
