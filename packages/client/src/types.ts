/**
 * What the API answers with.
 *
 * Every field here mirrors a Laravel resource in `apps/api/app/Http/Resources`.
 * These are the server's words, not the domain's: the domain lives in
 * `@stillpoint/protocol`, and a screen that needs a rule asks that package,
 * not this one.
 */

export interface Profile {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly plan: string;
  /** 'user', 'coach' or 'admin'. Nobody is staff by registering. */
  readonly role: string;
  /** Full sessions the plan allows per week; `null` is unlimited. */
  readonly fullSessionsPerWeek: number | null;
  /** How many are left in the window; `null` when the plan does not limit. */
  readonly fullSessionsLeft: number | null;
  readonly country: string;
  readonly guideVoice: string;
  readonly talkMode: string;
  readonly coachSharing: string;
  readonly acceptedConsent: readonly string[];
  readonly hasRequiredConsent: boolean;
  readonly consentedAt: string | null;
}

export interface ApiSessionStep {
  readonly id: string;
  readonly name: string;
  readonly ordinal: number;
}

export interface ApiHelpline {
  readonly name: string;
  readonly number: string;
  readonly detail: string;
  readonly kind: string;
}

export interface ApiSession {
  readonly id: string;
  readonly kind: string;
  readonly step: ApiSessionStep | null;
  readonly stepCount: number;
  /**
   * Nothing has been said into this session yet.
   *
   * A screen needs it to tell the truth about what starting again costs:
   * `POST /sessions` hands an untouched session back rather than ending it and
   * charging a second allowance, so for one of these there is nothing to carry
   * on from and nothing to warn about.
   *
   * The server answers it, and a screen must not re-derive it from `data`: a
   * thin answer leaves `data` empty but has spent a guide turn, so a screen
   * doing its own arithmetic would call a used session empty and then charge
   * the user for a session it told them was free.
   */
  readonly untouched: boolean;
  readonly ended: boolean;
  readonly endReason: string | null;
  readonly say: string | null;
  readonly data: {
    readonly whatHappened: string | null;
    readonly feelings: readonly string[];
    readonly belief: string | null;
    readonly forgiveness: string | null;
    readonly title: string | null;
    readonly calmerRating: string | null;
  };
  /** Present only when the session stopped for safety. */
  readonly safety: {
    readonly title: string;
    readonly body: string;
    readonly helplines: readonly ApiHelpline[];
  } | null;
}

export interface ApiJournalEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly durationMinutes: number;
  readonly kind: string;
  readonly feelings: readonly string[];
  readonly whatHappened: string | null;
  readonly memory: { description: string; age?: number } | null;
  readonly belief: string | null;
  readonly forgiveness: string | null;
  readonly note: string | null;
  readonly calmerRating: string | null;
  readonly reachedFinalStep: boolean;
  readonly sharedWithCoach: boolean;
}

/**
 * A safety flag, as a reviewer sees it.
 *
 * `excerpt` is the user's own words at the moment they said they were not safe.
 * It only reaches this type for an admin, and the server answers 404 to anyone
 * else — including a coach.
 */
export interface ApiSafetyFlag {
  readonly id: string;
  readonly sessionId: string | null;
  /** A short opaque handle, not a name: the queue is for judging a flag. */
  readonly user: string;
  readonly level: string;
  readonly category: string;
  readonly categoryLabel: string;
  readonly excerpt: string;
  readonly outcome: string;
  readonly status: string;
  readonly raisedAt: string | null;
  readonly reviewedAt: string | null;
}

/** A coach's invitation, as the coach sees it. */
export interface ApiCoachInvite {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly usable: boolean;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  /**
   * The path to pass on. Returned because there is no mail driver yet; when
   * mail is wired the invite is sent and this stops coming back.
   */
  readonly link: string;
}

/**
 * An invitation, as whoever holds the link sees it.
 *
 * Deliberately thin: who is asking, and whether the link still works. Not
 * whether the address has an account — an invite is not a lookup tool.
 */
export interface ApiInvitation {
  readonly coachName: string;
  readonly email: string;
  readonly usable: boolean;
  readonly reason: string | null;
  readonly expiresAt: string;
}

/** A coach who can read this user's shared sessions, from the user's side. */
export interface ApiMyCoach {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: string;
  readonly since: string | null;
  /** How many of the user's sessions this coach can currently read. */
  readonly sharedSessions: number;
}

