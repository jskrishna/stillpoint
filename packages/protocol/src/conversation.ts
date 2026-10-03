/**
 * One turn of a session: what happens between a user speaking and the guide
 * answering.
 *
 * The order here is the point. **Safety is screened before the guide is ever
 * consulted**, and a high-risk utterance ends the session without the guide
 * replying at all. Putting the guide first would mean a model answering someone
 * who has just said they are not safe.
 */

import { apply, type Session } from './session.js';
import type { StepId } from './steps.js';
import { toCapture, type Guide, type GuideReply } from './guide.js';
import { mustFlag, mustStop, type SafetyCategory, type SafetyLevel } from './safety.js';
import type { RiskAssessment, RiskScreen } from './risk.js';
import type { ProtocolVersion } from './version.js';
import { recordable } from './utterance.js';

/** What one turn produced. */
export interface TurnResult {
  readonly session: Session;
  /** What the guide says back. Empty when safety stopped the turn. */
  readonly say: string;
  /** Whether the step moved on. */
  readonly advanced: boolean;
  readonly risk: RiskAssessment;
  /** True when the session ended because of what was just said. */
  readonly stopped: boolean;
  /**
   * True when the guide was not consulted because the caller's budget was
   * spent. The safety signal was still screened and recorded; only the guide
   * was withheld.
   */
  readonly throttled: boolean;
  /**
   * True when {@link TurnDeps.answering} named a step this session has already
   * moved past, so the answer was not applied to anything.
   *
   * The signal was still screened and recorded. Nothing else was: the answer
   * was to a question that is no longer on the screen, and recording it
   * against the one that is would put the wrong words in the journal.
   */
  readonly stale: boolean;
  /** Set when a reviewer should see this turn. */
  readonly flag?: {
    readonly level: Exclude<SafetyLevel, 'none'>;
    readonly category: SafetyCategory;
    readonly excerpt: string;
  };
}

/**
 * Whether the guide was actually consulted.
 *
 * The three reasons it was not are a safety stop, a spent budget and an answer
 * to a step that had already moved on, and none should be charged for: a stop
 * never reaches the guide, and a refusal is the caller being told to wait or to
 * ask again, not work done for them.
 */
export function guideConsulted(result: TurnResult): boolean {
  return !result.stopped && !result.throttled && !result.stale;
}

export interface TurnDeps {
  readonly guide: Guide;
  readonly risk: RiskScreen;
  /**
   * Whether the guide may be consulted at all.
   *
   * The budget is the caller's — a rate limit, a quota, whatever the surface
   * uses to stop one client from running the guide flat out. It is an argument
   * rather than something checked before this function because of where it has
   * to apply: **after** the screen and never before it.
   *
   * A limit that can refuse a request before it is screened can refuse someone
   * saying they are not safe, and then the helplines never appear. So the
   * screen always runs, the signal is always recorded, and a spent budget only
   * withholds the guide.
   *
   * Defaults to true, because most callers have no budget to speak of.
   */
  readonly guideAvailable?: boolean;
  /**
   * The step the caller believes it is answering.
   *
   * It exists because a lost response is not a lost turn. A client that sends
   * an answer, has the reply dropped by a flaky network and sends it again
   * would otherwise have the same words recorded twice — the second time
   * against the next step, whose real answer is then never asked for. On a
   * phone on mobile data that is not an edge case.
   *
   * Like {@link guideAvailable}, it is read **after** the screen and never
   * before it, and for the same reason: nothing about which step a client
   * thinks it is on may refuse a turn before anything has looked at what was
   * said. A stale answer still raises its flag and still stops the session.
   *
   * Omitted when the caller cannot say, which is treated as not having said
   * rather than as a mismatch — a check that refuses what it cannot
   * understand would refuse a crisis.
   */
  readonly answering?: StepId;
}

/**
 * Runs one turn.
 *
 * A session that has already ended is returned untouched, so a late utterance
 * cannot reopen one — including one that stopped for safety.
 */
