/**
 * How a refusal is worded — for both surfaces, from one place.
 *
 * `parity/cases.json` pins rules across two **languages**. This pins one rule
 * across two **surfaces**: `apps/web/src/lib/describe.ts` and
 * `apps/mobile/src/describe.ts` are the same function, because the two answer
 * to the same API and somebody who meets a limit on their phone and then on
 * their laptop should not be told two different things about it.
 *
 * So this does two things, and needs both. It asserts every case in
 * `parity/refusals.json` against the web's copy — and then asserts the phone's
 * copy is **byte-for-byte the same file**, which is what makes those
 * assertions true of the phone as well. Either half alone is worth little: a
 * tested function with a drifted twin is the situation this replaces, and the
 * phone's own test could only ever have checked a second copy of the cases.
 *
 * It lives here rather than beside the phone's because `apps/mobile`'s
 * tsconfig is Expo's and has no `node` types, so it cannot read the fixture.
 */

import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { ApiError } from '@stillpoint/client';
import { describe, describeLoad } from './describe';

type Case = {
  readonly why: string;
  readonly status: number | null;
  readonly message: string | null;
  readonly errors: Record<string, string[]> | null;
  readonly expect: string;
};

const at = (path: string) => new URL(`../../../../${path}`, import.meta.url);

type LoadCase = Case & { readonly what: string };

const fixture = JSON.parse(readFileSync(at('parity/refusals.json'), 'utf8')) as {
  cases: readonly Case[];
  load: readonly LoadCase[];
};

const cases = fixture.cases;

group('describing a refusal', () => {
  it('has the cases', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    const thrown =
      c.status === null
        ? new TypeError('Failed to fetch')
        : new ApiError(c.message ?? '', c.status, c.errors ?? {});

    it(`${String(c.status ?? 'no answer')}: ${c.why}`, () => {
      expect(describe(thrown)).toBe(c.expect);
    });
  }

  /**
   * And the sentence a screen shows when it could not load what it is about.
   *
   * Same fixture, same reason: the statement of what failed is the screen's,
   * and the reason after it is the server's. These five screens used to invent
   * "Check your connection." and throw the error away.
   */
  for (const c of fixture.load) {
    const thrown =
      c.status === null
        ? new TypeError('Failed to fetch')
        : new ApiError(c.message ?? '', c.status, c.errors ?? {});

    it(`load ${String(c.status ?? 'no answer')}: ${c.why}`, () => {
      expect(describeLoad(c.what, thrown)).toBe(c.expect);
    });
  }

  it('has the load cases', () => {
    expect(fixture.load.length).toBeGreaterThan(0);
  });

  /**
   * The half that makes the rest mean something on the phone.
   *
   * The phone's file used to say "Word for word the web app's" in a comment,
   * and that had stopped being true: the web had a dozen hand-rolled versions,
   * several of which threw the server's own sentence away and blamed the
   * network. A promise in a comment is not a promise.
   */
  it('is the same function on the phone, byte for byte', () => {
    const web = readFileSync(at('apps/web/src/lib/describe.ts'), 'utf8');
    const phone = readFileSync(at('apps/mobile/src/describe.ts'), 'utf8');

    expect(phone).toBe(web);
  });
});
