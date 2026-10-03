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

import { isFeelingId, type FeelingId } from './feelings.js';
import type { Extraction } from './guide.js';
import { forgivenessFor } from './session.js';
import { answerKindOf, type StepId } from './steps.js';

/** The feeling ids in an answer to step 3, in the order they were given. */
export function feelingsIn(utterance: string): readonly FeelingId[] {
  const seen = new Set<FeelingId>();
  for (const token of utterance.toLowerCase().split(/[^a-z]+/)) {
    if (isFeelingId(token)) seen.add(token);
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

/** What a step's answer is taken to mean, with no interpretation at all. */
export function literalExtraction(stepId: StepId, utterance: string): Extraction | undefined {
  const text = utterance.trim();
  if (text === '') return undefined;

  switch (stepId) {
    case 'notice':
      return { whatHappened: text, title: text.slice(0, 60) };
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
