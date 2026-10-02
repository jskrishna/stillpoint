/**
 * Protocol versions: the live/draft model behind the admin "Step prompts"
 * editor, which shows "Live version 1.4 · Draft 1.5 (not published)" and
 * offers Test it / Publish.
 *
 * Prompt copy is content, edited by staff, so it is versioned rather than
 * compiled in. Two rules follow and both matter:
 *
 * - A version cannot be published while any step is missing copy. An
 *   unrunnable protocol reaching a user mid-session is a failure they
 *   experience as the guide going quiet on them.
 * - A running session holds the version it started on, so publishing never
 *   changes the questions under someone already part-way through.
 */

import { isComplete, STEP_ORDER, type ProtocolStep, type StepId } from './steps.js';
import { STEPS } from './steps.js';

/** Where a version is in its life. */
export type VersionStatus = 'draft' | 'live' | 'archived';

/** A version number, as the admin screen prints it: major.minor. */
export interface VersionNumber {
  readonly major: number;
  readonly minor: number;
}

/**
 * Staff-editable copy for the safety pause.
 *
 * Separate from the helplines, which are facts rather than wording, and must
 * not become editable prose by accident.
 */
export interface SafetyMessages {
  /** Heading on the safety pause screen. */
  readonly pauseTitle: string;
  /** The body beneath it. */
  readonly pauseBody: string;
}

/** The safety wording the designs specify. */
export const DEFAULT_SAFETY_MESSAGES: SafetyMessages = {
  pauseTitle: 'Let’s pause here.',
  pauseBody:
    'What you shared sounds very heavy. Please talk to a real person now. You don’t have to handle this alone.',
};

/** One version of the protocol: all six steps, plus the safety wording. */
export interface ProtocolVersion {
  readonly number: VersionNumber;
  readonly status: VersionStatus;
  readonly steps: Readonly<Record<StepId, ProtocolStep>>;
  readonly safety: SafetyMessages;
  /** Set when the version went live. */
  readonly publishedAt?: Date;
}

/** Formats a version as the admin screen prints it, e.g. "1.4". */
export function formatVersion(v: VersionNumber): string {
  return `${String(v.major)}.${String(v.minor)}`;
}

/**
 * The baseline draft, carrying the copy the designs actually specify.
 *
 * It is a draft, not live, because most steps are still missing their copy —
 * {@link publish} will refuse it until the PRD fills them in, which is the
 * point.
 */
export const BASELINE: ProtocolVersion = {
  number: { major: 1, minor: 0 },
  status: 'draft',
  steps: STEPS,
  safety: DEFAULT_SAFETY_MESSAGES,
};

/** Resolves a step within a given version. */
export function stepIn(version: ProtocolVersion, id: StepId): ProtocolStep {
  return version.steps[id];
}

/** The version's steps in protocol order. */
export function stepsOf(version: ProtocolVersion): readonly ProtocolStep[] {
  return STEP_ORDER.map((id) => version.steps[id]);
}

/** The fields of a step staff can edit. */
export interface StepEdit {
  readonly main?: string | null;
  readonly backups?: readonly string[];
  readonly doneWhen?: string | null;
  readonly maxGuideTurns?: number | null;
}

/**
 * Applies an edit to one step of a draft.
 *
 * Only a draft is editable: a live version is what users are running against,
 * and an archived one is a record. Returns the version unchanged otherwise, so
 * callers check {@link isEditable} rather than relying on a throw.
 */
export function editStep(version: ProtocolVersion, id: StepId, edit: StepEdit): ProtocolVersion {
  if (!isEditable(version)) return version;

  const current = version.steps[id];
  const next: ProtocolStep = {
    ...current,
    prompts: {
      main: edit.main === undefined ? current.prompts.main : edit.main,
      backups: edit.backups === undefined ? current.prompts.backups : [...edit.backups],
    },
    doneWhen: edit.doneWhen === undefined ? current.doneWhen : edit.doneWhen,
    maxGuideTurns: edit.maxGuideTurns === undefined ? current.maxGuideTurns : edit.maxGuideTurns,
  };

  return { ...version, steps: { ...version.steps, [id]: next } };
}

