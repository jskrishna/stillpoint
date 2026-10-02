/**
 * The feelings a user can name at step 3, and the colour each one carries.
 *
 * From the "Feelings have colours" panel of the Stillpoint design language:
 * muted and earthy, never neon. The colours are part of the domain, not a
 * styling detail — they are what makes a user's journal and insights look like
 * theirs, so every surface renders a given feeling the same way.
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
  /** The feeling's swatch, as a hex colour from the design language. */
  readonly color: `#${string}`;
}

/** Every feeling, in the order the design language lists the chips. */
export const FEELINGS = [
  { id: 'angry', label: 'Angry', color: '#B8553E' },
  { id: 'afraid', label: 'Afraid', color: '#5D6F96' },
  { id: 'anxious', label: 'Anxious', color: '#8A8FB0' },
  { id: 'sad', label: 'Sad', color: '#45627E' },
  { id: 'guilty', label: 'Guilty', color: '#7A6454' },
  { id: 'humiliated', label: 'Humiliated', color: '#8E5C7E' },
  { id: 'rejected', label: 'Rejected', color: '#A8704F' },
  { id: 'unworthy', label: 'Unworthy', color: '#8B7447' },
  { id: 'powerless', label: 'Powerless', color: '#66607A' },
  { id: 'lonely', label: 'Lonely', color: '#4F7A7E' },
  { id: 'overwhelmed', label: 'Overwhelmed', color: '#9C8440' },
  { id: 'hurt', label: 'Hurt', color: '#A15B5B' },
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
