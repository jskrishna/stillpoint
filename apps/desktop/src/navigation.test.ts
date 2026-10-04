import { describe, expect, it } from 'vitest';
import { mayOpenExternally, sameOrigin } from './navigation.js';

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
