import { describe, expect, it } from 'vitest';
import { staleGuard } from './stale';

describe('which answer a screen may believe', () => {
  it('believes the only one', () => {
    const guard = staleGuard();
    const current = guard();

    expect(current()).toBe(true);
  });

  /**
   * The measured case, in the order the browser produced it: the request for
   * `open` went out first, the request for `all` second, and `open`'s answer
   * arrived last. It must not be believed — that is how a reviewed flag ended
   * up inside "2 open".
   */
  it('refuses an earlier request that answers later', () => {
    const guard = staleGuard();

    const first = guard();
    const second = guard();

    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });

  it('holds across any number of them, and only the last survives', () => {
    const guard = staleGuard();
    const tokens = [guard(), guard(), guard(), guard()];

    expect(tokens.map((t) => t())).toEqual([false, false, false, true]);
  });

  /**
   * Asked more than once rather than captured in a variable, because a call
   * site checks on the success path and again on the failure path.
   */
  it('gives the same answer every time it is asked', () => {
    const guard = staleGuard();
    const first = guard();
    guard();

    expect(first()).toBe(false);
    expect(first()).toBe(false);
  });

  /**
   * One guard per screen. Two screens sharing one would have each invalidating
   * the other's requests, which is not a safe failure — it is a screen that
   * renders nothing because something else asked for something.
   */
  it('is independent of another guard', () => {
    const mine = staleGuard();
    const theirs = staleGuard();

    const current = mine();
    theirs();
    theirs();

    expect(current()).toBe(true);
  });
});
