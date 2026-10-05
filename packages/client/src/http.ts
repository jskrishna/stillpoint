import { ApiError } from './errors.js';
import type { TokenStore } from './tokens.js';

/** The shape of `fetch` this package needs — a window's, Node's or a stub. */
export type Fetch = (url: string, init: FetchInit) => Promise<FetchResponse>;

export interface FetchInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

export interface ClientConfig {
  /** Where the API lives, without a trailing slash, e.g. `…/api`. */
  readonly baseUrl: string;
  readonly tokens: TokenStore;
  /** Overridden in tests. Every surface this runs on has a global `fetch`. */
  readonly fetch?: Fetch;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Set for sign-in and registration, which have no token yet. */
  readonly anonymous?: boolean;
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

/**
 * A string with no half characters in it, as a `JSON.stringify` replacer.
 *
 * A JavaScript string can hold half of a surrogate pair: an emoji cut by a
 * field's length limit, a paste, or a keyboard's backspace. `JSON.stringify`
 * writes that half as an escape, and PHP's `json_decode` rejects the whole
 * body for it. Laravel then sees a request with no fields, so a turn was
 * answered 422 "The utterance field is required." and the risk screen never
 * read it. The server repairs such a body on the turns route; this is the
 * same repair at the source, for every route, so what is sent is something
 * every decoder agrees about. U+FFFD is what the half would have been drawn
 * as anyway.
 *
 * Without the `u` flag on purpose: the pattern has to see the two halves as
 * two units to tell a pair from a stray one.
 */
const HALF_PAIRS = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g;

function wholeCharacters(_key: string, value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(HALF_PAIRS, (found) => (found.length === 2 ? found : '\ufffd'))
    : value;
}

export function pageQuery(limit?: number, cursor?: string | null): string {
  const parts: string[] = [];
  if (limit !== undefined) parts.push(`limit=${encodeURIComponent(String(limit))}`);
  if (cursor !== undefined && cursor !== null) parts.push(`cursor=${encodeURIComponent(cursor)}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * The request machinery, bound to one base URL and one token store.
 *
 * `URLSearchParams` is deliberately not used here even though every target has
 * it: this package is consumed by React Native as well as by a browser, and
 * keeping the query building to string concatenation means one less global to
 * be surprised by.
 */
export interface Transport {
  readonly request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  /** A bare JSON array — resources carry no `data` envelope. */
  readonly list: <T>(path: string) => Promise<readonly T[]>;
  /** Walks every page of a paged endpoint. For an export, not for a screen. */
  readonly everyPage: <T>(
    fetchPage: (cursor: string | null) => Promise<Page<T>>,
  ) => Promise<readonly T[]>;
}

/**
 * A JSON object from a body, or an empty one.
 *
 * Only used on the refusal path — see `request()` for why a success is parsed
 * strictly instead.
 */
function objectOrEmpty(text: string): Record<string, unknown> {
  if (text === '') return {};

  try {
    const parsed: unknown = JSON.parse(text);

    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Not JSON at all: a proxy's HTML error page. The status is what matters.
    return {};
  }
}

export function transportFor(config: ClientConfig): Transport {
  const { baseUrl, tokens } = config;
  const doFetch: Fetch =
    config.fetch ?? ((url, init) => (globalThis.fetch as unknown as Fetch)(url, init));

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, anonymous = false } = options;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = anonymous ? null : tokens.read();
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;

    const response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body, wholeCharacters) }),
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();

    if (!response.ok) {
      /*
       * A refusal's body is parsed **defensively**, because not every refusal
       * comes from this application.
       *
       * The deployment is nginx in front of PHP-FPM, and nginx answers 502,
       * 504 and 413 with an HTML page. `JSON.parse` on that threw a
       * `SyntaxError` — before the status was ever looked at — so no
       * `ApiError` was constructed at all. Measured: 502, 504 and 413 each
       * came out as a `SyntaxError`, which made `describe()` say "Could not
       * reach Stillpoint. Check your connection and try again." about a
       * server that had answered, and made every status-based branch
       * unreachable: the 5xx sentence, `isUnauthenticated`, `isConflict`.
       *
       * PHP-FPM restarting is a deploy, so 502 is the ordinary case rather
       * than an exotic one.
       */
      const payload = objectOrEmpty(text);
      const message =
        typeof payload['message'] === 'string' ? payload['message'] : response.statusText;
      const errors = (payload['errors'] ?? {}) as Record<string, string[]>;
      throw new ApiError(message, response.status, errors, payload);
    }

    /*
     * A success is parsed strictly, which is the other half of the decision.
     *
     * A 200 whose body is not JSON is this application misconfigured, and
     * swallowing it would hand a screen an empty object — so the journal
     * would say "Nothing yet" rather than that it could not read. That is the
     * absence class, and a throw is the honest answer.
     */
    const parsed: unknown = text === '' ? {} : JSON.parse(text);

    return (typeof parsed === 'object' && parsed !== null ? parsed : {}) as T;
  }

  return {
    request,

    list: async <T>(path: string): Promise<readonly T[]> => {
      const result = await request<unknown>(path);
      return Array.isArray(result) ? (result as T[]) : [];
    },

    everyPage: async <T>(
      fetchPage: (cursor: string | null) => Promise<Page<T>>,
    ): Promise<readonly T[]> => {
      const all: T[] = [];
      let cursor: string | null = null;

      do {
        const page: Page<T> = await fetchPage(cursor);
        all.push(...page.items);

        // An empty page means there is nothing more to walk, whatever the
        // cursor says.
        if (page.items.length === 0) break;

        // And a cursor that does not advance would spin forever. That case was
        // named in a comment here and not actually guarded: the empty-page
        // check above does not catch it, because a page that repeats itself has
        // items. It would loop, re-reading the same rows and growing this array
        // until the tab died — on an export, which is the one call that walks
        // every page a person has.
        //
        // Stopping is the right answer rather than throwing: this is somebody
        // asking for their own data, and an export short of the last page beats
        // no export and a crash. A server that does this is broken, and the
        // place to notice that is the server's tests.
        if (page.nextCursor === cursor) break;

        cursor = page.nextCursor;
      } while (cursor !== null);

      return all;
    },
  };
}
