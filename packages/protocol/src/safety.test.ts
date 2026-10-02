import { describe, expect, it } from 'vitest';
import {
  HELPLINES_IN,
  SAFETY_ACTION,
  SAFETY_CATEGORY_LABEL,
  SAFETY_LEVELS,
  byUrgency,
  helplinesFor,
  markReviewed,
  moreSevere,
  mustFlag,
  mustStop,
  openFlags,
  type SafetyFlag,
} from './safety.js';

const at = (iso: string) => new Date(iso);

function flag(partial: Partial<SafetyFlag> & Pick<SafetyFlag, 'id' | 'level'>): SafetyFlag {
  return {
    sessionId: 'ses_1',
    category: 'self_harm',
    excerpt: '…everyone would be better off…',
    outcome: 'Session stopped. Helplines shown.',
    raisedAt: at('2026-10-02T09:00:00Z'),
    status: 'open',
    ...partial,
  };
}

describe('safety levels', () => {
  it('stops only on the highest level', () => {
    expect(mustStop('high')).toBe(true);
    expect(mustStop('medium')).toBe(false);
    expect(mustStop('low')).toBe(false);
    expect(mustStop('none')).toBe(false);
  });

  it('flags anything above none, without interrupting the session', () => {
    expect(mustFlag('low')).toBe(true);
    expect(mustFlag('medium')).toBe(true);
    expect(mustFlag('high')).toBe(true);
    expect(mustFlag('none')).toBe(false);
  });

  it('maps each level to one action', () => {
    expect(SAFETY_ACTION).toEqual({
      none: 'continue',
      low: 'flag',
      medium: 'flag',
      high: 'stop',
    });
  });

  it('orders levels from none to high', () => {
    expect(SAFETY_LEVELS).toEqual(['none', 'low', 'medium', 'high']);
  });

  it('takes the more severe of two levels, in either order', () => {
    expect(moreSevere('none', 'medium')).toBe('medium');
    expect(moreSevere('medium', 'none')).toBe('medium');
    expect(moreSevere('high', 'low')).toBe('high');
    expect(moreSevere('low', 'low')).toBe('low');
  });
});

describe('the flag queue', () => {
  it('names every category the queue shows', () => {
    expect(SAFETY_CATEGORY_LABEL).toEqual({
      self_harm: 'Self-harm',
      harm_to_others: 'Harm to others',
      trauma: 'Trauma',
      medical: 'Medical',
    });
  });

  it('lists only what still needs review', () => {
    const list = [
      flag({ id: 'a', level: 'high' }),
      flag({ id: 'b', level: 'low', status: 'reviewed' }),
    ];
    expect(openFlags(list).map((f) => f.id)).toEqual(['a']);
  });

  it('works most severe first', () => {
    const list = [
      flag({ id: 'low', level: 'low' }),
      flag({ id: 'high', level: 'high' }),
      flag({ id: 'med', level: 'medium' }),
    ];
    expect(byUrgency(list).map((f) => f.id)).toEqual(['high', 'med', 'low']);
  });

  it('breaks ties by most recent', () => {
    const list = [
      flag({ id: 'older', level: 'high', raisedAt: at('2026-10-02T08:00:00Z') }),
      flag({ id: 'newer', level: 'high', raisedAt: at('2026-10-02T10:00:00Z') }),
    ];
    expect(byUrgency(list).map((f) => f.id)).toEqual(['newer', 'older']);
  });

  it('does not reorder the caller’s list', () => {
    const list = [flag({ id: 'low', level: 'low' }), flag({ id: 'high', level: 'high' })];
    byUrgency(list);
    expect(list.map((f) => f.id)).toEqual(['low', 'high']);
  });

  it('marks a flag reviewed, idempotently', () => {
    const open = flag({ id: 'a', level: 'high' });
    const reviewed = markReviewed(open);
    expect(reviewed.status).toBe('reviewed');
    expect(markReviewed(reviewed)).toBe(reviewed);
    expect(open.status).toBe('open');
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
