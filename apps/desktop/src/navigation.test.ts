import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_PATHS, mayOpenExternally, sameOrigin } from './navigation.js';

/** What the shell actually runs on. `server.ts` explains why it is fixed. */
const ORIGIN = 'http://127.0.0.1:8735';

describe('what the window may navigate to', () => {
  it('allows the app’s own origin', () => {
    expect(sameOrigin(`${ORIGIN}/app`, ORIGIN)).toBe(true);
    expect(sameOrigin(`${ORIGIN}/app/journal?x=1#y`, ORIGIN)).toBe(true);
    expect(sameOrigin(ORIGIN, ORIGIN)).toBe(true);
  });

  /**
   * The case the old prefix check let through, and the reason this module
   * exists. Everything before the `@` is userinfo: this string starts with the
   * app's own origin and resolves to `evil.example`, in the window that is
   * signed in to somebody's journal.
   */
  it('refuses a host smuggled in after an @', () => {
    expect(sameOrigin(`${ORIGIN}@evil.example/phish`, ORIGIN)).toBe(false);
    expect(new URL(`${ORIGIN}@evil.example/phish`).host).toBe('evil.example');
    // The shape of the bug, stated so it cannot come back as a simplification.
    expect(`${ORIGIN}@evil.example/phish`.startsWith(ORIGIN)).toBe(true);
  });

  it('refuses a longer port and a longer host that share the prefix', () => {
    expect(sameOrigin('http://127.0.0.1:87351/', ORIGIN)).toBe(false);
    expect(sameOrigin('http://127.0.0.1:8735.evil.example/', ORIGIN)).toBe(false);
    expect(sameOrigin('http://127.0.0.1:8735x', ORIGIN)).toBe(false);
  });

  it('refuses another scheme and another port on the same host', () => {
    expect(sameOrigin('https://127.0.0.1:8735/', ORIGIN)).toBe(false);
    expect(sameOrigin('http://127.0.0.1:3000/', ORIGIN)).toBe(false);
    // `localhost` and `127.0.0.1` are different origins to a browser, and the
    // app stores its token against one of them. See `server.ts`.
    expect(sameOrigin('http://localhost:8735/', ORIGIN)).toBe(false);
  });

  it('refuses anything that does not parse, rather than guessing', () => {
    expect(sameOrigin('not a url', ORIGIN)).toBe(false);
    expect(sameOrigin('', ORIGIN)).toBe(false);
  });

  /**
   * `origin` is `''` until the bundled server is up. Nothing may be allowed
   * before there is somewhere to allow, and two opaque origins must not match
   * each other.
   */
  it('allows nothing before there is an origin', () => {
    expect(sameOrigin(`${ORIGIN}/app`, '')).toBe(false);
    expect(sameOrigin('tel:988', 'tel:988')).toBe(false);
    expect(sameOrigin('data:text/html,x', 'data:text/html,x')).toBe(false);
  });

  it('works for the development origin too', () => {
    const dev = 'http://localhost:3000';
    expect(sameOrigin(`${dev}/session`, dev)).toBe(true);
    expect(sameOrigin(`${dev}@evil.example/`, dev)).toBe(false);
  });
});

describe('what may be handed to the system', () => {
  it('opens the four schemes a link here can legitimately be', () => {
    // `tel:` is the one that matters: the safety screen's helplines are
    // `tel:` links and the system is what opens the dialler.
    expect(mayOpenExternally('tel:988')).toBe(true);
    expect(mayOpenExternally('tel:1-866-277-3553')).toBe(true);
    expect(mayOpenExternally('mailto:someone@example.com')).toBe(true);
    expect(mayOpenExternally('https://example.com/x')).toBe(true);
    expect(mayOpenExternally('http://example.com/x')).toBe(true);
  });

  /**
   * The renderer is sandboxed, but the content policy keeps `'unsafe-inline'`
   * and `apps/web/next.config.ts` is plain that injected inline script runs.
   * `window.open` reaches the main process, which used to hand the OS whatever
   * it was given.
   */
  it('refuses a local file, a local handler and anything unparseable', () => {
    expect(mayOpenExternally('file:///etc/passwd')).toBe(false);
    expect(mayOpenExternally('smb://example.example/share')).toBe(false);
    expect(mayOpenExternally('some-registered-app://do-a-thing')).toBe(false);
    expect(mayOpenExternally('javascript:alert(1)')).toBe(false);
    expect(mayOpenExternally('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(mayOpenExternally('not a url')).toBe(false);
    expect(mayOpenExternally('')).toBe(false);
  });
});

/**
 * The paths this shell navigates its own window to are `apps/web`'s routes.
 *
 * Nothing compared the two. `apps/desktop` does not depend on `apps/web` — it
 * is a window around a built server — so a renamed route is a menu item that
 * loads Next's not-found page inside the window signed in to somebody's
 * journal, and the navigation pin allows it because the origin is the same.
 *
 * Checked against the `page.tsx` files rather than against a list, for the
 * reason every hand-written list in this repository has gone stale.
 */
describe('the paths the menu navigates to', () => {
  const web = (path: string) =>
    fileURLToPath(new URL(`../../web/src/app${path}/page.tsx`, import.meta.url));

  it('are routes apps/web actually has', () => {
    const missing = Object.entries(APP_PATHS).filter(([, path]) => !existsSync(web(path)));

    expect(
      missing.map(([name, path]) => `${name}: ${path}`),
      'no page.tsx for',
    ).toEqual([]);
  });

  it('and there are paths to check, so this cannot pass by being empty', () => {
    // A source-reading check whose input is empty stops checking in silence.
    // Four today: the start path, the shortcut's session, and the two the
    // Session and Help menus share.
    expect(Object.keys(APP_PATHS).length).toBeGreaterThanOrEqual(4);
    // And the resolver has to be able to say no, or the case above is vacuous.
    expect(existsSync(web('/app/there-is-no-such-screen'))).toBe(false);
  });

  it('are app paths, not absolute URLs', () => {
    // They are concatenated onto the origin, so a full URL here would make
    // `${origin}${path}` a string that does not parse — and the pin refuses
    // anything that does not parse, so the window would silently not move.
    for (const [name, path] of Object.entries(APP_PATHS)) {
      expect(path.startsWith('/'), name).toBe(true);
      expect(sameOrigin(`${ORIGIN}${path}`, ORIGIN), name).toBe(true);
    }
  });
});
