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
  answerKindOf,
  type AnswerKind,
  type StepId,
  type StepOrdinal,
  type StepPrompts,
  type ProtocolStep,
} from './steps.js';

export {
  FEELINGS,
  PRIMARY_FEELINGS,
  MORE_FEELINGS,
  MAX_FEELINGS,
  feeling,
  isFeelingId,
  toggleFeeling,
  canSelectMore,
  type Feeling,
  type FeelingId,
} from './feelings.js';

export {
  SAFETY_ACTION,
  SAFETY_LEVELS,
  SAFETY_CATEGORY_LABEL,
  HELPLINES_IN,
  mustStop,
  mustFlag,
  moreSevere,
  openFlags,
  byUrgency,
  markReviewed,
  helplinesFor,
  type SafetyLevel,
  type SafetyCategory,
  type SafetyFlag,
  type FlagStatus,
  type Helpline,
} from './safety.js';

export {
  startSession,
  apply,
  applyAll,
  isOutOfGuideTurns,
  currentOrdinal,
  isUntouched,
  forgivenessFor,
  type Session,
  type SessionEvent,
  type SessionData,
  type SessionPhase,
  type SessionKind,
  type EndReason,
  type InputMode,
  type CalmerRating,
  type Memory,
} from './session.js';

export {
  entryFrom,
  listSummary,
  withNote,
  withSharing,
  byNewest,
  FINAL_STEP_ORDINAL,
  type JournalEntry,
  type EntryContext,
} from './journal.js';

export {
  insights,
  recurringBelief,
  withinWindow,
  DEFAULT_WINDOW_DAYS,
  type Insights,
  type FeelingCount,
  type RecurringBelief,
} from './insights.js';

export {
  BASELINE,
  DEFAULT_SAFETY_MESSAGES,
  formatVersion,
  stepIn,
  stepsOf,
  editStep,
  editSafety,
  isEditable,
  draftFrom,
  publish,
  publishProblems,
  isPublishable,
  isRunnable,
  archive,
  type ProtocolVersion,
  type VersionNumber,
  type VersionStatus,
  type SafetyMessages,
  type StepEdit,
  type PublishProblem,
  type PublishResult,
} from './version.js';

export {
  sharedWith,
  summarise,
  type Client,
  type ClientStatus,
  type ClientSummary,
  type Attention,
} from './coach.js';

export {
  CONSENT_ITEMS,
  REQUIRED_CONSENT,
  GUIDE_VOICES,
  DEFAULT_VOICE,
  TALK_MODE_LABEL,
  TALK_MODES,
  COACH_SHARING_LABEL,
  COACH_SHARINGS,
  DEFAULT_PREFERENCES,
  hasRequiredConsent,
  missingConsent,
  type ConsentItem,
  type ConsentId,
  type GuideVoice,
  type TalkMode,
  type CoachSharing,
  type Preferences,
} from './onboarding.js';

export {
  baselineRiskScreen,
  noRiskScreen,
  BASELINE_RULES,
  type Rule,
  type RiskAssessment,
  type RiskScreen,
} from './risk.js';

export { feelingsIn, isSubstantiveAnswer, literalExtraction } from './extraction.js';

export {
  PLAN_IDS,
  ALLOWANCE_WINDOW_DAYS,
  FULL_SESSIONS_PER_WEEK,
  isPlanId,
  mayStartSession,
  fullSessionsLeft,
  type PlanId,
  type StartDecision,
} from './plans.js';

export {
  scriptedGuide,
  toCapture,
  type Guide,
  type GuideContext,
  type GuideReply,
  type Extraction,
} from './guide.js';

export {
  takeTurn,
  openingLine,
  guideConsulted,
  type TurnResult,
  type TurnDeps,
} from './conversation.js';

export { RECORDED_UTTERANCE_LIMIT, recordable } from './utterance.js';

export { duration, greeting, partOfDay, relativeDay, type PartOfDay } from './display.js';
