import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_DAYS, insights, recurringBelief, withinWindow } from './insights.js';
import type { JournalEntry } from './journal.js';
import type { CalmerRating } from './session.js';
import type { FeelingId } from './feelings.js';

const NOW = new Date('2026-10-02T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function entry(partial: {
  id: string;
  at?: Date;
  feelings?: readonly FeelingId[];
  belief?: string;
  calmer?: CalmerRating;
  reached?: boolean;
}): JournalEntry {
  const base: JournalEntry = {
    id: partial.id,
    title: 'Session',
    occurredAt: partial.at ?? daysAgo(1),
    durationMinutes: 10,
    kind: 'full',
    feelings: partial.feelings ?? [],
    reachedFinalStep: partial.reached ?? true,
    sharedWithCoach: false,
  };
  return {
    ...base,
    ...(partial.belief === undefined ? {} : { belief: partial.belief }),
    ...(partial.calmer === undefined ? {} : { calmerRating: partial.calmer }),
  };
}

describe('withinWindow', () => {
  it('keeps entries inside the window', () => {
    const list = [entry({ id: 'a', at: daysAgo(1) }), entry({ id: 'b', at: daysAgo(29) })];
    expect(withinWindow(list, NOW).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops entries older than the window', () => {
    const list = [entry({ id: 'a', at: daysAgo(1) }), entry({ id: 'old', at: daysAgo(31) })];
    expect(withinWindow(list, NOW).map((e) => e.id)).toEqual(['a']);
  });

  it('drops entries dated in the future', () => {
    const list = [entry({ id: 'future', at: new Date(NOW.getTime() + 60_000) })];
    expect(withinWindow(list, NOW)).toEqual([]);
  });

  it('honours a custom window', () => {
    const list = [entry({ id: 'a', at: daysAgo(10) })];
    expect(withinWindow(list, NOW, 7)).toEqual([]);
    expect(withinWindow(list, NOW, 14)).toHaveLength(1);
  });
});

describe('counts', () => {
  it('reports the three numbers the insights screen shows', () => {
    const list = [
      entry({ id: '1', calmer: 'yes', reached: true }),
      entry({ id: '2', calmer: 'yes', reached: false }),
      entry({ id: '3', calmer: 'a_little', reached: true }),
      entry({ id: '4', calmer: 'no', reached: false }),
      entry({ id: 'old', at: daysAgo(40), calmer: 'yes', reached: true }),
    ];
    const result = insights(list, NOW);
    expect(result.sessions).toBe(4);
    expect(result.reachedFinalStep).toBe(2);
    // "A little" is not rounded up into "felt calmer".
    expect(result.feltCalmer).toBe(2);
    expect(result.windowDays).toBe(DEFAULT_WINDOW_DAYS);
  });

  it('is all zeroes for an empty journal', () => {
    const result = insights([], NOW);
    expect(result.sessions).toBe(0);
    expect(result.feelings).toEqual([]);
    expect(result.recurringBelief).toBeUndefined();
  });
});

describe('feelings chosen most', () => {
  it('ranks by how many sessions named each feeling', () => {
    const list = [
      entry({ id: '1', feelings: ['unworthy', 'rejected', 'anxious'] }),
      entry({ id: '2', feelings: ['unworthy', 'rejected'] }),
      entry({ id: '3', feelings: ['unworthy'] }),
    ];
    expect(insights(list, NOW).feelings).toEqual([
      { id: 'unworthy', label: 'Unworthy', count: 3 },
      { id: 'rejected', label: 'Rejected', count: 2 },
      { id: 'anxious', label: 'Anxious', count: 1 },
    ]);
  });

  it('counts a feeling once per session however often it is named', () => {
    const list = [entry({ id: '1', feelings: ['angry', 'angry', 'angry'] })];
    expect(insights(list, NOW).feelings).toEqual([{ id: 'angry', label: 'Angry', count: 1 }]);
  });

  it('breaks ties by label so the order is stable', () => {
    const list = [entry({ id: '1', feelings: ['sad', 'angry'] })];
    expect(insights(list, NOW).feelings.map((f) => f.id)).toEqual(['angry', 'sad']);
  });

  it('includes "Ashamed", which the Warm & Clear screens use', () => {
    const list = [entry({ id: '1', feelings: ['ashamed'] })];
    expect(insights(list, NOW).feelings).toEqual([{ id: 'ashamed', label: 'Ashamed', count: 1 }]);
  });

  it('lists only feelings actually chosen', () => {
    expect(insights([entry({ id: '1', feelings: ['sad'] })], NOW).feelings).toHaveLength(1);
  });
});

describe('the belief that comes back', () => {
  it('finds the belief appearing in the most sessions', () => {
    const list = [
      entry({ id: '1', at: daysAgo(1), belief: 'I’m not good enough.' }),
      entry({ id: '2', at: daysAgo(5), belief: 'I’m not good enough' }),
      entry({ id: '3', at: daysAgo(3), belief: 'I don’t matter.' }),
    ];
    expect(insights(list, NOW).recurringBelief).toEqual({
      belief: 'I’m not good enough.',
      sessions: 2,
    });
  });

  it('ignores case, quotes and punctuation when grouping', () => {
    const list = [
      entry({ id: '1', belief: '“I am not enough”' }),
      entry({ id: '2', belief: 'i am not enough.' }),
    ];
    expect(recurringBelief(list)?.sessions).toBe(2);
  });

  it('treats a belief said once as no pattern', () => {
    expect(recurringBelief([entry({ id: '1', belief: 'I am alone' })])).toBeUndefined();
  });

  it('reports the most recent wording', () => {
    const list = [
      entry({ id: 'older', at: daysAgo(10), belief: 'i am not enough' }),
      entry({ id: 'newer', at: daysAgo(1), belief: 'I am not enough.' }),
    ];
    expect(recurringBelief(list)?.belief).toBe('I am not enough.');
  });

  it('ignores entries with no belief', () => {
    expect(recurringBelief([entry({ id: '1' }), entry({ id: '2' })])).toBeUndefined();
  });

  it('only considers entries inside the window', () => {
    const list = [
      entry({ id: '1', at: daysAgo(1), belief: 'I am not enough' }),
      entry({ id: '2', at: daysAgo(40), belief: 'I am not enough' }),
    ];
    expect(insights(list, NOW).recurringBelief).toBeUndefined();
  });
});

describe('a belief written in Hindi', () => {
  const entry = (id: string, belief: string, daysAgo: number): JournalEntry => ({
    id,
    title: `Session ${id}`,
    occurredAt: new Date(Date.parse('2026-03-01T10:00:00.000Z') - daysAgo * 86_400_000),
    durationMinutes: 12,
    kind: 'full',
    feelings: [],
    belief,
    reachedFinalStep: true,
    sharedWithCoach: false,
  });

  /**
   * The danda is the full stop of Devanagari. Until it was stripped alongside
   * the Latin one, the same sentence with and without it was two beliefs — so
   * the belief that comes back did not come back, which is the whole insight.
   */
  it('is the same belief with or without a danda', () => {
    expect(
      recurringBelief([entry('a', 'मैं काफी नहीं हूँ', 1), entry('b', 'मैं काफी नहीं हूँ।', 4)]),
    ).toEqual({ belief: 'मैं काफी नहीं हूँ', sessions: 2 });
  });

  it('still keeps two different beliefs apart', () => {
    // `undefined`, not `null` — nothing came back twice. The parity fixture
    // writes it as null only because JSON has no undefined.
    expect(
      recurringBelief([entry('a', 'मैं काफी नहीं हूँ', 1), entry('b', 'मैं अकेला हूँ', 4)]),
    ).toBeUndefined();
  });
});
