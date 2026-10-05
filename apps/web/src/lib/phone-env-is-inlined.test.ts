import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * The phone reads its build-time variables in the one spelling that works.
 *
 * Expo inlines `EXPO_PUBLIC_*` by replacing the member expression
 * `process.env.EXPO_PUBLIC_X` in the source, and only that expression.
 * `apps/mobile/src/api.ts` read the API's address through an alias
 * (`const env = process.env`, then `env['EXPO_PUBLIC_API_URL']`), which is not
 * replaced. Measured by building the export with the variable set: the bundle
 * held the address zero times and kept a runtime lookup that is undefined in
 * every built app, so each one called `localhost` whatever it was built for.
 * `expo start` defines the variable at run time, which is why the only way
 * anybody had run it showed nothing wrong.
 *
 * The real check is that build, and it takes most of a minute, so this is the
 * cheap half: it reads the source and refuses the spellings that are not
 * inlined. It lives here, with the other checks that read the phone's source,
 * because `apps/mobile` has no Node types to read a file with.
 */
const at = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

/** Source with its comments taken out, so prose about a spelling is not the spelling. */
const code = (path: string): string =>
  readFileSync(at(path), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

describe('a build-time variable in the phone app', () => {
  const files = execFileSync('git', ['ls-files', 'apps/mobile/src'], {
    cwd: at('.'),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f));

  it('has files to look at', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('is read as process.env.EXPO_PUBLIC_X, written out in full', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = code(file);
      // Every mention of such a variable has to be the exact member
      // expression. A bracket lookup or a read through another name is not
      // replaced by the bundler.
      for (const found of source.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
        const before = source.slice(Math.max(0, found.index - 12), found.index);
        if (before !== 'process.env.') offenders.push(`${file}: ${found[0]}`);
      }
      // And `process.env` is never handed to anything else to read from.
      if (/process\.env(?!\.[A-Z])/.test(source)) offenders.push(`${file}: process.env aliased`);
    }

    expect(offenders).toEqual([]);
  });

  it('and the API address is one of them', () => {
    // The control: with no such variable read anywhere, the case above would
    // pass over an app that had gone back to a hardcoded address.
    expect(code('apps/mobile/src/api.ts')).toContain('process.env.EXPO_PUBLIC_API_URL');
  });
});
