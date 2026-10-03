/**
 * Where a surface keeps its bearer token.
 *
 * ## Why this interface is synchronous
 *
 * The web keeps the token in `localStorage`, which reads synchronously. A
 * phone should keep it in the keychain, and every keychain API is
 * asynchronous. Making this interface asynchronous would be the obvious way to
 * cover both — and it would make every request await a read, and `hasToken()`
 * a promise, which is the one thing a screen needs an answer to before it can
 * decide whether to render or redirect.
 *
 * So the asynchronous medium is wrapped rather than the interface widened: a
 * keychain-backed store holds the token in memory, answers `read()` from
 * there, and persists in the background. It is hydrated once at startup —
 * which a mobile app does anyway, behind its splash screen — and the rest of
 * the app sees the same simple thing the web does.
 *
 * Nothing here decides *whether* a token should be stored. That is the
 * surface's call, and `memoryTokens()` is the honest answer for a surface that
 * should not persist one at all.
 */
export interface TokenStore {
  /** The token, or `null` when there is none. Never throws. */
  readonly read: () => string | null;
  /** Keeps `token`, or forgets it when `null`. May persist in the background. */
  readonly write: (token: string | null) => void;
}

/**
 * A store that lasts as long as the process.
 *
 * The default, and the right one for a script or a test: nothing is written
 * anywhere, so nothing is left behind.
 */
export function memoryTokens(initial: string | null = null): TokenStore {
  let token = initial;
  return {
    read: () => token,
    write: (next) => {
      token = next;
    },
  };
}

/**
 * A store in front of an asynchronous medium — a keychain, say.
 *
 * `hydrate` is awaited once, by whoever builds the store, before the app asks
 * anything of it. Until then `read()` answers `null`, which is the safe
 * answer: it means a screen shows the sign-in step for a moment rather than
 * showing someone else's journal for a moment.
 *
 * `persist` is called without being awaited, and a failure is swallowed: a
 * keychain that will not write means the session lasts until the app closes,
 * which is worth strictly less than the alternative of refusing to sign in.
 */
export function cachedTokens(persist: (token: string | null) => Promise<void>): {
  readonly store: TokenStore;
  readonly hydrate: (load: () => Promise<string | null>) => Promise<void>;
} {
  let token: string | null = null;

  return {
    store: {
      read: () => token,
      write: (next) => {
        token = next;
        void persist(next).catch(() => {
          // See above: in memory for this run is the fallback, not a failure.
        });
      },
    },
    hydrate: async (load) => {
      try {
        token = await load();
      } catch {
        token = null;
      }
    },
  };
}
