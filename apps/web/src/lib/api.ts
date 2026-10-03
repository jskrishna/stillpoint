/**
 * The Stillpoint API client.
 *
 * Every call that changes a session goes through here, which means it goes
 * through the server — safety screening happens there, not in this browser.
 *
 * ## The token, and its known weakness
 *
 * The bearer token is kept in `localStorage` so a reload does not sign the user
 * out. That is readable by any script running on the page, so an XSS becomes a
 * stolen session. The right answer for production is Sanctum's cookie mode: an
 * httpOnly cookie the page cannot read. This is a deliberate, documented
 * shortcut, not an opinion that it is fine.
 */

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000/api';
const TOKEN_KEY = 'stillpoint.token.v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Laravel's field errors, when the failure was validation. */
    readonly errors: Record<string, string[]> = {},
    /** Anything else the body carried, e.g. which consent items are missing. */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** The session has already ended; the client is behind. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked. The token stays in memory for this page only.
  }
}

export function hasToken(): boolean {
  return readToken() !== null;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Set for sign-in and registration, which have no token yet. */
  readonly anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = anonymous ? null : readToken();
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed: unknown = text === '' ? {} : JSON.parse(text);
  const payload = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof payload['message'] === 'string' ? payload['message'] : response.statusText;
    const errors = (payload['errors'] ?? {}) as Record<string, string[]>;
    throw new ApiError(message, response.status, errors, payload);
  }

  return payload as T;
}

/**
 * A collection endpoint. Resource responses carry no `data` envelope (see
 * AppServiceProvider), so a list arrives as a bare JSON array.
 */
