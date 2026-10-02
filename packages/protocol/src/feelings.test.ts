import { describe, expect, it } from 'vitest';
import {
  FEELINGS,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  canSelectMore,
  feeling,
  isFeelingId,
  toggleFeeling,
  type FeelingId,
} from './feelings.js';

describe('feelings', () => {
  it('lists the twelve primary chips in the order step 3 shows them', () => {
    expect(PRIMARY_FEELINGS.map((f) => f.label)).toEqual([
      'Angry',
      'Afraid',
      'Anxious',
      'Sad',
      'Guilty',
      'Ashamed',
      'Rejected',
      'Unworthy',
      'Lonely',
      'Hurt',
      'Overwhelmed',
      'Powerless',
    ]);
  });

  it('keeps the rest behind "See more feelings"', () => {
    expect(MORE_FEELINGS.map((f) => f.id)).toEqual(['humiliated']);
  });

  it('splits every feeling into exactly one of the two groups', () => {
    expect(PRIMARY_FEELINGS.length + MORE_FEELINGS.length).toBe(FEELINGS.length);
  });

  it('gives every feeling a label', () => {
    for (const f of FEELINGS) expect(f.label).not.toBe('');
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
    expect(isFeelingId('ashamed')).toBe(true);
  });
});

describe('choosing feelings', () => {
  it('caps the selection at three, as step 3 states', () => {
    expect(MAX_FEELINGS).toBe(3);
  });

  it('adds a feeling', () => {
    expect(toggleFeeling([], 'sad')).toEqual(['sad']);
  });

  it('removes one already chosen', () => {
    expect(toggleFeeling(['sad', 'angry'], 'sad')).toEqual(['angry']);
  });

  it('ignores a fourth choice rather than dropping an earlier one', () => {
    const three: readonly FeelingId[] = ['ashamed', 'rejected', 'unworthy'];
    expect(toggleFeeling(three, 'angry')).toEqual(three);
  });

  it('still allows deselecting at the cap', () => {
    expect(toggleFeeling(['ashamed', 'rejected', 'unworthy'], 'rejected')).toEqual([
      'ashamed',
      'unworthy',
    ]);
  });

  it('keeps the order feelings were chosen in', () => {
    expect(toggleFeeling(toggleFeeling(['unworthy'], 'angry'), 'sad')).toEqual([
      'unworthy',
      'angry',
      'sad',
    ]);
  });

  it('does not mutate the selection it is given', () => {
    const selected: readonly FeelingId[] = ['sad'];
    toggleFeeling(selected, 'angry');
    expect(selected).toEqual(['sad']);
  });

  it('reports when the cap is reached', () => {
    expect(canSelectMore([])).toBe(true);
    expect(canSelectMore(['sad', 'angry'])).toBe(true);
    expect(canSelectMore(['sad', 'angry', 'hurt'])).toBe(false);
  });

  it('honours a custom cap', () => {
    expect(toggleFeeling(['sad'], 'angry', 1)).toEqual(['sad']);
    expect(canSelectMore(['sad'], 1)).toBe(false);
  });
});
