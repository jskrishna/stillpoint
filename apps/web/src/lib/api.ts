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

  journal: () => requestList<ApiJournalEntry>('/journal'),

  journalEntry: (id: string) => request<ApiJournalEntry>(`/journal/${id}`),

  updateJournalEntry: (id: string, changes: { note?: string | null; sharedWithCoach?: boolean }) =>
    request<ApiJournalEntry>(`/journal/${id}`, { method: 'PATCH', body: changes }),

  deleteJournalEntry: (id: string) => request<void>(`/journal/${id}`, { method: 'DELETE' }),

  insights: () => request<ApiInsights>('/insights'),

  /* ------------------------------------------------------- admin console */

  adminOverview: () => request<ApiAdminOverview>('/admin/overview'),

  /** Open flags by default; 'all' to include the reviewed ones. */
  safetyFlags: (status: 'open' | 'reviewed' | 'all' = 'open') =>
    requestList<ApiSafetyFlag>(`/admin/safety-flags?status=${status}`),

  reviewSafetyFlag: (id: string) =>
    request<ApiSafetyFlag>(`/admin/safety-flags/${id}/review`, { method: 'POST' }),
};
