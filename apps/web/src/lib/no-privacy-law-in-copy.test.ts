import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * No screen names a privacy law.
 *
 * Whether the consent screen should cite PIPEDA, Québec's Law 25 or India's
 * DPDP is a legal and product decision, and `DECISIONS.md` is where it waits.
 * The rule about not inventing product copy applies hardest here: a sentence
 * telling somebody which law protects them is the one kind of copy where a
 * guess is worst, because it is a claim about their rights rather than about
 * this product.
 *
 * `CLAUDE.md` has asserted this by citing a grep, and the grep went stale —
 * it said the three names "appear once each, in a comment in
 * `user-ear.ts`", and a second file was later written that names Law 25 in a
 * comment of its own. The claim the grep supported stayed true; the count
 * stopped being. So the claim is a test now and the count is nobody's to
 * maintain.
 *
 * **It is deliberately not a ban.** Three doc comments name these laws and
 * should: that is where the reasoning for an unbound listener and an unread
 * consent item lives. What this refuses is a law's name reaching a string a
 * person can read, which is why it looks at the lines rather than the files.
 */
const at = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

const LAWS = /PIPEDA|Law 25|DPDP/;

/** A line that is only a comment, by the three shapes this repository writes. */
const isComment = (line: string): boolean => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

describe('a privacy law in the product’s own copy', () => {
  /*
   * Found with `git ls-files` rather than a hand-written list, for the reason
   * the grep went stale: a file added tomorrow is covered on the day it is
   * written. Limited to what a person can be shown — the two client surfaces,
   * the two packages that hold copy, and the API's own strings.
   */
  const files = execFileSync(
    'git',
    [
      'ls-files',
      'apps/web/src',
      'apps/mobile/src',
      'packages/protocol/src',
      'packages/client/src',
      'apps/api/app',
      'apps/api/database',
    ],
    { cwd: at('.'), encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.(ts|tsx|php)$/.test(f))
    // Tests are not copy: nothing in one is shown to anybody, and the first
    // version of this file **failed on a clean tree** because it reads itself
    // — the line holding the pattern is not a comment. It passed while the
    // file was untracked, since `git ls-files` does not list those, and went
    // red the moment it was committed. `verify:clean` caught it, which is what
    // that command is for.
    .filter((f) => !/\.test\.(ts|tsx)$|Test\.php$/.test(f));

  it('has files to look at', () => {
    // A source-reading check whose list comes back empty stops checking in
    // silence, which is the failure this file is itself about.
    expect(files.length).toBeGreaterThan(100);
  });

  it('appears only in comments', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const lines = readFileSync(at(file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (LAWS.test(line) && !isComment(line)) {
          offenders.push(`${file}:${String(i + 1)}  ${line.trim().slice(0, 80)}`);
        }
      });
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('and the comments that do name one are still there', () => {
    // The other direction: a check that passes because the names are gone
    // altogether would mean the reasoning went with them. Three lines today,
    // in two files; the count is asserted as "some" rather than as three,
    // because the reasoning is worth more than the number.
    const named = files.filter((f) => LAWS.test(readFileSync(at(f), 'utf8')));

    expect(named.length).toBeGreaterThan(0);
  });
});
