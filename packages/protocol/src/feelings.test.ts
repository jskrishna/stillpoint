import { describe, expect, it } from 'vitest';
import { FEELINGS, feeling, isFeelingId } from './feelings.js';

describe('feelings', () => {
  it('carries the twelve feelings of the design language', () => {
    expect(FEELINGS).toHaveLength(12);
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