/** Replaces the safety wording on a draft. */
export function editSafety(
  version: ProtocolVersion,
  safety: Partial<SafetyMessages>,
): ProtocolVersion {
  if (!isEditable(version)) return version;
  return { ...version, safety: { ...version.safety, ...safety } };
}

/** Whether a version can still be edited. */
export function isEditable(version: ProtocolVersion): boolean {
  return version.status === 'draft';
}

/** Opens the next draft from a live version, e.g. 1.4 live → 1.5 draft. */
export function draftFrom(version: ProtocolVersion): ProtocolVersion {
  const { publishedAt: _was, ...rest } = version;
  return {
    ...rest,
    number: { major: version.number.major, minor: version.number.minor + 1 },
    status: 'draft',
  };
}

/** Why a draft cannot go live. */
export interface PublishProblem {
  /** The step at fault, or `undefined` for a version-wide problem. */
  readonly stepId?: StepId;
  readonly reason: string;
}

/** The outcome of attempting to publish. */
export type PublishResult =
  | { readonly ok: true; readonly version: ProtocolVersion }
  | { readonly ok: false; readonly problems: readonly PublishProblem[] };

/**
 * Everything standing between a draft and going live.
 *
 * Empty means publishable. Checked rather than assumed, because a half-written
 * protocol reaching a user is the failure this whole model exists to prevent.
 */
export function publishProblems(version: ProtocolVersion): readonly PublishProblem[] {
  const problems: PublishProblem[] = [];

  if (version.status !== 'draft') {
    problems.push({ reason: `Only a draft can be published; this is ${version.status}.` });
  }

  for (const id of STEP_ORDER) {
    const step = version.steps[id];
    if (step.prompts.main === null || step.prompts.main.trim() === '') {
      problems.push({ stepId: id, reason: `Step ${String(step.ordinal)} has no main question.` });
    }
    if (step.doneWhen === null || step.doneWhen.trim() === '') {
      problems.push({
        stepId: id,
        reason: `Step ${String(step.ordinal)} does not say when it is done.`,
      });
    }
    if (step.maxGuideTurns === null) {
      problems.push({ stepId: id, reason: `Step ${String(step.ordinal)} has no turn limit.` });
    } else if (step.maxGuideTurns < 1) {
      problems.push({
        stepId: id,
        reason: `Step ${String(step.ordinal)} allows no guide turns.`,
      });
    }
  }

  if (version.safety.pauseTitle.trim() === '' || version.safety.pauseBody.trim() === '') {
    problems.push({ reason: 'The safety pause message is incomplete.' });
  }

  return problems;
}

/** Whether a draft is ready to go live. */
export function isPublishable(version: ProtocolVersion): boolean {
  return publishProblems(version).length === 0;
}

/**
 * Publishes a draft, or reports why it cannot go live.
 *
 * Never throws: the admin screen shows the problems next to the steps at fault,
 * so they come back as data.
 */
export function publish(version: ProtocolVersion, at: Date): PublishResult {
  const problems = publishProblems(version);
  if (problems.length > 0) return { ok: false, problems };

  return { ok: true, version: { ...version, status: 'live', publishedAt: at } };
}

/** Retires a version that is no longer live. */
export function archive(version: ProtocolVersion): ProtocolVersion {
  return version.status === 'archived' ? version : { ...version, status: 'archived' };
}

/**
 * Whether every step of a version carries the fields a session needs.
 *
 * {@link publishProblems} is the one to show staff; this is the quick check.
 */
export function isRunnable(version: ProtocolVersion): boolean {
  return stepsOf(version).every(isComplete);
}
