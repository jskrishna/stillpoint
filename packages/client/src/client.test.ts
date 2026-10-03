import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import { pageQuery, type Fetch, type FetchInit } from './http.js';
import { cachedTokens, memoryTokens } from './tokens.js';
import { createClient } from './client.js';
import type { ApiJournalEntry, Page } from './index.js';

interface Call {
  readonly url: string;
  readonly init: FetchInit;
}

/** A `fetch` that answers from a script and records what it was asked. */
function stub(answers: readonly { status: number; body: unknown }[]): {
  fetch: Fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let next = 0;

  const fetch: Fetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(next, answers.length - 1)] ?? { status: 200, body: {} };
    next += 1;
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      statusText: `status ${String(answer.status)}`,
      text: () => Promise.resolve(answer.body === undefined ? '' : JSON.stringify(answer.body)),
    });
  };

  return { fetch, calls };
}

function clientWith(answers: readonly { status: number; body: unknown }[], token?: string) {
  const { fetch, calls } = stub(answers);
  const tokens = memoryTokens(token ?? null);
  return { api: createClient({ baseUrl: 'https://api.test/api', tokens, fetch }), calls, tokens };
}

describe('the request', () => {
  it('sends the token it is holding', async () => {
    const { api, calls } = clientWith([{ status: 200, body: { id: 1 } }], 'abc123');

    await api.me();

    expect(calls[0]?.url).toBe('https://api.test/api/me');
    expect(calls[0]?.init.headers['Authorization']).toBe('Bearer abc123');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('sends no token on the routes that cannot have one', async () => {
    const { api, calls } = clientWith(
      [{ status: 200, body: { token: 't', user: {} } }],
      'already-signed-in',
    );

    await api.login('someone@example.com', 'a password');

    expect(calls[0]?.init.headers['Authorization']).toBeUndefined();
  });

  it('sends a content type only when there is a body', async () => {
    const { api, calls } = clientWith([
      { status: 200, body: {} },
      { status: 200, body: {} },
    ]);

    await api.me();
    await api.consent(['terms']);

    expect(calls[0]?.init.headers['Content-Type']).toBeUndefined();
    expect(calls[1]?.init.headers['Content-Type']).toBe('application/json');
    expect(calls[1]?.init.body).toBe(JSON.stringify({ accepted: ['terms'] }));
  });

  it('turns a refusal into an ApiError carrying the field errors', async () => {
    const { api } = clientWith([
      {
        status: 422,
        body: { message: 'That did not validate.', errors: { email: ['Already taken.'] } },
      },
    ]);

    await expect(api.register('A', 'a@b.test', 'pw')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'That did not validate.',
      errors: { email: ['Already taken.'] },
    });
  });

  it('knows a 401 from a 409, because the screens answer them differently', async () => {
    const { api } = clientWith([{ status: 401, body: { message: 'Unauthenticated.' } }]);

    const error = await api.me().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isUnauthenticated).toBe(true);
    expect((error as ApiError).isConflict).toBe(false);
  });

  it('falls back to the status line when the body says nothing', async () => {
    const { api } = clientWith([{ status: 500, body: {} }]);

    await expect(api.me()).rejects.toMatchObject({ message: 'status 500' });
  });

  it('reads a 204 as nothing rather than failing to parse it', async () => {
    const { api } = clientWith([{ status: 204, body: undefined }]);

    await expect(api.deleteJournalEntry('1')).resolves.toBeUndefined();
  });

  it('reads a bare array as a list, and anything else as an empty one', async () => {
    const { api } = clientWith([{ status: 200, body: [{ id: '1' }, { id: '2' }] }]);
    expect(await api.coachClients()).toHaveLength(2);

    const { api: other } = clientWith([{ status: 200, body: { nope: true } }]);
    expect(await other.coachClients()).toEqual([]);
  });
});

