/**
 * The guide this surface runs with, until a model exists.
 *
 * `scriptedGuide` decides what to say and when a step is done, but extracts
 * nothing — interpretation is deliberately not its job. A real guide will read
 * the answer and pull out what happened, the memory and the belief. Until then
 * this wrapper attaches the obvious mapping: whatever the user typed at a step
 * is what that step was asking for.
 *
 * It is a stand-in and reads nothing. Replace the whole thing when a model
 * lands; the session never sees the difference, which is the point of the seam.
 */

import {
  forgivenessFor,
  scriptedGuide,
  type Extraction,
  type Guide,
  type StepId,
} from '@stillpoint/protocol';

/** What a step's answer is taken to mean, with no interpretation at all. */
function literalExtraction(stepId: StepId, utterance: string): Extraction | undefined {
  const text = utterance.trim();
  if (text === '') return undefined;

  switch (stepId) {
    case 'notice':
      return { whatHappened: text, title: text.slice(0, 60) };
    case 'remember':
      return { memory: { description: text } };
    case 'inquire': {
      const forgiveness = forgivenessFor(text);
      return forgiveness === undefined ? { belief: text } : { belief: text, forgiveness };
    }
    default:
      return undefined;
  }
}

/** Wraps a guide so that an advancing turn also records the literal answer. */
export function withLiteralCapture(base: Guide): Guide {
  return {
    respond(context) {
      const reply = base.respond(context);
      const stepId = context.session.stepId;
      if (!reply.advance || stepId === null) return reply;

      const capture = reply.capture ?? literalExtraction(stepId, context.utterance);
      return capture === undefined ? reply : { ...reply, capture };
    },
  };
}

/** The guide the web session runs with today. */
export const webGuide: Guide = withLiteralCapture(scriptedGuide);
