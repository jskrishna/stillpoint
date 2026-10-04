import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberDestination, safePath, takeDestination } from './after-welcome';

describe('a path on this app', () => {
  it('keeps one, normalised', () => {
    expect(safePath('/welcome/invite/abc')).toBe('/welcome/invite/abc');
    expect(safePath('/app/journal?x=1#y')).toBe('/app/journal?x=1#y');
    expect(safePath('/')).toBe('/');
  });

  /**
   * The five an attacker would try, and the reason the check is one origin
   * comparison rather than a set of string guards: a `startsWith('//')` test
   * catches the first of these and misses the next two.
   */
  it('refuses anything that resolves to another origin', () => {
    expect(safePath('//evil.example/phish')).toBeNull();
    expect(safePath('/\\evil.example/phish')).toBeNull();
    expect(safePath('  //evil.example')).toBeNull();
    expect(safePath('https://evil.example')).toBeNull();
    expect(safePath('http://evil.example/x')).toBeNull();
  });

  it('refuses a scheme that is not a page at all', () => {
    expect(safePath('javascript:alert(1)')).toBeNull();
    expect(safePath('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safePath('mailto:someone@example.com')).toBeNull();
  });

  it('refuses nothing, and treats an empty string as nothing', () => {
    expect(safePath(null)).toBeNull();
    expect(safePath(undefined)).toBeNull();
    expect(safePath('')).toBeNull();
  });

  /**
   * A relative path resolves against the base and so reads as same-origin.
   * That is correct — it is a path on this app — but it is worth pinning that
   * it comes back absolute, because the router is handed the result.
   */
  it('makes a relative path absolute', () => {
    expect(safePath('welcome/invite/abc')).toBe('/welcome/invite/abc');
  });
});

describe('remembering where to go after the welcome flow', () => {
  /** A `sessionStorage` that behaves, and one that does not. */
  const store = (): Storage => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => void map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    };
  };

  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: store() });
  });

  it('hands it back once, and then not again', () => {
    rememberDestination('/welcome/invite/abc');

    expect(takeDestination()).toBe('/welcome/invite/abc');
    // Cleared on read, so an abandoned welcome cannot surprise somebody with a
    // stale destination at their next sign-in.
    expect(takeDestination()).toBeNull();
  });

  it('is nothing when nothing was remembered', () => {
    expect(takeDestination()).toBeNull();
  });

  it('refuses to remember another origin', () => {
    rememberDestination('//evil.example/phish');
    expect(takeDestination()).toBeNull();
  });

  /**
   * Validated on the way out as well as in: the thing a one-sided check
   * assumes cannot happen is anything else writing this key.
   */
  it('refuses to hand back another origin somebody else stored', () => {
    window.sessionStorage.setItem('stillpoint.after-welcome.v1', '//evil.example/phish');
    expect(takeDestination()).toBeNull();
  });

  it('says nothing rather than throwing when storage is blocked', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked, as in a private window');
      },
    });

    expect(() => {
      rememberDestination('/welcome/invite/abc');
    }).not.toThrow();
    expect(takeDestination()).toBeNull();
  });
});
