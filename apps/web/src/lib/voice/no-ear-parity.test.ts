import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NO_EAR_REASON } from './user-ear.js';

/**
 * The web and the phone must say the same thing about listening.
 *
 * There is one sentence in the product that explains why the guide cannot hear
 * you, and each surface holds its own copy: the voice seam is in the surface,
 * not in a package, because `packages/protocol` must stay free of speech. Two
 * copies of a sentence drift, and the way this one drifts is that somebody is
 * told on their laptop that a feature is unavailable and on their phone that it
 * is coming — or worse, that it works.
 *
 * So it is checked rather than asked for, in the same spirit as
 * `parity/cases.json`: read the other surface's source and insist on the exact
 * string. If this fails, the fix is to make them agree — not to loosen it.
 */
const MOBILE_VOICE = fileURLToPath(new URL('../../../../mobile/src/voice.ts', import.meta.url));

describe('the reason the guide cannot listen', () => {
  it('is the same sentence on the phone as on the web', () => {
    const mobile = readFileSync(MOBILE_VOICE, 'utf8');

    expect(
      mobile.includes(NO_EAR_REASON),
      `apps/mobile/src/voice.ts does not hold this exact sentence:\n  ${NO_EAR_REASON}`,
    ).toBe(true);
  });

  it('stands alone, so neither screen has to splice it into another sentence', () => {
    // It carries an em-dash of its own; wrapped in a longer clause it reads as
    // a stammer, which is how the two screens came to word it differently.
    expect(NO_EAR_REASON.trim()).toMatch(/^[A-Z].*\.$/s);
  });
});
