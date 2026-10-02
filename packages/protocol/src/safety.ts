/**
 * Safety: what happens when a user says something that suggests they may be in
 * danger, and what staff see afterwards.
 *
 * The rule the product states publicly, on its own marketing site: "If you say
 * something that shows you may be in danger, the session stops and we show
 * helplines right away." That is a hard stop, not a nudge — so a triggered
 * session may not be resumed from where it paused, and the guide may not take
 * another turn.
 */

/**
 * How severe a safety signal is, in the words the admin queue uses.
 *
 * Only `high` stops a session. `medium` and `low` are raised for review without
 * interrupting someone who is mid-session and not in danger.
 */
export type SafetyLevel = 'none' | 'low' | 'medium' | 'high';

/** What kind of concern was detected, as the flag queue categorises them. */
export type SafetyCategory = 'self_harm' | 'harm_to_others' | 'trauma' | 'medical';

/** Human-readable category names, as the queue prints them. */
export const SAFETY_CATEGORY_LABEL = {
  self_harm: 'Self-harm',
  harm_to_others: 'Harm to others',
  trauma: 'Trauma',
  medical: 'Medical',
} as const satisfies Readonly<Record<SafetyCategory, string>>;

/** What a caller must do for a given safety level. */
export const SAFETY_ACTION = {
  none: 'continue',
  low: 'flag',
  medium: 'flag',
  high: 'stop',
} as const satisfies Readonly<Record<SafetyLevel, string>>;

/** Severity order, lowest first. */
export const SAFETY_LEVELS = ['none', 'low', 'medium', 'high'] as const;

const RANK: Readonly<Record<SafetyLevel, number>> = { none: 0, low: 1, medium: 2, high: 3 };

/** Whether a level requires the session to stop immediately. */
export function mustStop(level: SafetyLevel): boolean {
  return level === 'high';
}

/** Whether a level should raise a flag for staff review. */
export function mustFlag(level: SafetyLevel): boolean {
  return level !== 'none';
}

/** The more severe of two levels. A session's level only ever rises. */
export function moreSevere(a: SafetyLevel, b: SafetyLevel): SafetyLevel {
  return RANK[b] > RANK[a] ? b : a;
}

/** Where a flag is in review. */
export type FlagStatus = 'open' | 'reviewed';

/** One entry in the safety queue. */
export interface SafetyFlag {
  readonly id: string;
  readonly sessionId: string;
  readonly level: Exclude<SafetyLevel, 'none'>;
  readonly category: SafetyCategory;
  /** The user's own words that triggered it. */
  readonly excerpt: string;
  /** What the product did in response, e.g. "Session stopped. Helplines shown." */
  readonly outcome: string;
  readonly raisedAt: Date;
  readonly status: FlagStatus;
}

/** Flags still awaiting review. */
export function openFlags(flags: readonly SafetyFlag[]): readonly SafetyFlag[] {
  return flags.filter((f) => f.status === 'open');
}

/** Most severe first, then most recent — the order the queue should work in. */
export function byUrgency(flags: readonly SafetyFlag[]): readonly SafetyFlag[] {
  return [...flags].sort(
    (a, b) => RANK[b.level] - RANK[a.level] || b.raisedAt.getTime() - a.raisedAt.getTime(),
  );
}

/** Marks a flag reviewed. */
export function markReviewed(flag: SafetyFlag): SafetyFlag {
  return flag.status === 'reviewed' ? flag : { ...flag, status: 'reviewed' };
}

/** A helpline shown on the safety pause screen. */
export interface Helpline {
  readonly name: string;
  /** Dialable number, as the safety screen dials it. */
  readonly number: string;
  /** Short qualifier, e.g. "Free · 24 hours". */
  readonly detail: string;
  /** ISO 3166-1 alpha-2 country this helpline serves. */
  readonly country: 'IN';
  /** `emergency` services take precedence over a `helpline`. */
  readonly kind: 'helpline' | 'emergency';
}

/**
 * Helplines for India, the market the designs target.
 *
 * The safety screen also offers "Not in India? See other helplines", so this
 * list is deliberately scoped by country and expected to grow. Resolve by
 * country rather than assuming these are universal.
 */
export const HELPLINES_IN: readonly Helpline[] = [
  {
    name: 'Tele-MANAS helpline',
    number: '14416',
    detail: 'Free · 24 hours · India',
    country: 'IN',
    kind: 'helpline',
  },
  {
    name: 'Emergency',
    number: '112',
    detail: 'If you are in danger now',
    country: 'IN',
    kind: 'emergency',
  },
];

/** Returns the helplines for a country, or an empty list if none are known. */
export function helplinesFor(country: string): readonly Helpline[] {
  return country === 'IN' ? HELPLINES_IN : [];
}