describe('the token', () => {
  it('is kept by signing in, and dropped by signing out', async () => {
    const { api, tokens } = clientWith([
      { status: 200, body: { token: 'fresh', user: {} } },
      { status: 204, body: undefined },
    ]);

    expect(api.hasToken()).toBe(false);
    await api.login('a@b.test', 'pw');
    expect(tokens.read()).toBe('fresh');
    expect(api.hasToken()).toBe(true);

    await api.logout();
    expect(api.hasToken()).toBe(false);
  });

  it('is dropped even when signing out fails', async () => {
    const { api } = clientWith([{ status: 500, body: {} }], 'stale');

    await expect(api.logout()).rejects.toBeInstanceOf(ApiError);

    // Whatever the server managed to say, this surface is signed out: a token
    // it keeps after the user asked to leave is worse than a lost round trip.
    expect(api.hasToken()).toBe(false);
  });

  it('is dropped by erasing the account', async () => {
    const { api } = clientWith([{ status: 200, body: { removed: { sessions: 2 } } }], 'live');

    expect(await api.deleteAccount('pw', 'DELETE')).toEqual({ sessions: 2 });
    expect(api.hasToken()).toBe(false);
  });

  it('is not sent, and not asked for, by a reset', async () => {
    const { api, calls } = clientWith(
      [
        { status: 200, body: { message: 'If that address has an account…' } },
        { status: 200, body: { message: 'Your password is changed.' } },
      ],
      'held',
    );

    await api.forgotPassword('a@b.test');
    await api.resetPassword('a@b.test', 'tok', 'new password');

    expect(calls[0]?.init.headers['Authorization']).toBeUndefined();
    expect(calls[1]?.init.headers['Authorization']).toBeUndefined();
    // A reset revokes every token server-side, so keeping this one would only
    // mean holding something that no longer works. It is the screen that
    // clears it, by sending the user back to sign in.
    expect(api.hasToken()).toBe(true);
  });
});

describe('a cached token store', () => {
  it('answers null until it is hydrated', async () => {
    const written: (string | null)[] = [];
    const { store, hydrate } = cachedTokens((t) => {
      written.push(t);
      return Promise.resolve();
    });

    expect(store.read()).toBe(null);
    await hydrate(() => Promise.resolve('from-the-keychain'));
    expect(store.read()).toBe('from-the-keychain');

    store.write('newer');
    expect(store.read()).toBe('newer');
    expect(written).toEqual(['newer']);
  });

  it('treats a medium that will not read as no token, not as an error', async () => {
    const { store, hydrate } = cachedTokens(() => Promise.resolve());

    await expect(
      hydrate(() => Promise.reject(new Error('keychain locked'))),
    ).resolves.toBeUndefined();
    expect(store.read()).toBe(null);
  });

  it('survives a medium that will not write', () => {
    const { store } = cachedTokens(() => Promise.reject(new Error('keychain locked')));

    expect(() => {
      store.write('a token');
    }).not.toThrow();
    // In memory for this run is the fallback: it is worth more than refusing
    // to sign someone in.
    expect(store.read()).toBe('a token');
  });
});

