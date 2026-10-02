/**
 * The feelings a user can name at step 3.
 *
 * Which feelings exist is domain: they are what a session captures, what the
 * journal stores and what insights aggregate. How they are *drawn* is not, so
 * their colours live in `@stillpoint/design-tokens` instead and this package
 * stays free of presentation.
 */

/** Stable identifier for a feeling. */
export type FeelingId =
  | 'angry'
  | 'afraid'
  | 'anxious'
  | 'sad'
  | 'guilty'
  | 'ashamed'
  | 'rejected'
  | 'unworthy'
  | 'lonely'
  | 'hurt'
  | 'overwhelmed'
  | 'powerless'
  | 'humiliated';

export interface Feeling {
  readonly id: FeelingId;
  /** Label shown on the chip, e.g. "Unworthy". */
  readonly label: string;
  /**
   * Whether the chip is shown straight away.
   *
   * Step 3 lists a primary set and puts the rest behind "See more feelings",
   * so someone upset is not handed every option at once.
   */
  readonly primary: boolean;
}

/** Every feeling, in the order step 3 lists the chips. */
export const FEELINGS = [
  { id: 'angry', label: 'Angry', primary: true },
  { id: 'afraid', label: 'Afraid', primary: true },
  { id: 'anxious', label: 'Anxious', primary: true },
  { id: 'sad', label: 'Sad', primary: true },
  { id: 'guilty', label: 'Guilty', primary: true },
  { id: 'ashamed', label: 'Ashamed', primary: true },
  { id: 'rejected', label: 'Rejected', primary: true },
  { id: 'unworthy', label: 'Unworthy', primary: true },
  { id: 'lonely', label: 'Lonely', primary: true },
  { id: 'hurt', label: 'Hurt', primary: true },
  { id: 'overwhelmed', label: 'Overwhelmed', primary: true },
  { id: 'powerless', label: 'Powerless', primary: true },
  { id: 'humiliated', label: 'Humiliated', primary: false },
] as const satisfies readonly Feeling[];

/**
 * How many feelings a user may choose at step 3 ("Choose up to 3").
 *
 * A cap, not a target: naming one feeling is a complete answer.
 */
export const MAX_FEELINGS = 3;

const BY_ID: ReadonlyMap<FeelingId, Feeling> = new Map(FEELINGS.map((f) => [f.id, f]));

/** Returns the feeling for `id`, or `undefined` if it is not one of ours. */
export function feeling(id: string): Feeling | undefined {
  return BY_ID.get(id as FeelingId);
}

/** Whether `id` names one of the protocol's feelings. */
export function isFeelingId(id: string): id is FeelingId {
  return BY_ID.has(id as FeelingId);
}

/** The chips shown straight away at step 3. */
export const PRIMARY_FEELINGS: readonly Feeling[] = FEELINGS.filter((f) => f.primary);

/** The chips behind "See more feelings". */
export const MORE_FEELINGS: readonly Feeling[] = FEELINGS.filter((f) => !f.primary);

/**
 * Adds or removes a feeling from a selection, respecting {@link MAX_FEELINGS}.
 *
 * Deselecting always works. Selecting past the cap is ignored rather than
 * silently dropping an earlier choice: at step 3 the user is upset, and having
 * a chip they did not touch quietly turn off is worse than a tap doing nothing.
 */
export function toggleFeeling(
  selected: readonly FeelingId[],
  id: FeelingId,
  max: number = MAX_FEELINGS,
): readonly FeelingId[] {
  if (selected.includes(id)) return selected.filter((f) => f !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}

/** Whether another feeling can still be chosen. */
export function canSelectMore(selected: readonly FeelingId[], max: number = MAX_FEELINGS): boolean {
  return selected.length < max;
}
