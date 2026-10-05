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
export type SafetyCategory =
  | 'self_harm'
  | 'harm_to_others'
  | 'trauma'
  | 'medical'
  /**
   * The person pressed "Get help". Not something the screen detected, and
   * deliberately not one of the four above: somebody who does not feel safe
   * has not said why, and "Self-harm" beside their row would be a guess a
   * reviewer then reads as a finding.
   */
  | 'asked_for_help';

/** Human-readable category names, as the queue prints them. */
export const SAFETY_CATEGORY_LABEL = {
  self_harm: 'Self-harm',
  harm_to_others: 'Harm to others',
  trauma: 'Trauma',
  medical: 'Medical',
  asked_for_help: 'Asked for help',
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

/**
 * Most severe first, then most recent, then by id — the order the queue works
 * in.
 *
 * **The third key is the one that was missing**, and the docstring here used to
 * stop at "then most recent" and read as if that were the whole rule.
 * `SafetyFlag::scopeByUrgency()` orders `severity DESC, raised_at DESC, id
 * DESC`, and the `id` is not decoration: the queue is cursor-paged, a cursor is
 * built from the ordering columns, and a tie with no tiebreaker makes a page
 * repeat a row or skip one. On this list skipping one means a reviewer never
 * seeing a flag, which is the reason `CLAUDE.md` says every paged ordering ends
 * in `id`.
 *
 * Nothing calls this function — the queue is paged by the server and the
 * console renders what it is told — so the omission was never a live defect.
 * What it was is the second place in one sweep where the unconsumed half of the
 * protocol had quietly drifted from the half that runs, on a rule this
 * repository writes about at length. Somebody reading this to learn the
 * queue's ordering would have learnt the version without the tiebreaker.
 *
 * Ids are ULIDs, which sort lexicographically in creation order, so comparing
 * them as strings descending is the same order as the database's `id DESC`.
 * The ranks differ in expression and not in value: this reads `RANK[level]`
 * where the query reads the stored `severity` column, which the model keeps in
 * step with `SafetyLevel::rank()` on write.
 */
export function byUrgency(flags: readonly SafetyFlag[]): readonly SafetyFlag[] {
  return [...flags].sort(
    (a, b) =>
      RANK[b.level] - RANK[a.level] ||
      b.raisedAt.getTime() - a.raisedAt.getTime() ||
      b.id.localeCompare(a.id),
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
  readonly country: CountryCode;
  /** `emergency` services take precedence over a `helpline`. */
  readonly kind: 'helpline' | 'emergency';
}

/** A country this product knows crisis numbers for. */
export type CountryCode = 'CA' | 'IN';

/** Countries with helplines, and the one a new account is assumed to be in. */
export const COUNTRIES = ['CA', 'IN'] as const satisfies readonly CountryCode[];

export const DEFAULT_COUNTRY: CountryCode = 'CA';

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRIES as readonly string[]).includes(value);
}

/**
 * Helplines for Canada, the first market.
 *
 * 9-8-8 is Canada's national suicide crisis line — one number, phone and text,
 * bilingual, every day. Quebec is listed separately because it answers through
 * 1-866-APPELLE instead, which is not a nicety: somebody in Montreal dialling
 * the wrong one of those is the failure this screen exists to prevent, and a
 * screen that shows only the federal number is wrong for a quarter of the
 * country.
 *
 * Emergency is 911 here, not 112.
 *
 * **Not clinically reviewed.** The numbers are verifiable and were checked
 * against the services' own pages; what needs a clinician is the wording, the
 * order they appear in, and whether a national line and a provincial one
 * should sit on one screen at all. That question is in
 * `docs/clinical-review/RISK-SCREEN-REVIEW.md`.
 */
export const HELPLINES_CA: readonly Helpline[] = [
  {
    name: 'Suicide Crisis Helpline',
    number: '988',
    detail: 'Call or text · 24 hours · Canada',
    country: 'CA',
    kind: 'helpline',
  },
  {
    name: 'Québec — 1-866-APPELLE',
    number: '1-866-277-3553',
    detail: 'Call · 24 hours · Québec',
    country: 'CA',
    kind: 'helpline',
  },
  {
    name: 'Emergency',
    number: '911',
    detail: 'If you are in danger now',
    country: 'CA',
    kind: 'emergency',
  },
];

/**
 * Helplines for India, the second market.
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

/**
 * Returns the helplines for a country, or an empty list if none are known.
 *
 * Still an empty list for an unknown country, and still deliberately: a
 * plausible-looking wrong crisis number is worse than none. What changed is
 * that Canada is now a country this knows, because it is the first market —
 * before that, a Canadian in crisis saw a pause screen with no number on it.
 */
export function helplinesFor(country: string): readonly Helpline[] {
  if (country === 'CA') return HELPLINES_CA;
  if (country === 'IN') return HELPLINES_IN;

  return [];
}