export function takeTurn(
  session: Session,
  version: ProtocolVersion,
  utterance: string,
  { guide, risk, guideAvailable = true, answering }: TurnDeps,
): TurnResult {
  if (session.phase === 'ended') {
    return {
      session,
      say: '',
      advanced: false,
      // Nothing was screened: the turn is refused before the screen is asked.
      // `unreadable` describes text, and there is no text here to describe.
      risk: { level: 'none', unreadable: false },
      stopped: false,
      throttled: false,
      stale: false,
    };
  }

  // The whole utterance, however long. Nothing refuses a turn for its length:
  // the longest thing somebody writes is quite often the one that matters
  // most, and a limit that can refuse it is a limit in front of the screen.
  const assessment = risk.assess(utterance);

  // What may be written down is bounded, and only after the screen has read
  // all of it. See `utterance.ts` for why the bound is storage and not speech.
  const recorded = recordable(utterance);

  const flagged =
    mustFlag(assessment.level) && assessment.category !== undefined
      ? {
          level: assessment.level as Exclude<SafetyLevel, 'none'>,
          category: assessment.category,
          excerpt: recorded.trim(),
        }
      : undefined;

  // Record the signal first, whatever it was. A medium flag must survive even
  // when the turn then proceeds normally.
  let next = apply(session, { type: 'safety_signal', level: assessment.level });

  if (mustStop(assessment.level)) {
    // The guide is never consulted. Nothing is said back: the safety screen
    // takes over the surface from here.
    return {
      session: next,
      say: '',
      advanced: false,
      risk: assessment,
      stopped: true,
      // Never throttled and never stale: a stop is the one reply that must
      // always be given, whatever step the caller thought it was on.
      throttled: false,
      stale: false,
      ...(flagged === undefined ? {} : { flag: flagged }),
    };
  }

  // Screened and recorded, and then no further. Checked before the budget
  // because "that question has moved on" is the more useful answer of the two:
  // waiting and sending it again would not make it apply.
  if (answering !== undefined && answering !== next.stepId) {
    return {
      session: next,
      say: '',
      advanced: false,
      risk: assessment,
      stopped: false,
      throttled: false,
      stale: true,
      ...(flagged === undefined ? {} : { flag: flagged }),
    };
  }

  if (!guideAvailable) {
    // Screened, recorded, and no further. The session does not advance and
    // nothing is said, so the caller can refuse without having lost the
    // signal — which is the whole point of checking the budget here.
    return {
      session: next,
      say: '',
      advanced: false,
      risk: assessment,
      stopped: false,
      throttled: true,
      stale: false,
      ...(flagged === undefined ? {} : { flag: flagged }),
    };
  }

  const reply: GuideReply = guide.respond({ session: next, version, utterance: recorded });

  // exactOptionalPropertyTypes: omit `capture` entirely when there is nothing
  // to record, rather than setting it to undefined.
  const capture = toCapture(reply.capture);
  next = reply.advance
    ? apply(
        next,
        capture === undefined ? { type: 'step_satisfied' } : { type: 'step_satisfied', capture },
      )
    : apply(next, { type: 'guide_turn' });

  return {
    session: next,
    // When the step moved on, what the guide says next is the new step's
    // question. The scripted guide answers an advancing turn with nothing —
    // acknowledgement copy is not in the designs and inventing it would be
    // inventing the guide's voice — so without this the guide fell silent for
    // the rest of the session: five steps where the client was handed an empty
    // `say` and showed "this step has no question yet", whether or not the
    // step had copy.
    //
    // Through the guide rather than read off the version, so a model that one
    // day wants to acknowledge the answer *and* ask the next question has one
    // place to do it.
    say: reply.advance && next.stepId !== null ? openingLine(next, version, guide) : reply.say,
    advanced: reply.advance,
    risk: assessment,
    stopped: false,
    throttled: false,
    stale: false,
    ...(flagged === undefined ? {} : { flag: flagged }),
  };
}

/** The guide's opening line for the step a session is on. */
export function openingLine(session: Session, version: ProtocolVersion, guide: Guide): string {
  return guide.respond({ session, version, utterance: '' }).say;
}
