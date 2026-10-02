/**
 * The session state machine.
 *
 * A session walks the six steps in order, collecting what the summary screen
 * reports back: what happened, the feelings named, the childhood memory and the
 * old belief. Two things can end it early — a safety stop, or the user choosing
 * to stop, which the consent screen promises they may do at any time.
 *
 * The machine is a pure reducer: {@link apply} takes a session and an event and
 * returns the next session. It never mutates its input, so callers can keep
 * history, replay a transcript, or drive it from a queue.
 */

import { isFeelingId, type FeelingId } from './feelings.js';
import { mustStop, type SafetyLevel } from './safety.js';
import { nextStep, step, STEP_ORDER, type StepId } from './steps.js';

/** Whether the user answered by voice or by typing. */
export type InputMode = 'voice' | 'text';

/** How the user rated their state on the summary screen. */
export type CalmerRating = 'yes' | 'a_little' | 'no';

/** The childhood memory captured at step 4. */
export interface Memory {
  readonly description: string;
  /** Age the user was, when they give one. */
  readonly age?: number;
}

/** What a session has gathered so far. All fields fill in as steps complete. */
export interface SessionData {
  readonly whatHappened?: string;
  readonly feelings: readonly FeelingId[];
  readonly memory?: Memory;
  /** The old belief, in the user's own words. */
  readonly belief?: string;
  readonly calmerRating?: CalmerRating;
}

/** Why a session stopped before reaching the end. */
export type EndReason = 'completed' | 'safety_stop' | 'user_stopped';

/** Where a session currently is. */
export type SessionPhase = 'in_step' | 'ended';

export interface Session {
  readonly phase: SessionPhase;
  /** The step in progress. `null` once the session has ended. */
  readonly stepId: StepId | null;
  /** Guide turns already spent on {@link stepId}. */
  readonly guideTurnsUsed: number;
  readonly data: SessionData;
  /** Set once {@link phase} is `ended`. */
  readonly endReason: EndReason | null;
  /** The highest safety level seen in this session. */
  readonly safetyLevel: SafetyLevel;
}

/** Starts a session at step 1 with nothing gathered. */
export function startSession(): Session {
  return {
    phase: 'in_step',
    stepId: STEP_ORDER[0],
    guideTurnsUsed: 0,
    data: { feelings: [] },
    endReason: null,
    safetyLevel: 'none',
  };
}

/** Events that drive a session forward. */
export type SessionEvent =
  /** The guide spoke: a prompt or a fallback. */
  | { readonly type: 'guide_turn' }
  /** The user answered, and the guide judged the step satisfied. */
  | {
      readonly type: 'step_satisfied';
      readonly capture?: Partial<Omit<SessionData, 'feelings'>> & {
        readonly feelings?: readonly string[];
      };
    }
  /** A safety signal was classified for something the user said. */
  | { readonly type: 'safety_signal'; readonly level: SafetyLevel }
  /** The user chose to stop. */
  | { readonly type: 'user_stopped' }
  /** The user rated how they feel on the summary screen. */
  | { readonly type: 'rated'; readonly rating: CalmerRating };

/** Severity order, so a session's safety level only ever rises. */
const SAFETY_RANK: Readonly<Record<SafetyLevel, number>> = { none: 0, concern: 1, crisis: 2 };

function raise(current: SafetyLevel, next: SafetyLevel): SafetyLevel {
  return SAFETY_RANK[next] > SAFETY_RANK[current] ? next : current;
}

function mergeData(
  data: SessionData,
  capture: Extract<SessionEvent, { type: 'step_satisfied' }>['capture'],
): SessionData {
  if (capture === undefined) return data;

  const { feelings, ...rest } = capture;
  const merged: SessionData = { ...data, ...rest };
  if (feelings === undefined) return merged;

  // Unknown feeling ids are dropped rather than trusted: they reach us from a
  // transcript the user spoke, not from a fixed set of buttons.
  return { ...merged, feelings: feelings.filter(isFeelingId) };
}

function end(session: Session, reason: EndReason): Session {
  return { ...session, phase: 'ended', stepId: null, endReason: reason };
}

/**
 * Applies an event, returning the next session.
 *
 * An ended session is terminal: every event but `rated` leaves it unchanged, so
 * a late transcript turn cannot restart a session that stopped for safety.
 */
export function apply(session: Session, event: SessionEvent): Session {
  if (session.phase === 'ended') {
    // The summary screen asks for the rating after the session ends, so that
    // one event still lands; nothing else may reopen a closed session.
    if (event.type === 'rated') {
      return { ...session, data: { ...session.data, calmerRating: event.rating } };
    }
    return session;
  }

  switch (event.type) {
    case 'guide_turn':
      return { ...session, guideTurnsUsed: session.guideTurnsUsed + 1 };

    case 'step_satisfied': {
      const data = mergeData(session.data, event.capture);
      const current = session.stepId;
      if (current === null) return session;

      const next = nextStep(current);
      if (next === undefined) {
        return end({ ...session, data }, 'completed');
      }
      return { ...session, stepId: next.id, guideTurnsUsed: 0, data };
    }

    case 'safety_signal': {
      const safetyLevel = raise(session.safetyLevel, event.level);
      const raised = { ...session, safetyLevel };
      return mustStop(event.level) ? end(raised, 'safety_stop') : raised;
    }

    case 'user_stopped':
      return end(session, 'user_stopped');

    case 'rated':
      return { ...session, data: { ...session.data, calmerRating: event.rating } };
  }
}

/** Runs a sequence of events in order. */
export function applyAll(session: Session, events: readonly SessionEvent[]): Session {
  return events.reduce(apply, session);
}

/**
 * Whether the guide has used up its turns on the current step.
 *
 * `false` when the step sets no limit — an unstated limit is not a limit of
 * zero. Steps missing their `maxGuideTurns` are reported by
 * `incompleteSteps()`.
 */
export function isOutOfGuideTurns(session: Session): boolean {
  if (session.stepId === null) return false;
  const max = step(session.stepId).maxGuideTurns;
  return max !== null && session.guideTurnsUsed >= max;
}

/** 1-based position of the current step, or `null` once ended. */
export function currentOrdinal(session: Session): number | null {
  return session.stepId === null ? null : step(session.stepId).ordinal;
}
