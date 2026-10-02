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
  /** Set when a reviewer should see this turn. */
  readonly flag?: {
    readonly level: Exclude<SafetyLevel, 'none'>;
    readonly category: SafetyCategory;
    readonly excerpt: string;
  };
}

export interface TurnDeps {
  readonly guide: Guide;
  readonly risk: RiskScreen;
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
  { guide, risk }: TurnDeps,
): TurnResult {
  if (session.phase === 'ended') {
    return { session, say: '', advanced: false, risk: { level: 'none' }, stopped: false };
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
    ...(flagged === undefined ? {} : { flag: flagged }),
  };
}

/** The guide's opening line for the step a session is on. */
export function openingLine(session: Session, version: ProtocolVersion, guide: Guide): string {
  return guide.respond({ session, version, utterance: '' }).say;
}
