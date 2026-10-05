/**
 * Where this window may go, and what may be handed to the operating system.
 *
 * Both of these were one-liners inside `main.ts` and both were wrong in the
 * same way: they treated a URL as a string.
 *
 * **The pin was `url.startsWith(origin)`**, and a prefix is not an origin.
 * With the origin `http://127.0.0.1:8735`, measured:
 *
 *     http://127.0.0.1:8735@evil.example/phish   → allowed, real host evil.example
 *
 * Everything before an `@` is userinfo, so that string starts with the app's
 * own origin and resolves somewhere else entirely. The window it would have
 * navigated is the one signed in to somebody's journal, with the app's own
 * frame around it — which is the whole reason `main.ts` says navigation is
 * pinned. A pin a string can step around is not a pin.
 *
 * `http://127.0.0.1:87351/` and `http://127.0.0.1:8735.evil.example/` passed
 * the prefix check too. Those two do not parse as URLs at all, so Chromium
 * would most likely have refused them on its own — but "most likely" is not
 * the argument this guard exists to make.
 *
 * **And `shell.openExternal` was given whatever it was handed.** The renderer
 * is sandboxed, but the content policy keeps `'unsafe-inline'` on purpose and
 * `apps/web/next.config.ts` is plain that injected inline script still runs.
 * So a payload in the page could call `window.open('file:///…')`, or any
 * scheme some other application has registered, and the main process would
 * pass it to the OS. Only the four schemes a link in this product can
 * legitimately be go through now.
 *
 * It is a separate module from `main.ts` so it can be tested: `main.ts`
 * imports `electron`, which does not resolve outside an Electron process, and
 * these two decisions are exactly the part worth asserting.
 */

/**
 * The schemes `shell.openExternal` may be given.
 *
 * `tel:` is here because the safety screen's helplines are `tel:` links and
 * handing one to the system is what opens the dialler — on the one screen in
 * the product where that has to work. `mailto:` for the same reason one step
 * down. Anything else is a local handler, and a page that asks for one is not
 * asking for something this product offers.
 */
const OPENABLE: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Every path this app navigates its own window to.
 *
 * They were written out at five call sites in `main.ts` — the start path, the
 * global shortcut, two menu items and the Help item — so this shell held its
 * own copy of another app's route names, with nothing comparing the two.
 * `apps/desktop` does not depend on `apps/web` at all: it is a window around
 * a built server, so a renamed route is a menu item that loads Next's
 * not-found page **inside the window signed in to somebody's journal**, and
 * the navigation pin allows it because it is the same origin.
 *
 * The Help item is why this is a list rather than a comment. Its label — "If
 * you need someone now" — was written against the phone's settings screen and
 * pointed at the web's, which had no crisis number on it at all. That is the
 * same class as a rename: a target that resolves and is the wrong screen.
 * `navigation.test.ts` asserts each of these is a real route of `apps/web`,
 * and `e2e/desktop.mjs` loads every one of them in the real window.
 */
export const APP_PATHS = {
  /**
   * Where the window opens. The app, not the marketing site: somebody who has
   * installed this has already been sold to, and `/app` sends them to sign in
   * by itself when they are not.
   */
  start: '/app',
  /** The global shortcut, straight into a session. */
  session: '/session',
  journal: '/app/journal',
  /**
   * Two menu items share this one: Session → Settings, and Help → "If you
   * need someone now", which is there for the crisis numbers that screen
   * renders.
   */
  settings: '/app/settings',
} as const;

/**
 * Is this URL the app's own origin?
 *
 * Compared as origins, by the URL parser, rather than as strings. Anything
 * that does not parse is **not** the app's own origin, which is the safe
 * direction: the caller blocks it.
 *
 * An opaque origin (`tel:`, `data:`, `file:` — the parser reports the string
 * `"null"`) is rejected outright rather than compared, so two of them cannot
 * match each other. `origin` is `''` until the server is up, and that does not
 * parse either, so nothing is allowed before there is somewhere to allow.
 */
export function sameOrigin(url: string, origin: string): boolean {
  const of = (value: string): string | null => {
    try {
      const parsed = new URL(value).origin;
      return parsed === 'null' ? null : parsed;
    } catch {
      return null;
    }
  };

  const mine = of(origin);
  if (mine === null) return false;

  return of(url) === mine;
}

/** May this URL be handed to the system? See `OPENABLE` above. */
export function mayOpenExternally(url: string): boolean {
  try {
    return OPENABLE.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
