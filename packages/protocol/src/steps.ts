/**
 * The six steps of the Choose Again process, as the Stillpoint designs define them.
 *
 * Prompt copy is content, not code: it is versioned and edited by staff in the
 * admin console ("Step prompts": live version / draft, Test, Publish). This
 * module therefore describes the *shape* of a protocol version and carries the
 * copy that the design screens actually specify.
 *
 * Where the designs do not state a prompt, the field is `null` rather than
 * invented — see {@link isComplete}. The authoritative copy lives in the
 * product PRD; fill these in from it rather than from guesswork.
 */

/** Stable identifier for a step. Order is given by {@link STEP_ORDER}. */
export type StepId = 'notice' | 'responsibility' | 'feel' | 'remember' | 'inquire' | 'forgive';

/** The six steps in the order a session walks them. */
export const STEP_ORDER = [
  'notice',
  'responsibility',
  'feel',
  'remember',
  'inquire',
  'forgive',
] as const satisfies readonly StepId[];

/** Number of steps in the protocol. */
export const STEP_COUNT = STEP_ORDER.length;

/** 1-based position of a step, as shown to the user ("Step 3 of 6"). */
export type StepOrdinal = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * What the guide says to move a step along.
 *
 * The guide opens with `main`. If the user cannot answer, it falls back through
 * `backups` in order — the admin console calls these "Backup question 1/2" and
 * the session transcript labels them the same way.
 */
export interface StepPrompts {
  /** The step's opening question. `null` where the designs do not state it. */
  readonly main: string | null;
  /** Fallbacks, tried in order, when the user cannot answer `main`. */
  readonly backups: readonly string[];
}

/** A single step of a protocol version. */
export interface ProtocolStep {
  readonly id: StepId;
  readonly ordinal: StepOrdinal;
  /** Admin-facing name, e.g. "Remember". */
  readonly name: string;
  /** One-line description of the step, as the marketing site states it. */
  readonly summary: string;
  readonly prompts: StepPrompts;
  /**
   * The condition the guide checks to decide the step is done, in staff-editable
   * prose (admin: "Step is done when"). `null` where unstated by the designs.
   */
  readonly doneWhen: string | null;
  /**
   * How many turns the guide may take on this step before moving on
   * (admin: "Max guide turns"). `null` where unstated by the designs.
   */
  readonly maxGuideTurns: number | null;
}

/**
 * Step definitions carrying the copy the Stillpoint designs actually specify.
 *
 * Sourced from: the marketing site's "How it works" band (all six names and
 * summaries), the landing page's phone mock (step 1's question), the admin
 * "Step prompts" editor (step 4 in full), and an admin session transcript
 * (step 5's question).
 *
 * Steps 2, 3 and 6 have no prompt copy in the designs; their `prompts.main`,
 * `doneWhen` and `maxGuideTurns` are `null` and must be filled from the PRD
 * before a session can run end to end.
 */
export const STEPS: Readonly<Record<StepId, ProtocolStep>> = {
  notice: {
    id: 'notice',
    ordinal: 1,
    name: 'Notice',
    summary: 'Say what happened.',
    prompts: {
      main: 'You’re upset, and that’s okay. What happened?',
      backups: [],
    },
    doneWhen: null,
    maxGuideTurns: null,
  },
  responsibility: {
    id: 'responsibility',
    ordinal: 2,
    name: 'Responsibility',
    summary: 'See that the hurt comes from how you see it.',
    prompts: { main: null, backups: [] },
    doneWhen: null,
    maxGuideTurns: null,
  },
  feel: {
    id: 'feel',
    ordinal: 3,
    name: 'Feel',
    summary: 'Name what you feel.',
    prompts: { main: null, backups: [] },
    doneWhen: null,
    maxGuideTurns: null,
  },
  remember: {
    id: 'remember',
    ordinal: 4,
    name: 'Remember',
    summary: 'Find when you first felt this as a child.',
    prompts: {
      main: 'When did you first feel this way as a child? Take your time.',
      backups: [
        'That’s okay. Maybe school, or home — a time someone saw you get something wrong?',
        'Even a small moment counts. Where were you, and who was there?',
      ],
    },
    doneWhen: 'A specific memory, age under 12',
    maxGuideTurns: 4,
  },
  inquire: {
    id: 'inquire',
    ordinal: 5,
    name: 'Inquire',
    summary: 'What did you decide about yourself then?',
    prompts: {
      main: 'What did you believe about yourself then?',
      backups: [],
    },
    doneWhen: null,
    maxGuideTurns: null,
  },
  forgive: {
    id: 'forgive',
    ordinal: 6,
    name: 'Forgive',
    summary: 'Let that old belief go.',
    prompts: { main: null, backups: [] },
    doneWhen: null,
    maxGuideTurns: null,
  },
};

/** The steps as an ordered array. */
export const STEP_LIST: readonly ProtocolStep[] = STEP_ORDER.map((id) => STEPS[id]);

/** Returns the step definition for `id`. */
export function step(id: StepId): ProtocolStep {
  return STEPS[id];
}

/** Returns the step at a 1-based ordinal, or `undefined` if out of range. */
export function stepAt(ordinal: number): ProtocolStep | undefined {
  const id = STEP_ORDER[ordinal - 1];
  return id === undefined ? undefined : STEPS[id];
}

/** Returns the step after `id`, or `undefined` when `id` is the last step. */
export function nextStep(id: StepId): ProtocolStep | undefined {
  return stepAt(STEPS[id].ordinal + 1);
}

/**
 * Whether a step carries every field a session needs to run it.
 *
 * A step with no `main` prompt cannot be spoken, so a protocol version is only
 * runnable once every step is complete. Use this to gate publishing rather than
 * discovering the gap mid-session.
 */
export function isComplete(s: ProtocolStep): boolean {
  return s.prompts.main !== null && s.doneWhen !== null && s.maxGuideTurns !== null;
}

/** The steps still missing copy, in protocol order. Empty when runnable. */
export function incompleteSteps(
  steps: readonly ProtocolStep[] = STEP_LIST,
): readonly ProtocolStep[] {
  return steps.filter((s) => !isComplete(s));
}
