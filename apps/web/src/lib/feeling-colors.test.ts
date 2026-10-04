import { describe, expect, it } from 'vitest';
import { FEELINGS } from '@stillpoint/protocol';
import { FEELING_COLOR, FEELING_SWATCHES } from '@stillpoint/design-tokens';

/**
 * Every feeling has a colour, and every colour names a feeling.
 *
 * The two halves live in different packages on purpose — a feeling's id and
 * label are domain and belong in `@stillpoint/protocol`, its colour is
 * presentation and belongs in `@stillpoint/design-tokens`, and
 * `packages/protocol` may not hold colours. Nothing compared them, and neither
 * package can: the dependency runs one way and `design-tokens` does not import
 * the domain.
 *
 * What that costs is silence. Both call sites have a fallback —
 * `COLOR.get(f.id) ?? 'transparent'` on the web and `FEELING_COLOR[f.id]` on
 * the phone — so a feeling added to `FEELINGS` without a colour renders an
 * invisible bar on the insights chart and an invisible dot on its chip, with
 * nothing failing. A leftover colour is the harmless direction and is checked
 * in the same breath because a set comparison costs no more than a subset one.
 *
 * It lives in `apps/web` because a surface is the only place that may import
 * both, which is the same reason `describe.test.ts` is here rather than beside
 * the phone's copy of the file it tests.
 */
describe('feeling colours', () => {
  const ids = FEELINGS.map((f) => f.id).sort();

  it('cover every feeling the protocol has, and no others', () => {
    expect(Object.keys(FEELING_COLOR).sort()).toEqual(ids);
  });

  it('are the same set the swatches list', () => {
    expect(FEELING_SWATCHES.map((s) => s.id).sort()).toEqual(ids);
  });

  // Thirteen, not twelve: `humiliated` is the one behind "See more feelings",
  // so the grid is twelve and the set is thirteen. Written out because the
  // repository's own notes said twelve for a while.
  it('number thirteen', () => {
    expect(ids).toHaveLength(13);
  });
});
