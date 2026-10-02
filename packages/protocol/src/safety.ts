/**
 * Safety: what happens when a user says something that suggests they may be in
 * danger.
 *
 * The rule the product states publicly, on its own marketing site: "If you say
 * something that shows you may be in danger, the session stops and we show
 * helplines right away." That is a hard stop, not a nudge — so a triggered
 * session may not be resumed from where it paused, and the guide may not take
 * another turn. {@link SAFETY_ACTION} spells that out for callers.
 */

/** How severe a safety signal is. */
export type SafetyLevel =
  /** Nothing of concern. */
  | 'none'
  /** Concerning language that does not indicate immediate danger. */
  | 'concern'
  /** The user may be in danger. Stop the session and show helplines. */
  | 'crisis';

/** What a caller must do for a given safety level. */
export const SAFETY_ACTION = {
  none: 'continue',
  concern: 'flag',
  crisis: 'stop',
} as const satisfies Readonly<Record<SafetyLevel, string>>;

/** Whether a level requires the session to stop immediately. */
export function mustStop(level: SafetyLevel): boolean {
  return level === 'crisis';
}

/** Whether a level should raise a flag for staff review. */
export function mustFlag(level: SafetyLevel): boolean {
  return level === 'concern' || level === 'crisis';
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