async function requestList<T>(path: string): Promise<readonly T[]> {
  const result = await request<unknown>(path);
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * A page of a collection.
 *
 * The journal and the safety queue are paged, so they have somewhere to put a
 * cursor; everything else is a bare list. Cursor rather than offset: both are
 * ordered by time and grow at the top, and an offset page repeats or skips a
 * row when something is inserted between two requests.
 */
export interface Page<T> {
  readonly items: readonly T[];
  /** Pass back as `cursor`. `null` once there is nothing older. */
  readonly nextCursor: string | null;
  /** The whole collection, not the page. */
  readonly total: number;
}

function pageQuery(limit?: number, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (cursor !== undefined && cursor !== null) params.set('cursor', cursor);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** Walks every page of a paged endpoint. For an export, not for a screen. */
async function everyPage<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
): Promise<readonly T[]> {
  const all: T[] = [];
  let cursor: string | null = null;

  do {
    const page: Page<T> = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    // A cursor that does not advance would spin forever; an empty page means
    // there is nothing more to walk whatever the cursor says.
    if (page.items.length === 0) break;
  } while (cursor !== null);

  return all;
}

/* ---------------------------------------------------------------- types */

export interface Profile {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly plan: string;
  /** 'user', 'coach' or 'admin'. Nobody is staff by registering. */
  readonly role: string;
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

/* -------------------------------------------------------------- the API */

export const api = {
  async register(name: string, email: string, password: string): Promise<Profile> {
    const result = await request<{ token: string; user: Profile }>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      anonymous: true,
    });
    storeToken(result.token);
    return result.user;
  },

  async login(email: string, password: string): Promise<Profile> {
    const result = await request<{ token: string; user: Profile }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    });
    storeToken(result.token);
    return result.user;
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/auth/logout', { method: 'POST' });
    } finally {
      // Whatever the server said, this browser is signed out.
      storeToken(null);
    }
  },

  me: () => request<Profile>('/me'),

  updateMe: (changes: Partial<Pick<Profile, 'guideVoice' | 'talkMode' | 'coachSharing'>>) =>
    request<Profile>('/me', { method: 'PATCH', body: changes }),

  consent: (accepted: readonly string[]) =>
    request<Profile>('/me/consent', { method: 'POST', body: { accepted } }),

  startSession: (kind: 'full' | 'quick' = 'full') =>
    request<ApiSession>('/sessions', { method: 'POST', body: { kind } }),

  session: (id: string) => request<ApiSession>(`/sessions/${id}`),

  /** The only way to advance a session, and so the only path safety covers. */
  takeTurn: (id: string, utterance: string) =>
    request<ApiSession>(`/sessions/${id}/turns`, { method: 'POST', body: { utterance } }),

  stopSession: (id: string) => request<ApiSession>(`/sessions/${id}/stop`, { method: 'POST' }),

  rateSession: (id: string, rating: 'yes' | 'a_little' | 'no') =>
    request<ApiSession>(`/sessions/${id}/rating`, { method: 'POST', body: { rating } }),

  journal: (limit?: number, cursor?: string | null) =>
    request<Page<ApiJournalEntry>>(`/journal${pageQuery(limit, cursor)}`),

  /** Every entry, page by page. For "Export my data", not for a screen. */
  wholeJournal: () => everyPage<ApiJournalEntry>((cursor) => api.journal(100, cursor)),

  journalEntry: (id: string) => request<ApiJournalEntry>(`/journal/${id}`),

  updateJournalEntry: (id: string, changes: { note?: string | null; sharedWithCoach?: boolean }) =>
    request<ApiJournalEntry>(`/journal/${id}`, { method: 'PATCH', body: changes }),

  deleteJournalEntry: (id: string) => request<void>(`/journal/${id}`, { method: 'DELETE' }),

  insights: () => request<ApiInsights>('/insights'),

  /* ------------------------------------------------------- admin console */

  adminOverview: () => request<ApiAdminOverview>('/admin/overview'),

  adminUsers: (
    search: { q?: string; role?: string } = {},
    limit?: number,
    cursor?: string | null,
  ) => {
    const params = new URLSearchParams();
    if (search.q !== undefined && search.q !== '') params.set('q', search.q);
    if (search.role !== undefined && search.role !== '') params.set('role', search.role);
    if (limit !== undefined) params.set('limit', String(limit));
    if (cursor !== undefined && cursor !== null) params.set('cursor', cursor);
    const query = params.toString();

    return request<Page<ApiAdminUser> & { adminCount: number }>(
      `/admin/users${query === '' ? '' : `?${query}`}`,
    );
  },

  /** Refused for your own account, and for the last admin. */
  setUserRole: (id: string, role: string) =>
    request<ApiAdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: { role } }),

  roleChanges: (limit?: number, cursor?: string | null) =>
    request<Page<ApiRoleChange>>(`/admin/role-changes${pageQuery(limit, cursor)}`),

  /** Open flags by default; 'all' to include the reviewed ones. */
  safetyFlags: (
    status: 'open' | 'reviewed' | 'all' = 'open',
    limit?: number,
    cursor?: string | null,
  ) =>
    request<Page<ApiSafetyFlag>>(
      `/admin/safety-flags?status=${status}${pageQuery(limit, cursor).replace('?', '&')}`,
    ),

  reviewSafetyFlag: (id: string) =>
    request<ApiSafetyFlag>(`/admin/safety-flags/${id}/review`, { method: 'POST' }),

  protocolVersions: () =>
    request<{ live: ApiProtocolVersion; draft: ApiProtocolVersion | null }>(
      '/admin/protocol-versions',
    ),

  /** Opens a draft from the live version, or returns the one already open. */
  openProtocolDraft: () =>
    request<ApiProtocolVersion>('/admin/protocol-versions/draft', { method: 'POST' }),

  editProtocolStep: (stepId: string, edit: ApiStepEdit) =>
    request<ApiProtocolVersion>(`/admin/protocol-versions/draft/steps/${stepId}`, {
      method: 'PATCH',
      body: edit,
    }),

  editProtocolSafety: (wording: { pauseTitle?: string; pauseBody?: string }) =>
    request<ApiProtocolVersion>('/admin/protocol-versions/draft/safety', {
      method: 'PATCH',
      body: wording,
    }),

  /** Refused with 409-like 422 and a `problems` list when the draft is incomplete. */
  publishProtocolDraft: () =>
    request<ApiProtocolVersion>('/admin/protocol-versions/draft/publish', { method: 'POST' }),

  /* --------------------------------------------------------- coach portal */

  coachClients: () => requestList<ApiClient>('/coach/clients'),

  coachClient: (id: string) => request<ApiClientDetail>(`/coach/clients/${id}`),

  updateCoachClient: (
    id: string,
    changes: { coachNotes?: string | null; nextCallAt?: string | null },
  ) => request<ApiClientDetail>(`/coach/clients/${id}`, { method: 'PATCH', body: changes }),

  coachInvites: () => requestList<ApiCoachInvite>('/coach/invites'),

  inviteClient: (email: string) =>
    request<ApiCoachInvite>('/coach/invites', { method: 'POST', body: { email } }),

  withdrawInvite: (id: string) =>
    request<ApiCoachInvite>(`/coach/invites/${id}`, { method: 'DELETE' }),

  /* ------------------------------------------------------------ invitations */

  /** Readable without an account: whoever holds the link has not signed in. */
  invitation: (token: string) => request<ApiInvitation>(`/invites/${token}`, { anonymous: true }),

  /** Accepting is what creates the pairing, and only the client can do it. */
  acceptInvitation: (token: string) =>
    request<{ coachName: string; acceptedAt: string | null }>(`/invites/${token}/accept`, {
      method: 'POST',
    }),

  /* ------------------------------ who can read my shared sessions, and ending it */

  myCoaches: () => requestList<ApiMyCoach>('/me/coaches'),

  /** Immediate, and the user's alone. A coach cannot do this for them. */
  endCoaching: (coachId: string) => request<void>(`/me/coaches/${coachId}`, { method: 'DELETE' }),
};
