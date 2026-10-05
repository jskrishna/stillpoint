import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The clinical review pack is the screen as it is now.
 *
 * `docs/clinical-review/RISK-SCREEN-REVIEW.md` is generated from
 * `risk.ts` and checked in, and its second line says "Regenerate with
 * `pnpm run clinical:review` after any change to the screen" — an instruction
 * nothing enforced. The document a clinician reads could therefore describe a
 * screen two changes old while every gate stayed green, which is the one
 * drift that matters most here: `LAUNCH.md` item 1 is asking somebody
 * qualified to judge this screen, and they can only judge the version they
 * were handed.
 *
 * `format:check` already runs over the file, so the repository cared that it
 * was *formatted* and not that it was *current*.
 *
 * It is asserted on the stamped commit rather than by regenerating and
 * diffing, deliberately: regenerating inside a test would write to the working
 * tree, and a check that repairs what it is checking cannot fail twice.
 */
describe('the clinical review pack', () => {
  const PACK = new URL('../../../docs/clinical-review/RISK-SCREEN-REVIEW.md', import.meta.url)
    .pathname;
  const SCREEN = 'packages/protocol/src/risk.ts';

  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      encoding: 'utf8',
      cwd: new URL('../../../', import.meta.url).pathname,
    }).trim();

  it('names the commit that last changed the screen', () => {
    /*
     * Skipped on a shallow clone, which is what `actions/checkout` makes by
     * default: with one commit of history `git log -1 -- <path>` answers for
     * that commit or not at all, so this would be red for a reason that is
     * about the checkout rather than about the pack. Said out loud rather than
     * passed quietly, because a check that skips in CI and nowhere else is one
     * nobody knows is not running.
     */
    if (git('rev-parse', '--is-shallow-repository') === 'true') {
      console.warn('shallow clone — cannot tell when the screen last changed; not checked');
      return;
    }

    const lastChanged = git('log', '-1', '--format=%h', '--', SCREEN);
    expect(lastChanged, 'git could not say when the screen last changed').not.toBe('');

    const stamped = /at commit `([0-9a-f]+)`/.exec(readFileSync(PACK, 'utf8'))?.[1];

    expect(
      stamped,
      `The pack names commit ${String(stamped)} and ${SCREEN} last changed at ${lastChanged}. ` +
        'Run `pnpm run clinical:review` — the document somebody qualified is asked to ' +
        'judge has to be the screen that runs.',
    ).toBe(lastChanged);
  });
});
