import { describe, expect, it } from 'vitest';
import { FEELINGS, feeling, isFeelingId } from './feelings.js';

describe('feelings', () => {
  it('carries the twelve feelings of the design language', () => {
    expect(FEELINGS).toHaveLength(12);
  });

  it('gives every feeling a label and a hex colour', () => {
    for (const f of FEELINGS) {
      expect(f.label).not.toBe('');
      expect(f.color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('uses a distinct colour per feeling, so history stays readable', () => {
    expect(new Set(FEELINGS.map((f) => f.color)).size).toBe(FEELINGS.length);
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
