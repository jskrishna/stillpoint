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
  | 'humiliated'
  | 'rejected'
  | 'unworthy'
  | 'powerless'
  | 'lonely'
  | 'overwhelmed'
  | 'hurt';

export interface Feeling {
  readonly id: FeelingId;
  /** Label shown on the chip, e.g. "Humiliated". */
  readonly label: string;
}

/** Every feeling, in the order the design language lists the chips. */
export const FEELINGS = [
  { id: 'angry', label: 'Angry' },
  { id: 'afraid', label: 'Afraid' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'sad', label: 'Sad' },
  { id: 'guilty', label: 'Guilty' },
  { id: 'humiliated', label: 'Humiliated' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'unworthy', label: 'Unworthy' },
  { id: 'powerless', label: 'Powerless' },
  { id: 'lonely', label: 'Lonely' },
  { id: 'overwhelmed', label: 'Overwhelmed' },
  { id: 'hurt', label: 'Hurt' },
] as const satisfies readonly Feeling[];

const BY_ID: ReadonlyMap<FeelingId, Feeling> = new Map(FEELINGS.map((f) => [f.id, f]));

/** Returns the feeling for `id`, or `undefined` if it is not one of ours. */
export function feeling(id: string): Feeling | undefined {
  return BY_ID.get(id as FeelingId);
}

/** Whether `id` names one of the protocol's feelings. */
export function isFeelingId(id: string): id is FeelingId {
  return BY_ID.has(id as FeelingId);
}
