/**
 * What someone agrees to and chooses before their first session.
 *
 * The consent screen is not a formality: it is where the product says it is not
 * therapy, that the user may stop at any time, and what happens to their data.
 * Which items are required is therefore a rule, enforced here rather than by
 * whether a particular screen remembered to disable its button.
 */

/** One thing the user is asked to agree to. */
export interface ConsentItem {
  readonly id: ConsentId;
  readonly text: string;
  /** A required item blocks starting until it is accepted. */
  readonly required: boolean;
}

export type ConsentId = 'understands' | 'adult' | 'improve';

/** The consent items, in the order the screen lists them. */
export const CONSENT_ITEMS = [
  { id: 'understands', text: 'I understand and I can stop any time.', required: true },
  { id: 'adult', text: 'I am 18 or older.', required: true },
  {
    id: 'improve',
    text: 'Use my anonymous sessions to improve the app (optional).',
    required: false,
  },
] as const satisfies readonly ConsentItem[];

/** The items that must be accepted before a session may start. */
export const REQUIRED_CONSENT: readonly ConsentId[] = CONSENT_ITEMS.filter((i) => i.required).map(
  (i) => i.id,
);

/**
 * Whether the user has agreed to everything required.
 *
 * The optional item is never part of this: letting an unticked "use my sessions
 * to improve the app" block someone would turn a choice into a toll.
 *
 * **And nothing reads that item.** Grepped across both languages and all three
 * surfaces: `improve` is defined here, validated by the consent route and
 * stored in `accepted_consent`, and no code anywhere asks whether it was
 * accepted. Nothing uses anybody's sessions to improve the app — there is no
 * analytics, no export for training, no aggregate over session text beyond the
 * user's own insights.
 *
 * So the control is decoration today, and unlike `coach_sharing` — which was
 * also decoration and whose "Never share" blocked nothing — this one fails
 * safe: somebody who declines is treated exactly like somebody who accepts,
 * because the answer is never consulted either way. What it is not is settled.
 * "Improve the app" is a scope, not a purpose, and whatever first reads this
 * column is what the people who ticked it will have agreed to. Québec's Law 25
 * is the stricter of the two laws in frame for the first market and it wants a
 * specified purpose. That is in `DECISIONS.md` beside the question of which law
 * the consent screen is written for, because it is the same lawyer's answer.
 */
export function hasRequiredConsent(accepted: readonly ConsentId[]): boolean {
  return REQUIRED_CONSENT.every((id) => accepted.includes(id));
}

/** Required items not yet accepted. */
export function missingConsent(accepted: readonly ConsentId[]): readonly ConsentId[] {
  return REQUIRED_CONSENT.filter((id) => !accepted.includes(id));
}

/** A voice the guide can speak in. */
export interface GuideVoice {
  readonly id: 'sage' | 'river';
  readonly name: string;
  /** How it sounds, as the setup screen describes it. */
  readonly description: string;
}

export const GUIDE_VOICES = [
  { id: 'sage', name: 'Sage', description: 'Warm and slow' },
  { id: 'river', name: 'River', description: 'Soft and gentle' },
] as const satisfies readonly GuideVoice[];

export const DEFAULT_VOICE: GuideVoice['id'] = 'sage';

/**
 * How the user speaks to the guide.
 *
 * Typing is a first-class mode, not a fallback: the setup screen offers "I'll
 * type instead" without ever asking for the microphone, and every session
 * screen keeps the option.
 */
export type TalkMode = 'hold' | 'hands_free' | 'type';

export const TALK_MODE_LABEL = {
  hold: 'Hold to talk',
  hands_free: 'Hands free',
  type: 'Type instead',
} as const satisfies Readonly<Record<TalkMode, string>>;

/** Every talk mode, in the order the settings screen lists them. */
export const TALK_MODES = ['hold', 'hands_free', 'type'] as const satisfies readonly TalkMode[];

/** How a user's journal is offered to their coach. */
export type CoachSharing = 'ask_each_time' | 'never' | 'always';

export const COACH_SHARING_LABEL = {
  ask_each_time: 'Ask each time',
  never: 'Never share',
  always: 'Share every session',
} as const satisfies Readonly<Record<CoachSharing, string>>;

/**
 * A stored string, or asking, when it is not a choice we know.
 *
 * The mirror of `CoachSharing::fromStored()`. Asking is the safe default for
 * the same reason it is the designed one: it shares nothing until the user
 * says so about a particular session. A client reads this from the API as a
 * plain string — `packages/client` holds the server's words and not the
 * domain's unions — so this is where it becomes a choice.
 */
export function coachSharingFromStored(value: string | null | undefined): CoachSharing {
  return value === 'never' || value === 'always' ? value : 'ask_each_time';
}

/** Every sharing choice, in the order the settings screen lists them. */
export const COACH_SHARINGS = [
  'ask_each_time',
  'never',
  'always',
] as const satisfies readonly CoachSharing[];

/** Everything chosen during onboarding and changeable in settings. */
export interface Preferences {
  readonly voice: GuideVoice['id'];
  readonly talkMode: TalkMode;
  readonly coachSharing: CoachSharing;
  readonly acceptedConsent: readonly ConsentId[];
}

/** The defaults the designs show for a new account. */
export const DEFAULT_PREFERENCES: Preferences = {
  voice: DEFAULT_VOICE,
  talkMode: 'hold',
  // Defaults to asking, so sharing with a coach is always a decision the user
  // makes about a particular session rather than one made once and forgotten.
  coachSharing: 'ask_each_time',
  acceptedConsent: [],
};
