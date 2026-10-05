import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * A domain value is named in one place.
 *
 * Three bugs in a row were this: a surface holding its own map from an id to a
 * display name. The settings screens got the plan wrong in opposite
 * directions, the console invented "Deep" for a `full` session, and the web's
 * journal entry dropped the "a little" rating the phone showed. Each was fixed
 * by moving the names into `packages/protocol` beside the ids — and then the
 * accounts screen was found still holding its own copy of the plan names,
 * written the same day `PLAN_LABEL` was added and missed when the two settings
 * screens were moved onto it. The screen that *grants* a plan was the last one
 * naming them itself.
 *
 * So this is the rule rather than three fixes: a `*_LABEL` map in a surface is
 * a name the protocol is not the authority on, and every one that stays needs
 * a reason written here. It is `RotateEncryptionKey::COLUMNS` with the same
 * shape — a list that refuses what it does not cover, so the next one has to
 * be argued for rather than written.
 *
 * It would have caught the accounts screen's copy, which is the only evidence
 * worth citing for a test like this.
 */
const at = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

/**
 * The maps a surface is allowed to declare, and why each one is not domain.
 *
 * Both are the console's, and neither names a value `packages/protocol` knows
 * about. Adding a third means either moving the names into the protocol or
 * writing the reason it does not belong there.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  // A role is the API's — `EnsureStaff`, `isStaff()` — and `packages/protocol`
  // has no notion of one. No other surface shows a role, so moving it there
  // would be inventing a domain concern for one `<select>`. It is derived from
  // that `<select>`'s own list rather than written out twice.
  'apps/web/src/app/admin/users/Accounts.tsx:ROLE_LABEL': 'a role is the API’s, not the protocol’s',
  // The overview's result column is not a rating: it carries `safety` and
  // `unrated` beside the three answers, and says "No change" where the summary
  // screen asked "No". A staff summary of how a session ended, in the
  // console's own words.
  'apps/web/src/app/admin/page.tsx:RESULT_LABEL': 'how a session ended, not what was answered',
};

const DECLARATION = /^(?:export )?const ([A-Z][A-Z0-9_]*_LABELS?)\b/;

describe('a label map outside the protocol', () => {
  const files = execFileSync('git', ['ls-files', 'apps/web/src', 'apps/mobile/src'], {
    cwd: at('.'),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/\.test\.tsx?$/.test(f));

  it('has files to look at', () => {
    // A source-reading check whose list comes back empty stops checking in
    // silence. That is the failure the file beside this one is about.
    expect(files.length).toBeGreaterThan(50);
  });

  it('is one of the two the console needs, each with its reason', () => {
    const found: string[] = [];

    for (const file of files) {
      for (const line of readFileSync(at(file), 'utf8').split('\n')) {
        const name = DECLARATION.exec(line)?.[1];
        if (name !== undefined) found.push(`${file}:${name}`);
      }
    }

    expect(found.sort(), found.join('\n')).toEqual(Object.keys(ALLOWED).sort());
  });

  it('and the protocol is where the rest of them live', () => {
    // The other direction. A green run above would mean nothing if the
    // protocol's own maps had been deleted rather than consumed — which is
    // exactly what "every surface stopped declaring one" looks like from here.
    const protocol = ['plans.ts', 'session.ts', 'onboarding.ts']
      .map((f) => readFileSync(at(`packages/protocol/src/${f}`), 'utf8'))
      .join('\n');

    for (const name of [
      'PLAN_LABEL',
      'SESSION_KIND_LABEL',
      'CALMER_ANSWER_LABEL',
      'CALMER_JOURNAL_LABEL',
      'COACH_SHARING_LABEL',
    ]) {
      expect(protocol, name).toContain(`export const ${name}`);
    }
  });
});
