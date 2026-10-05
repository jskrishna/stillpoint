/**
 * The two rules in `presses.ts`, and that the phone's copy is the same file.
 *
 * Both halves are needed, for the reason `describe.test.ts` gives: a tested
 * function with a drifted twin is exactly the situation this replaced. The
 * test lives on the web side because `apps/mobile`'s tsconfig is Expo's and
 * has no `node` types to read a file with.
 *
 * What a unit test cannot show is the thing that was actually wrong — a
 * handler closing over a stale `useState` value — because that is React's
 * render timing. `e2e/flow.mjs`, `e2e/admin.mjs` and `e2e/mobile.mjs` press
 * each control three times inside **one** `evaluate`, which is the only way
 * to see it; three separate clicks flush React between them and send one
 * request whether or not the guard works.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inFlight, inOrder } from './presses';

const at = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

/** A call that finishes after `ms` and records when it started and landed. */
function call(log: string[], name: string, ms: number) {
  return async () => {
    log.push(`${name} sent`);
    await new Promise((r) => setTimeout(r, ms));
    log.push(`${name} landed`);
  };
}

describe('a press refused while one is still being answered', () => {
  it('sends the first and drops the rest, however fast they arrive', async () => {
    const guard = inFlight();
    const log: string[] = [];

    // No await between them: this is the same-frame double tap.
    await Promise.all([
      guard(call(log, 'first', 20)),
      guard(call(log, 'second', 20)),
      guard(call(log, 'third', 20)),
    ]);

    expect(log).toEqual(['first sent', 'first landed']);
  });

  it('lets the next press through once the answer has landed', async () => {
    const guard = inFlight();
    const log: string[] = [];

    await guard(call(log, 'first', 1));
    await guard(call(log, 'second', 1));

    expect(log).toEqual(['first sent', 'first landed', 'second sent', 'second landed']);
  });

  it('releases on a failure, so one error does not wedge the control', async () => {
    const guard = inFlight();
    const log: string[] = [];

    await expect(
      guard(() => {
        log.push('threw');

        return Promise.reject(new Error('no'));
      }),
    ).rejects.toThrow('no');
    await guard(call(log, 'after', 1));

    expect(log).toEqual(['threw', 'after sent', 'after landed']);
  });
});

describe('writes in the order they were asked for', () => {
  it('lands the slow one before the quick one asked for after it', async () => {
    const queue = inOrder();
    const log: string[] = [];

    // The measured case: "always" is slow, "never" is asked for next and is
    // quick. Unserialised, "never" lands first and "always" overwrites it.
    await Promise.all([queue(call(log, 'always', 60)), queue(call(log, 'never', 1))]);

    expect(log).toEqual(['always sent', 'always landed', 'never sent', 'never landed']);
  });

  it('does not stop at a failure, because a later press is a newer intention', async () => {
    const queue = inOrder();
    const log: string[] = [];

    const failed = queue(() => {
      log.push('first threw');

      return Promise.reject(new Error('no'));
    });
    const after = queue(call(log, 'second', 1));

    await expect(failed).rejects.toThrow('no');
    await after;

    expect(log).toEqual(['first threw', 'second sent', 'second landed']);
  });

  it('gives each caller its own sequence, so two screens do not queue behind each other', async () => {
    const one = inOrder();
    const two = inOrder();
    const log: string[] = [];

    await Promise.all([one(call(log, 'one', 40)), two(call(log, 'two', 1))]);

    expect(log).toEqual(['one sent', 'two sent', 'two landed', 'one landed']);
  });
});

describe('one rule, not two', () => {
  it('is the same file on the phone', () => {
    const web = readFileSync(at('apps/web/src/lib/presses.ts'), 'utf8');
    const phone = readFileSync(at('apps/mobile/src/presses.ts'), 'utf8');

    expect(phone).toBe(web);
  });
});
