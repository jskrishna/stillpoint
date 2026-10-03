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
        cursor = page.nextCursor;
        // A cursor that does not advance would spin forever; an empty page
        // means there is nothing more to walk whatever the cursor says.
        if (page.items.length === 0) break;
      } while (cursor !== null);

      return all;
    },
  };
}
