/**
 * The guide: whoever decides what to say next and whether a step is done.
 *
 * In the product this is a language model. Here it is an interface, so the
 * session can run a real turn loop before that model exists and the model can
 * be swapped in without the session knowing. Everything a guide may do is in
 * {@link GuideReply}; it cannot reach into the session itself.
 *
 * {@link scriptedGuide} is a deterministic stand-in that follows the protocol's
 * own prompts and backups. It is good enough to exercise the loop and to test
 * against. It understands nothing.
 */

import type { FeelingId } from './feelings.js';
import type { Memory, Session, SessionData } from './session.js';
import type { ProtocolVersion } from './version.js';
import { stepIn } from './version.js';

/** What the guide extracted from an answer, if anything. */
export interface Extraction {
  readonly whatHappened?: string;
  readonly feelings?: readonly FeelingId[];
  readonly memory?: Memory;
  readonly belief?: string;
  readonly forgiveness?: string;
  readonly title?: string;
}

/** What the guide does with one turn. */
export interface GuideReply {
  /** What the guide says next. */
  readonly say: string;
  /** Whether the step is satisfied and the session should move on. */
  readonly advance: boolean;
  /** What to record, when the guide got something out of the answer. */
  readonly capture?: Extraction;
}

/** The context a guide is given. It is read-only on all of it. */
export interface GuideContext {
  readonly session: Session;
  readonly version: ProtocolVersion;
  /** What the user just said. Empty when the step is being opened. */
  readonly utterance: string;
}

export interface Guide {
  respond(context: GuideContext): GuideReply;
}

/** Whether an answer is substantial enough to be worth treating as one. */
function isSubstantive(utterance: string): boolean {
  return utterance.trim().split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * A deterministic guide that reads the protocol and nothing else.
 *
 * It opens with the step's main question, falls back through the backups when
 * an answer is too thin, and gives up on a step once the version's turn limit
 * is reached rather than pressing someone who cannot answer. It does not
 * interpret anything: extraction is left to the caller, which is exactly the
 * seam a real model slots into.
 */
export const scriptedGuide: Guide = {
  respond({ session, version, utterance }: GuideContext): GuideReply {
    const stepId = session.stepId;
    if (stepId === null) return { say: '', advance: false };

    const step = stepIn(version, stepId);
    const used = session.guideTurnsUsed;

    // Opening the step: ask the main question, say nothing about the answer.
    if (utterance.trim() === '') {
      return { say: step.prompts.main ?? '', advance: false };
    }

    if (isSubstantive(utterance)) {
      return { say: '', advance: true };
    }

    // Too thin to move on. Offer the next backup, if the step has one left.
    const backup = step.prompts.backups[used];
    if (backup !== undefined) {
      return { say: backup, advance: false };
    }

    // Out of backups, or out of turns. Moving on beats pressing someone who is
    // upset and cannot answer: the protocol's own limit says when to stop.
    const limit = step.maxGuideTurns;
    if (limit !== null && used + 1 >= limit) {
      return { say: '', advance: true };
    }

    return { say: step.prompts.main ?? '', advance: false };
  },
};

/** Narrows an extraction to the fields a session actually stores. */
export function toCapture(
  extraction: Extraction | undefined,
): (Partial<Omit<SessionData, 'feelings'>> & { feelings?: readonly string[] }) | undefined {
  if (extraction === undefined) return undefined;

  const { whatHappened, feelings, memory, belief, forgiveness, title } = extraction;
  return {
    ...(whatHappened === undefined ? {} : { whatHappened }),
    ...(feelings === undefined ? {} : { feelings }),
    ...(memory === undefined ? {} : { memory }),
    ...(belief === undefined ? {} : { belief }),
    ...(forgiveness === undefined ? {} : { forgiveness }),
    ...(title === undefined ? {} : { title }),
  };
}
