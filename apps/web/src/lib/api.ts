/**
 * The API client, as this browser uses it.
 *
 * The client itself is `@stillpoint/client`, shared with every other surface.
 * What belongs here is only what is true of a browser: where the API is, and
 * where the token is kept. Everything else — the paths, the field names, the
 * paging — is in the package, so that a phone and a desktop shell cannot drift
 * away from it.
 *
 * Every type the screens use is re-exported, so a screen imports from one
 * place and does not need to know which of the two it came from.
 *
 * ## The token, and its known weakness
 *
 * The bearer token is kept in `localStorage` so a reload does not sign the user
 * out. That is readable by any script running on the page, so an XSS becomes a
 * stolen session. The right answer for production is Sanctum's cookie mode: an
 * httpOnly cookie the page cannot read. This is a deliberate, documented
 * shortcut, not an opinion that it is fine.
 *
 * What there is instead, until then, is the second half of the attack taken
 * away: the Content-Security-Policy in `next.config.ts` allows `connect-src`
 * to this origin and the API's and nothing else, so a token that is read still
 * cannot be sent anywhere. `e2e/privacy.mjs` asserts that from inside a real
 * page by trying it. It is a mitigation, not the fix — injected inline script
 * still runs, because `script-src` keeps `'unsafe-inline'` — and it is not a
 * reason to leave the token here.
 */

import { createClient, type TokenStore } from '@stillpoint/client';

export { ApiError } from '@stillpoint/client';
export type { Page, StillpointClient } from '@stillpoint/client';
export type * from '@stillpoint/client';

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000/api';
const TOKEN_KEY = 'stillpoint.token.v1';

/**
 * `localStorage`, guarded.
 *
 * Reads and writes are wrapped because this also runs while Next is
 * prerendering, where there is no `window` at all, and in a browser where
 * storage can be blocked outright. Neither should be an error a screen has to
 * handle: no token simply means not signed in, and a write that cannot land
 * means the session lasts as long as the page.
 */
const browserTokens: TokenStore = {
  read: () => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write: (token) => {
    if (typeof window === 'undefined') return;
    try {
      if (token === null) window.localStorage.removeItem(TOKEN_KEY);
      else window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage blocked. The token stays in memory for this page only.
    }
  },
};

export const api = createClient({ baseUrl: BASE, tokens: browserTokens });

export function hasToken(): boolean {
  return api.hasToken();
}

export function storeToken(token: string | null): void {
  api.storeToken(token);
}
