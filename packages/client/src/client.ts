import { pageQuery, transportFor, type ClientConfig, type Page } from './http.js';
import type {
  ApiAdminOverview,
  ApiAdminUser,
  ApiClient,
  ApiClientDetail,
  ApiCoachInvite,
  ApiInsights,
  ApiInvitation,
  ApiJournalEntry,
  ApiMyCoach,
  ApiPlanChange,
  ApiProtocolVersion,
  ApiRoleChange,
  ApiSafetyFlag,
  ApiSession,
  ApiStepEdit,
  Profile,
} from './types.js';

/**
 * The Stillpoint API client.
 *
 * Every call that changes a session goes through here, which means it goes
 * through the server — safety screening happens there, not on the client. The
 * copy of the protocol in `@stillpoint/protocol` is for showing someone where
 * they are; it is never the enforcement.
 *
 * One client for every surface, on purpose. The web app, a phone and a desktop
 * shell all speak to the same API, and three hand-written clients would be
 * three sets of field names drifting apart — the same failure the TypeScript
 * and PHP copies of the protocol have a parity check to prevent. What differs
 * between surfaces is where the token lives and what the base URL is, and both
 * are arguments.
 */
export function createClient(config: ClientConfig) {
  const t = transportFor(config);
  const { tokens } = config;

  const journal = (limit?: number, cursor?: string | null) =>
    t.request<Page<ApiJournalEntry>>(`/journal${pageQuery(limit, cursor)}`);

  return {
    /** Whether this surface is holding a token. Not whether it still works. */
    hasToken: (): boolean => tokens.read() !== null,

    /**
     * Puts a token in the store, or clears it.
     *
     * Public because signing out has to be possible without a round trip: a
     * 401 from anywhere means the token this surface holds is no longer worth
     * keeping, whatever the server is able to say about it.
     */
    storeToken: (token: string | null): void => {
      tokens.write(token);
    },

    async register(name: string, email: string, password: string): Promise<Profile> {
      const result = await t.request<{ token: string; user: Profile }>('/auth/register', {
        method: 'POST',
        body: { name, email, password },
        anonymous: true,
      });
      tokens.write(result.token);
      return result.user;
    },

    async login(email: string, password: string): Promise<Profile> {
      const result = await t.request<{ token: string; user: Profile }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        anonymous: true,
      });
      tokens.write(result.token);
      return result.user;
    },

    /**
     * Asks for a reset link.
     *
     * Answers the same whether or not the address has an account, and never
     * returns the link: anyone could ask, so the only safe place for it is the
     * inbox it was sent to.
     */
    forgotPassword: (email: string) =>
      t.request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        anonymous: true,
      }),

    /** Sets a new password from a token, and signs out everywhere else. */
    resetPassword: (email: string, token: string, password: string) =>
      t.request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: { email, token, password },
        anonymous: true,
      }),

    async logout(): Promise<void> {
      try {
        await t.request<void>('/auth/logout', { method: 'POST' });
      } finally {
        // Whatever the server said, this browser is signed out.
        tokens.write(null);
      }
    },

    me: () => t.request<Profile>('/me'),

    updateMe: (changes: Partial<Pick<Profile, 'guideVoice' | 'talkMode' | 'coachSharing'>>) =>
      t.request<Profile>('/me', { method: 'PATCH', body: changes }),

    consent: (accepted: readonly string[]) =>
      t.request<Profile>('/me/consent', { method: 'POST', body: { accepted } }),

    startSession: (kind: 'full' | 'quick' = 'full') =>
      t.request<ApiSession>('/sessions', { method: 'POST', body: { kind } }),

    session: (id: string) => t.request<ApiSession>(`/sessions/${id}`),

    /**
     * The session this user is in the middle of, or `null`.
     *
     * Asked first, so that closing a tab does not lose a session: it stays open
     * on the server, and a free plan has already spent one of its three on it.
     */
    currentSession: async (): Promise<ApiSession | null> => {
      const result = await t.request<unknown>('/sessions/current');
      // The server answers `null` for "none open", which `request` hands back as
      // an empty object rather than null.
      return result !== null && typeof result === 'object' && 'id' in result
        ? (result as ApiSession)
        : null;
    },

    /**
     * The only way to advance a session, and so the only path safety covers.
     *
     * `step` is the id of the step this answer is for — `session.step?.id`,
     * the step the screen was showing when the user answered. It is required
     * rather than optional so that no surface can quietly stop sending it: a
     * client that does not say which question it answered will have a retried
     * turn recorded against the *next* step, whose real answer is then never
     * asked for. A lost response is not a lost turn, and on mobile data
     * responses get lost.
     *
     * The server refuses a step that has moved on with a 409, **after**
     * screening what was said — so a stale answer that discloses a crisis
     * still stops the session. Pass `null` only when there genuinely is no
     * step to name.
     */
    takeTurn: (id: string, utterance: string, step: string | null) =>
      t.request<ApiSession>(`/sessions/${id}/turns`, {
        method: 'POST',
        body: step === null ? { utterance } : { utterance, step },
      }),

    stopSession: (id: string) => t.request<ApiSession>(`/sessions/${id}/stop`, { method: 'POST' }),

    rateSession: (id: string, rating: 'yes' | 'a_little' | 'no') =>
      t.request<ApiSession>(`/sessions/${id}/rating`, { method: 'POST', body: { rating } }),

    journal,

    /** Every entry, page by page. For "Export my data", not for a screen. */
    wholeJournal: () => t.everyPage<ApiJournalEntry>((cursor) => journal(100, cursor)),

    journalEntry: (id: string) => t.request<ApiJournalEntry>(`/journal/${id}`),

    updateJournalEntry: (
      id: string,
      changes: { note?: string | null; sharedWithCoach?: boolean },
    ) => t.request<ApiJournalEntry>(`/journal/${id}`, { method: 'PATCH', body: changes }),

    deleteJournalEntry: (id: string) => t.request<void>(`/journal/${id}`, { method: 'DELETE' }),

    insights: () => t.request<ApiInsights>('/insights'),

    /* ------------------------------------------------------- admin console */

    adminOverview: () => t.request<ApiAdminOverview>('/admin/overview'),

    adminUsers: (
      search: { q?: string; role?: string } = {},
      limit?: number,
      cursor?: string | null,
    ) => {
      const parts: string[] = [];
      if (search.q !== undefined && search.q !== '')
        parts.push(`q=${encodeURIComponent(search.q)}`);
      if (search.role !== undefined && search.role !== '')
        parts.push(`role=${encodeURIComponent(search.role)}`);
      const filters = parts.length === 0 ? '' : parts.join('&');
      const paging = pageQuery(limit, cursor).replace('?', '');
      const query = [filters, paging].filter((s) => s !== '').join('&');

      return t.request<Page<ApiAdminUser> & { adminCount: number }>(
        `/admin/users${query === '' ? '' : `?${query}`}`,
      );
    },

    /** Refused for your own account, and for the last admin. */
    setUserRole: (id: string, role: string) =>
      t.request<ApiAdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: { role } }),

    roleChanges: (limit?: number, cursor?: string | null) =>
      t.request<Page<ApiRoleChange>>(`/admin/role-changes${pageQuery(limit, cursor)}`),

    /**
     * Grants a plan. Not a purchase — there is no billing in this product, and
     * this route is the only reason Plus and Coach are reachable at all.
     * Refused for your own account.
     */
    setUserPlan: (id: string, plan: string) =>
      t.request<ApiAdminUser>(`/admin/users/${id}/plan`, { method: 'PATCH', body: { plan } }),

    planChanges: (limit?: number, cursor?: string | null) =>
      t.request<Page<ApiPlanChange>>(`/admin/plan-changes${pageQuery(limit, cursor)}`),

    /** Open flags by default; 'all' to include the reviewed ones. */
    safetyFlags: (
      status: 'open' | 'reviewed' | 'all' = 'open',
      limit?: number,
      cursor?: string | null,
    ) =>
      t.request<Page<ApiSafetyFlag>>(
        `/admin/safety-flags?status=${status}${pageQuery(limit, cursor).replace('?', '&')}`,
      ),

    reviewSafetyFlag: (id: string) =>
      t.request<ApiSafetyFlag>(`/admin/safety-flags/${id}/review`, { method: 'POST' }),

    protocolVersions: () =>
      t.request<{ live: ApiProtocolVersion; draft: ApiProtocolVersion | null }>(
        '/admin/protocol-versions',
      ),

    /** Opens a draft from the live version, or returns the one already open. */
    openProtocolDraft: () =>
      t.request<ApiProtocolVersion>('/admin/protocol-versions/draft', { method: 'POST' }),

    editProtocolStep: (stepId: string, edit: ApiStepEdit) =>
      t.request<ApiProtocolVersion>(`/admin/protocol-versions/draft/steps/${stepId}`, {
        method: 'PATCH',
        body: edit,
      }),

    editProtocolSafety: (wording: { pauseTitle?: string; pauseBody?: string }) =>
      t.request<ApiProtocolVersion>('/admin/protocol-versions/draft/safety', {
        method: 'PATCH',
        body: wording,
      }),

    /** Refused with 409-like 422 and a `problems` list when the draft is incomplete. */
    publishProtocolDraft: () =>
      t.request<ApiProtocolVersion>('/admin/protocol-versions/draft/publish', { method: 'POST' }),

    /* --------------------------------------------------------- coach portal */

    coachClients: () => t.list<ApiClient>('/coach/clients'),

    coachClient: (id: string) => t.request<ApiClientDetail>(`/coach/clients/${id}`),

    updateCoachClient: (
      id: string,
      changes: { coachNotes?: string | null; nextCallAt?: string | null },
    ) => t.request<ApiClientDetail>(`/coach/clients/${id}`, { method: 'PATCH', body: changes }),

    coachInvites: () => t.list<ApiCoachInvite>('/coach/invites'),

    inviteClient: (email: string) =>
      t.request<ApiCoachInvite>('/coach/invites', { method: 'POST', body: { email } }),

    withdrawInvite: (id: string) =>
      t.request<ApiCoachInvite>(`/coach/invites/${id}`, { method: 'DELETE' }),

    /* ------------------------------------------------------------ invitations */

    /** Readable without an account: whoever holds the link has not signed in. */
    invitation: (token: string) =>
      t.request<ApiInvitation>(`/invites/${token}`, { anonymous: true }),

    /** Accepting is what creates the pairing, and only the client can do it. */
    acceptInvitation: (token: string) =>
      t.request<{ coachName: string; acceptedAt: string | null }>(`/invites/${token}/accept`, {
        method: 'POST',
      }),

    /* ------------------------------ who can read my shared sessions, and ending it */

    myCoaches: () => t.list<ApiMyCoach>('/me/coaches'),

    /** Immediate, and the user's alone. A coach cannot do this for them. */
    endCoaching: (coachId: string) =>
      t.request<void>(`/me/coaches/${coachId}`, { method: 'DELETE' }),

    /* --------------------------------------------------- erasing the account */

    /** What a user types to confirm. Matches the server's own constant. */
    DELETE_CONFIRMATION: 'DELETE',

    /**
     * Erases the account and everything it owns. Not reversible.
     *
     * Guarded by the password rather than a checkbox: it takes the most personal
     * text the product holds with it, and a password is the one thing somebody
     * who is not the owner does not have.
     */
    deleteAccount: async (password: string, confirm: string): Promise<Record<string, number>> => {
      const result = await t.request<{ removed: Record<string, number> }>('/me', {
        method: 'DELETE',
        body: { password, confirm },
      });
      // Whatever the server said, this browser is signed out.
      tokens.write(null);
      return result.removed;
    },
  };
}

/** Every call the API answers, bound to one surface's URL and token store. */
export type StillpointClient = ReturnType<typeof createClient>;