/** A session a client chose to share. */
export interface ApiSharedSession {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly durationMinutes: number;
  readonly kind: string;
  readonly feelings: readonly string[];
  readonly belief: string | null;
  readonly reachedFinalStep: boolean;
  readonly calmerRating: string | null;
  /** The client's own note. It travels with a session they chose to share. */
  readonly note: string | null;
}

/**
 * A client, as their coach sees them.
 *
 * Everything here is built through the sharing rule on the server. An unshared
 * session is not hidden from this type — it is absent from the response.
 */
export interface ApiClient {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly since: string | null;
  readonly nextCallAt: string | null;
  /** The coach's own notes. Never shown to the client. */
  readonly coachNotes: string | null;
  readonly sharedCount: number;
  readonly lastSharedAt: string | null;
  readonly recurringBelief: { belief: string; sessions: number } | null;
}

export interface ApiClientDetail extends ApiClient {
  readonly sharedSessions: readonly ApiSharedSession[];
  /**
   * Why the client might need their coach — that a session stopped for
   * safety, and when. Never what was said: those words are the safety
   * queue's, and a coach is not a reviewer.
   */
  readonly attention: readonly { reason: string; at: string }[];
}

/** An account, as the console administers it. Never any session content. */
export interface ApiAdminUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly plan: string;
  readonly joinedAt: string | null;
}

/** A record that somebody's role changed, and who changed it. */
export interface ApiRoleChange {
  readonly id: string;
  readonly userEmail: string;
  readonly changedByEmail: string | null;
  readonly fromRole: string;
  readonly toRole: string;
  readonly at: string | null;
}

/** One step of a protocol version, as the editor holds it. */
export interface ApiProtocolStep {
  readonly id: string;
  readonly ordinal: number;
  readonly name: string;
  readonly summary: string;
  readonly answerKind: string;
  /** `null` where the copy is still owed by the PRD, never invented. */
  readonly main: string | null;
  readonly backups: readonly string[];
  readonly doneWhen: string | null;
  readonly maxGuideTurns: number | null;
  readonly complete: boolean;
}

export interface ApiProtocolVersion {
  readonly label: string;
  readonly major: number;
  readonly minor: number;
  readonly status: string;
  readonly pauseTitle: string;
  readonly pauseBody: string;
  readonly publishedAt: string | null;
  readonly steps: readonly ApiProtocolStep[];
  /** What stands between this and going live. The server decides, not a screen. */
  readonly problems: readonly { stepId: string | null; reason: string }[];
  readonly publishable: boolean;
  readonly runnable: boolean;
}

export interface ApiStepEdit {
  readonly main?: string | null;
  readonly backups?: readonly string[];
  readonly doneWhen?: string | null;
  readonly maxGuideTurns?: number | null;
}

/** The console's figures. Aggregate only: it reads no personal text. */
export interface ApiAdminOverview {
  readonly windowDays: number;
  readonly sessions: number;
  readonly reachedFinalStepPct: number;
  readonly feltCalmerPct: number;
  readonly openFlags: number;
  /**
   * When the longest-waiting open flag was raised, or null when none is open.
   *
   * Not restricted to the window: a flag raised three weeks ago and still open
   * is precisely what this is for.
   */
  readonly oldestOpenFlagAt: string | null;
  /**
   * Sessions in the window where somebody said something the safety screen
   * could not read, and how many such turns in all.
   *
   * The screen has phrases in Latin and Devanagari and in nothing else, so an
   * utterance in any other Indian script is not screened. Nobody is flagged
   * for it; it is counted so the gap is a number rather than an inference.
   */
  readonly unreadableSessions: number;
  readonly unreadableTurns: number;
  /** How many of every 100 sessions reach each step, in protocol order. */
  readonly stepReach: readonly number[];
  readonly recentSessions: readonly {
    readonly user: string;
    readonly kind: string;
    readonly minutes: number;
    readonly reachedStep: number;
    readonly result: string;
  }[];
}

export interface ApiInsights {
  readonly windowDays: number;
  readonly sessions: number;
  readonly feltCalmer: number;
  readonly reachedFinalStep: number;
  readonly feelings: readonly { id: string; label: string; count: number }[];
  readonly recurringBelief: { belief: string; sessions: number } | null;
}
