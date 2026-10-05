import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * A file's location is not its URL's pathname.
 *
 * Four files turned `import.meta.url` into a path by reading the pathname off
 * a `URL`, and a pathname is percent-encoded. Checked out under a directory
 * with a space in its name, which is where this repository was first cloned
 * onto somebody's own machine ("my data"), every one of them resolved to a
 * path containing `%20` that does not exist. The one that showed was
 * `risk-review-is-current.test.ts`: it handed that path to git as a `cwd`, so
 * `pnpm run check` went red with `spawnSync git ENOENT` on a tree with nothing
 * wrong in it, naming a git that was installed. The other three were
 * `check:mysql`, `check:edge` and the font fetcher, which would have failed
 * the same way the first time anybody ran them there.
 *
 * It is a one-place rule applied in most places: twenty other call sites
 * already used `fileURLToPath`, which decodes, and also gets a Windows drive
 * letter right where a pathname starts `/C:/`. Every check here had only ever
 * run in a container at a path with no space in it, so nothing could have
 * shown the difference.
 *
 * This reads the source, the way `no-privacy-law-in-copy.test.ts` does, and it
 * includes test files on purpose, because a test is where the bug was. The
 * pattern below is written so that this file does not match itself.
 */
const at = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

/** `import.meta.url`, the closing parenthesis of the `URL`, then the pathname. */
const PATHNAME_OF_THIS_FILE = /import\.meta\.url\s*\)\s*\.pathname/;

describe('a path made from import.meta.url', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: at('.'), encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx|mts|js|mjs|cjs)$/.test(f));

  it('has files to look at', () => {
    // A source-reading check whose list comes back empty stops checking in
    // silence.
    expect(files.length).toBeGreaterThan(150);
  });

  it('goes through fileURLToPath, never the pathname', () => {
    const offenders = files.filter((f) => PATHNAME_OF_THIS_FILE.test(readFileSync(at(f), 'utf8')));

    expect(
      offenders,
      `${offenders.join(', ')}: a URL's pathname is percent-encoded, so this breaks in a ` +
        'checkout whose path has a space in it. Use fileURLToPath(new URL(…, import.meta.url)).',
    ).toEqual([]);
  });

  it('and can tell the two apart', () => {
    // The control: the check is worth nothing if the pattern stopped matching
    // the thing it is about, including across a line break, which is how the
    // one that surfaced was written.
    const meta = 'import.meta.url';
    expect(PATHNAME_OF_THIS_FILE.test(`new URL('..', ${meta}).pathname`)).toBe(true);
    expect(PATHNAME_OF_THIS_FILE.test(`new URL('x.md', ${meta})\n    .pathname;`)).toBe(true);
    expect(PATHNAME_OF_THIS_FILE.test(`fileURLToPath(new URL('..', ${meta}))`)).toBe(false);
  });
});
