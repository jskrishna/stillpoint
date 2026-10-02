/**
 * Stillpoint protocol — the product's domain core.
 *
 * Stillpoint is a voice guide that walks someone through the six-step Choose
 * Again process when they are upset. This package holds the parts of that
 * process no single surface owns: the step definitions, the session state
 * machine, the feelings taxonomy and the safety rules. The mobile app, desktop
 * app, admin console and coach portal all read them from here, so they cannot
 * drift apart.
 *
 * It is deliberately free of I/O: no network, no storage, no speech. That keeps
 * the rules testable and lets every surface drive them.
 */

export {
  STEP_ORDER,
  STEP_COUNT,
  STEP_LIST,
  STEPS,
  step,
  stepAt,
  nextStep,
  isComplete,
  incompleteSteps,
  type StepId,
  type StepOrdinal,
  type StepPrompts,
  type ProtocolStep,
} from './steps.js';

export { FEELINGS, feeling, isFeelingId, type Feeling, type FeelingId } from './feelings.js';

export {
  SAFETY_ACTION,
  HELPLINES_IN,
  mustStop,
  mustFlag,
  helplinesFor,
  type SafetyLevel,
  type Helpline,
} from './safety.js';

export {
  startSession,
  apply,
  applyAll,
  isOutOfGuideTurns,
  currentOrdinal,
  type Session,
  type SessionEvent,
  type SessionData,
  type SessionPhase,
  type EndReason,
  type InputMode,
  type CalmerRating,
  type Memory,
} from './session.js';
