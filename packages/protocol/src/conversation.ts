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
import { toCapture, type Guide, type GuideReply } from './guide.js';
import { mustFlag, mustStop, type SafetyCategory, type SafetyLevel } from './safety.js';
import type { RiskAssessment, RiskScreen } from './risk.js';
import type { ProtocolVersion } from './version.js';

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
 * The two reasons it was not are a safety stop and a spent budget, and neither
 * should be charged for: a stop never reaches the guide, and a refusal is the
 * caller being told to wait, not work done for them.
 */
export function guideConsulted(result: TurnResult): boolean {
  return !result.stopped && !result.throttled;
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
  { guide, risk, guideAvailable = true }: TurnDeps,
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
    };
  }

  const assessment = risk.assess(utterance);

  const flagged =
    mustFlag(assessment.level) && assessment.category !== undefined
      ? {
          level: assessment.level as Exclude<SafetyLevel, 'none'>,
          category: assessment.category,
          excerpt: utterance.trim(),
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
      // Never throttled: a stop is the one reply that must always be given.
      throttled: false,
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
      ...(flagged === undefined ? {} : { flag: flagged }),
    };
  }

  const reply: GuideReply = guide.respond({ session: next, version, utterance });

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
    say: reply.say,
    advanced: reply.advance,
    risk: assessment,
    stopped: false,
    throttled: false,
    ...(flagged === undefined ? {} : { flag: flagged }),
  };
}

/** The guide's opening line for the step a session is on. */
export function openingLine(session: Session, version: ProtocolVersion, guide: Guide): string {
  return guide.respond({ session, version, utterance: '' }).say;
}
