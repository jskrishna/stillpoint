/**
 * What an answer is taken to mean, until a model exists.
 *
 * A real guide reads the answer and pulls out what happened, the memory and
 * the belief. This does nothing of the kind: it attaches the obvious mapping —
 * whatever the user said at a step is what that step was asking for — so the
 * loop can be run and tested before that model lands.
 *
 * It is a stand-in and it reads nothing. It is in the domain rather than in a
 * surface because the server runs it too, and a rule that exists twice is a
 * rule that will disagree with itself.
 */

import { MAX_FEELINGS, isFeelingId, type FeelingId } from './feelings.js';
import type { Extraction } from './guide.js';
import { forgivenessFor } from './session.js';
import { answerKindOf, type StepId } from './steps.js';
import { firstCharacters } from './utterance.js';

/**
 * The feeling ids in an answer to step 3, in the order they were given.
 *
 * **Capped at {@link MAX_FEELINGS}, which is the rule and was only the
 * screen's.** The designs give step 3 a grid of twelve and "Choose up to 3";
 * `toggleFeeling` refuses the fourth tap, and `FeelingId::MAX_CHOICES` existed
 * on the PHP side and was used by nothing. So a turn naming all twelve
 * recorded all twelve: the journal's "What you felt" listed twelve, and
 * insights counted twelve for one session — which makes "Feelings you chose
 * most" a ranking of twelve things at one apiece, a ranking of nothing.
 *
 * No shipped client can reach it, because both grids cap the selection. That
 * is the point: a rule only the client keeps is one the next client does not,
 * and this is the same reason the risk screen's browser copy is a convenience
 * and the server is the enforcement.
 *
 * The first three in the order given, not a refusal. At this step the answer
 * is a selection rather than prose, and dropping the fourth is exactly what
 * the screen does to the fourth tap — so the journal and the insights end up
 * agreeing with what the person was told they could choose.
 */
export function feelingsIn(utterance: string): readonly FeelingId[] {
  const seen = new Set<FeelingId>();
  for (const token of utterance.toLowerCase().split(/[^a-z]+/)) {
    if (isFeelingId(token)) seen.add(token);
    if (seen.size === MAX_FEELINGS) break;
  }
  return [...seen];
}

/**
 * Whether an answer is substantial enough to move the step on.
 *
 * Prose is judged by length, which is crude and is meant to be. A selection is
 * not judged at all: one feeling named is an answer, and counting its words
 * would stall step 3 for anyone who did not happen to pick exactly three.
 */
export function isSubstantiveAnswer(stepId: StepId, utterance: string): boolean {
  if (answerKindOf(stepId) === 'feelings') return feelingsIn(utterance).length > 0;
  return utterance.trim().split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * How much of the first answer becomes the journal's title.
 *
 * The designs show a short title ("Called out at work"); until the PRD says
 * how one is written, it is the opening of what the person said, cut to
 * something a list can show.
 */
const TITLE_LENGTH = 60;

/** What a step's answer is taken to mean, with no interpretation at all. */
export function literalExtraction(stepId: StepId, utterance: string): Extraction | undefined {
  const text = utterance.trim();
  if (text === '') return undefined;

  switch (stepId) {
    case 'notice':
      // Whole characters, and the same count PHP's `mb_substr` takes.
      // `slice` counts UTF-16 code units, so an answer with an emoji in it
      // produced a different title in each language — and a shorter one that
      // could end in half a character.
      return { whatHappened: text, title: firstCharacters(text, TITLE_LENGTH) };
    case 'feel': {
      const feelings = feelingsIn(text);
      return feelings.length === 0 ? undefined : { feelings };
    }
    case 'remember':
      return { memory: { description: text } };
    case 'inquire': {
      const forgiveness = forgivenessFor(text);
      return forgiveness === undefined ? { belief: text } : { belief: text, forgiveness };
    }
    default:
      // Steps 2 and 6 record nothing: the designs give them no field to fill,
      // and a guess would end up in the journal as if the user had said it.
      return undefined;
  }
}
