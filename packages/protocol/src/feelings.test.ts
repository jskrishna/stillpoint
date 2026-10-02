import { describe, expect, it } from 'vitest';
import { FEELINGS, feeling, isFeelingId } from './feelings.js';

describe('feelings', () => {
  it('carries the design language’s twelve plus "Ashamed"', () => {
    // "Ashamed" has no swatch in the design language but is used on the
    // summary, session detail, journal detail and insights screens.
    expect(FEELINGS).toHaveLength(13);
    expect(FEELINGS.map((f) => f.id)).toContain('ashamed');
  });

  it('gives every feeling a label', () => {
    for (const f of FEELINGS) {
      expect(f.label).not.toBe('');
    }
  });

  it('uses distinct ids', () => {
    expect(new Set(FEELINGS.map((f) => f.id)).size).toBe(FEELINGS.length);
  });

  it('resolves a known feeling', () => {
    expect(feeling('unworthy')?.label).toBe('Unworthy');
  });

  it('does not invent a feeling it does not know', () => {
    expect(feeling('hangry')).toBeUndefined();
    expect(isFeelingId('hangry')).toBe(false);
    expect(isFeelingId('angry')).toBe(true);
  });
});
