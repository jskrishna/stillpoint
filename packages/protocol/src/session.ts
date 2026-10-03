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
import { moreSevere, mustStop, type SafetyLevel } from './safety.js';
import { nextStep, step, STEP_ORDER, type StepId } from './steps.js';
import type { ProtocolVersion, VersionNumber } from './version.js';

/** Whether the user answered by voice or by typing. */
export type InputMode = 'voice' | 'text';

/** How the user rated their state on the summary screen. */
export type CalmerRating = 'yes' | 'a_little' | 'no';

/**
 * Whether a session walked the whole protocol or was a short one.
 *
 * The journal lists both: a full session shows the belief it surfaced, a quick
 * one is labelled "Quick session". The plans differ on them too — Free allows
 * three full sessions a week but unlimited quick ones.
 */
export type SessionKind = 'full' | 'quick';

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
  /**
   * The forgiveness the user speaks at step 6, e.g. "Forgive me for believing
   * that I am not good enough." Phrased from the belief by
   * {@link forgivenessFor} unless the guide captures its own wording.
   */
  readonly forgiveness?: string;
  /** A short title for the journal, e.g. "Called out at work". */
  readonly title?: string;
  readonly calmerRating?: CalmerRating;
}

/** Why a session stopped before reaching the end. */
export type EndReason = 'completed' | 'safety_stop' | 'user_stopped';

/** Where a session currently is. */
export type SessionPhase = 'in_step' | 'ended';

export interface Session {
  readonly kind: SessionKind;
  /**
   * The protocol version this session started on, recorded so a publish part
   * way through never changes the questions under someone mid-session.
   * `null` when the caller did not name one.
   */
  readonly protocolVersion: VersionNumber | null;
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

/**
 * Starts a session at step 1 with nothing gathered.
 *
 * Pass the live protocol version so the session is pinned to it; resolve its
 * steps with the same version for as long as the session runs.
 */
export function startSession(kind: SessionKind = 'full', version?: VersionNumber): Session {
  return {
    kind,
    protocolVersion: version ?? null,
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
      const safetyLevel = moreSevere(session.safetyLevel, event.level);
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
 * Pass the version the session is pinned to, so the limit is read from the
 * copy the session actually started on. Without one, the baseline step
 * definitions are used.
 *
 * `false` when the step sets no limit — an unstated limit is not a limit of
 * zero. Steps missing their `maxGuideTurns` are reported by
 * `incompleteSteps()`.
 */
export function isOutOfGuideTurns(session: Session, version?: ProtocolVersion): boolean {
  if (session.stepId === null) return false;
  const definition = version === undefined ? step(session.stepId) : version.steps[session.stepId];
  const max = definition.maxGuideTurns;
  return max !== null && session.guideTurnsUsed >= max;
}

/**
 * Phrases the forgiveness line for a belief, as the journal shows it:
 * "I'm not good enough." becomes "Forgive me for believing that I am not good
 * enough."
 *
 * Best-effort English phrasing from the user's own words — the guide may
 * capture its own wording instead, and `undefined` here simply means there is
 * nothing to phrase yet.
 */
export function forgivenessFor(belief: string | undefined): string | undefined {
  if (belief === undefined) return undefined;

  const trimmed = belief
    .trim()
    // The belief is quoted wherever it is displayed; store it unquoted.
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim()
    .replace(/[.。]+$/, '')
    .trim();

  if (trimmed === '') return undefined;

  // "I'm" reads wrong inside "believing that ..."; expand it, straight or curly.
  const expanded = trimmed.replace(/\bI['’]m\b/g, 'I am');
  return `Forgive me for believing that ${expanded}.`;
}

/** 1-based position of the current step, or `null` once ended. */
export function currentOrdinal(session: Session): number | null {
  return session.stepId === null ? null : step(session.stepId).ordinal;
}

/**
 * Whether nothing has been said into this session yet.
 *
 * True for a session exactly as {@link startSession} made it: on step 1, with
 * no guide turn spent, nothing gathered and no safety signal seen.
 *
 * It exists because starting a session is not free — a free plan gets three
 * full ones a week — and `POST /sessions` ends whatever was open and starts
 * another. A reply dropped on the way back, or a double tap, used to spend a
 * second allowance on the same attempt: three identical requests took a free
 * user's whole week, and the fourth told them they had used three sessions
 * when they had had none of them.
 *
 * When what is open is untouched there is nothing to carry on from, so handing
 * it back is indistinguishable from ending it and starting a new one — except
 * that it costs nothing. The server uses this to make starting idempotent for
 * as long as the session stays empty.
 */
export function isUntouched(session: Session): boolean {
  return (
    session.phase === 'in_step' &&
    session.stepId === STEP_ORDER[0] &&
    session.guideTurnsUsed === 0 &&
    session.safetyLevel === 'none' &&
    session.endReason === null &&
    session.data.feelings.length === 0 &&
    session.data.whatHappened === undefined &&
    session.data.belief === undefined &&
    session.data.forgiveness === undefined &&
    session.data.memory === undefined &&
    session.data.title === undefined &&
    session.data.calmerRating === undefined
  );
}