describe('paging', () => {
  it('builds a query only from what it was given', () => {
    expect(pageQuery()).toBe('');
    expect(pageQuery(20)).toBe('?limit=20');
    expect(pageQuery(undefined, 'abc')).toBe('?cursor=abc');
    expect(pageQuery(20, 'abc')).toBe('?limit=20&cursor=abc');
    expect(pageQuery(20, null)).toBe('?limit=20');
  });

  it('escapes a cursor, which is opaque and not guaranteed to be url-safe', () => {
    expect(pageQuery(undefined, 'a b&c=d')).toBe('?cursor=a%20b%26c%3Dd');
  });

  it('walks every page of the journal', async () => {
    const page = (items: number, nextCursor: string | null): Page<Partial<ApiJournalEntry>> => ({
      items: Array.from({ length: items }, (_, i) => ({ id: `${String(i)}` })),
      nextCursor,
      total: 7,
    });
    const { api, calls } = clientWith([
      { status: 200, body: page(3, 'c1') },
      { status: 200, body: page(3, 'c2') },
      { status: 200, body: page(1, null) },
    ]);

    expect(await api.wholeJournal()).toHaveLength(7);
    expect(calls).toHaveLength(3);
    expect(calls[1]?.url).toContain('cursor=c1');
  });

  it('stops on an empty page even when the cursor says otherwise', async () => {
    // A server that keeps handing back a cursor with nothing in the page would
    // otherwise spin forever, and this runs during "export my data".
    const { api, calls } = clientWith([
      { status: 200, body: { items: [], nextCursor: 'forever', total: 0 } },
    ]);

    expect(await api.wholeJournal()).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('the paths', () => {
  it('advances a session only through the turns route', async () => {
    const { api, calls } = clientWith([{ status: 200, body: { id: 's1' } }], 'tok');

    await api.takeTurn('s1', 'I am upset');

    expect(calls[0]?.url).toBe('https://api.test/api/sessions/s1/turns');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ utterance: 'I am upset' }));
  });

  it('asks for the open session before starting one', async () => {
    const { api, calls } = clientWith([{ status: 200, body: { id: 's1' } }], 'tok');

    await api.currentSession();

    expect(calls[0]?.url).toBe('https://api.test/api/sessions/current');
  });

  it('reads "no open session" as null rather than as a session', async () => {
    const { api } = clientWith([{ status: 200, body: null }], 'tok');

    expect(await api.currentSession()).toBe(null);
  });

  it('keeps the status and the paging apart in the safety queue', async () => {
    const { api, calls } = clientWith(
      [{ status: 200, body: { items: [], nextCursor: null, total: 0 } }],
      'tok',
    );

    await api.safetyFlags('all', 50, 'cur');

    expect(calls[0]?.url).toBe(
      'https://api.test/api/admin/safety-flags?status=all&limit=50&cursor=cur',
    );
  });

  it('builds the account search without a stray separator', async () => {
    const answer = { status: 200, body: { items: [], nextCursor: null, total: 0, adminCount: 1 } };
    const { api, calls } = clientWith([answer, answer, answer], 'tok');

    await api.adminUsers();
    await api.adminUsers({ q: 'a b' });
    await api.adminUsers({ role: 'coach' }, 10, 'cur');

    expect(calls[0]?.url).toBe('https://api.test/api/admin/users');
    expect(calls[1]?.url).toBe('https://api.test/api/admin/users?q=a%20b');
    expect(calls[2]?.url).toBe('https://api.test/api/admin/users?role=coach&limit=10&cursor=cur');
  });

  it('reads an invitation without a token, because its holder has no account', async () => {
    const { api, calls } = clientWith([{ status: 200, body: { coachName: 'A' } }]);

    await api.invitation('some-token');

    expect(calls[0]?.url).toBe('https://api.test/api/invites/some-token');
    expect(calls[0]?.init.headers['Authorization']).toBeUndefined();
  });
});

describe('walking every page', () => {
  /** One page of a journal, with whatever cursor the server claims is next. */
  const page = (ids: readonly string[], nextCursor: string | null): Page<ApiJournalEntry> => ({
    items: ids.map((id) => ({ id }) as ApiJournalEntry),
    nextCursor,
    total: 99,
  });

  it('walks until the cursor runs out', async () => {
    const { api, calls } = clientWith([
      { status: 200, body: page(['a', 'b'], 'c1') },
      { status: 200, body: page(['c'], null) },
    ]);

    const all = await api.wholeJournal();

    expect(all.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
  });

  it('stops on an empty page whatever the cursor says', async () => {
    const { api, calls } = clientWith([
      { status: 200, body: page(['a'], 'c1') },
      { status: 200, body: page([], 'c2') },
    ]);

    await expect(api.wholeJournal()).resolves.toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('stops when the cursor stops advancing', async () => {
    // A server that keeps answering with the cursor it was given. The page is
    // not empty, so the check above does not catch it: without a guard this
    // re-reads the same rows forever and grows the array until the tab dies —
    // on the one call that walks every page somebody has.
    //
    // The stub gives up after a few pages rather than answering forever,
    // because without the guard this loop cannot be interrupted: nothing
    // yields, so a test timeout never fires and the run hangs until whatever
    // is above it gives up. A thrown error says what happened; a hung CI job
    // does not.
    let served = 0;
    const fetch: Fetch = () => {
      served += 1;
      if (served > 5) throw new Error('everyPage did not stop: the cursor never advanced');

      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'status 200',
        text: () => Promise.resolve(JSON.stringify(page([`row-${String(served)}`], 'stuck'))),
      });
    };
    const api = createClient({ baseUrl: 'https://api.test/api', tokens: memoryTokens('t'), fetch });

    const all = await api.wholeJournal();

    expect(all.map((e) => e.id)).toEqual(['row-1', 'row-2']);
    expect(served).toBe(2);
  });
});
