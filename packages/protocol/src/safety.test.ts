import { describe, expect, it } from 'vitest';
import { HELPLINES_IN, SAFETY_ACTION, helplinesFor, mustFlag, mustStop } from './safety.js';

describe('safety levels', () => {
  it('stops only on a crisis', () => {
    expect(mustStop('crisis')).toBe(true);
    expect(mustStop('concern')).toBe(false);
    expect(mustStop('none')).toBe(false);
  });

  it('flags a concern as well as a crisis', () => {
    expect(mustFlag('concern')).toBe(true);
    expect(mustFlag('crisis')).toBe(true);
    expect(mustFlag('none')).toBe(false);
  });

  it('maps each level to one action', () => {
    expect(SAFETY_ACTION).toEqual({ none: 'continue', concern: 'flag', crisis: 'stop' });
  });
});

describe('helplines', () => {
  it('offers Tele-MANAS and emergency services for India', () => {
    expect(HELPLINES_IN.map((h) => h.number)).toEqual(['14416', '112']);
  });

  it('resolves by country and admits when it knows none', () => {
    expect(helplinesFor('IN')).toHaveLength(2);
    // The safety screen offers "Not in India? See other helplines", so an empty
    // list here is a known gap, not a bug — but it must never be silently wrong.
    expect(helplinesFor('CA')).toEqual([]);
  });
});
