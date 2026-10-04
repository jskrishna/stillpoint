import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  HELPLINES_IN,
  SAFETY_ACTION,
  SAFETY_CATEGORY_LABEL,
  SAFETY_LEVELS,
  byUrgency,
  helplinesFor,
  isCountryCode,
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
    expect(helplinesFor('CA')).toHaveLength(3);
    expect(helplinesFor('IN')).toHaveLength(2);

    // An empty list for a country this does not cover is a known gap, not a
    // bug — but it must never be silently wrong, so a plausible-looking number
    // from the wrong country is never substituted. This assertion used to name
    // Canada, which is now the first market: a Canadian in crisis saw a pause
    // screen with no number on it, and the test said that was fine.
    expect(helplinesFor('US')).toEqual([]);
    expect(helplinesFor('GB')).toEqual([]);
    expect(helplinesFor('')).toEqual([]);
  });

  /**
   * Canada is the first market, so its numbers are the ones most people see.
   *
   * Québec is listed separately because it answers through 1-866-APPELLE
   * rather than 988, and somebody in Montréal dialling the wrong one of those
   * is the failure this screen exists to prevent.
   */
  it('gives Canada its national line, Québec’s, and 911', () => {
    const numbers = helplinesFor('CA').map((h) => h.number);
    expect(numbers).toEqual(['988', '1-866-277-3553', '911']);
  });

  it('puts the emergency number last in both countries', () => {
    for (const country of ['CA', 'IN']) {
      const lines = helplinesFor(country);
      const emergencies = lines.filter((h) => h.kind === 'emergency');
      expect(emergencies, country).toHaveLength(1);
      expect(lines[lines.length - 1]?.kind, country).toBe('emergency');
    }
  });

  it('never hands one country’s numbers to another', () => {
    for (const country of ['CA', 'IN']) {
      for (const line of helplinesFor(country)) {
        expect(line.country, `${country}: ${line.number}`).toBe(country);
      }
    }
  });

  it('assumes a new account is in Canada, the first market', () => {
    expect(DEFAULT_COUNTRY).toBe('CA');
    expect(helplinesFor(DEFAULT_COUNTRY)).not.toEqual([]);
  });

  it('knows which countries it covers', () => {
    expect([...COUNTRIES].sort()).toEqual(['CA', 'IN']);
    for (const country of COUNTRIES) {
      expect(isCountryCode(country), country).toBe(true);
      expect(helplinesFor(country), country).not.toEqual([]);
    }
    expect(isCountryCode('US')).toBe(false);
  });
});
