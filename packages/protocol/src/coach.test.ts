import { describe, expect, it } from 'vitest';
import { sharedWith, summarise } from './coach.js';
import type { JournalEntry } from './journal.js';

const at = (iso: string) => new Date(iso);

function entry(p: {
  id: string;
  shared: boolean;
  belief?: string;
  occurredAt?: Date;
}): JournalEntry {
  return {
    id: p.id,
    title: 'Session',
    occurredAt: p.occurredAt ?? at('2026-10-01T09:00:00Z'),
    durationMinutes: 12,
    kind: 'full',
    feelings: [],
    reachedFinalStep: true,
    sharedWithCoach: p.shared,
    ...(p.belief === undefined ? {} : { belief: p.belief }),
  };
}

describe('sharedWith', () => {
  it('keeps only what the client shared', () => {
    const list = [entry({ id: 'a', shared: true }), entry({ id: 'b', shared: false })];
    expect(sharedWith(list).map((e) => e.id)).toEqual(['a']);
  });

  it('returns nothing when nothing is shared', () => {
    expect(sharedWith([entry({ id: 'a', shared: false })])).toEqual([]);
  });
});

describe('summarise', () => {
  it('counts only shared sessions', () => {
    const list = [
      entry({ id: 'a', shared: true }),
      entry({ id: 'b', shared: true }),
      entry({ id: 'c', shared: false }),
    ];
    expect(summarise(list).sharedCount).toBe(2);
  });

  it('reports the most recent shared session', () => {
    const list = [
      entry({ id: 'a', shared: true, occurredAt: at('2026-09-28T09:00:00Z') }),
      entry({ id: 'b', shared: true, occurredAt: at('2026-10-01T09:00:00Z') }),
    ];
    expect(summarise(list).lastSharedAt).toEqual(at('2026-10-01T09:00:00Z'));
  });

  it('ignores a newer private session when reporting the last shared one', () => {
    const list = [
      entry({ id: 'shared', shared: true, occurredAt: at('2026-09-28T09:00:00Z') }),
      entry({ id: 'private', shared: false, occurredAt: at('2026-10-02T09:00:00Z') }),
    ];
    expect(summarise(list).lastSharedAt).toEqual(at('2026-09-28T09:00:00Z'));
  });

  it('finds the belief recurring across shared sessions', () => {
    const list = [
      entry({
        id: 'a',
        shared: true,
        belief: 'I’m too much.',
        occurredAt: at('2026-10-01T09:00:00Z'),
      }),
      entry({
        id: 'b',
        shared: true,
        belief: 'I’m too much',
        occurredAt: at('2026-09-30T09:00:00Z'),
      }),
    ];
    expect(summarise(list).recurringBelief).toEqual({ belief: 'I’m too much.', sessions: 2 });
  });

  it('never lets a private session influence the pattern', () => {
    // Two private sessions share a belief; only one shared session carries it,
    // so there is no pattern a coach may see.
    const list = [
      entry({ id: 'p1', shared: false, belief: 'I am alone' }),
      entry({ id: 'p2', shared: false, belief: 'I am alone' }),
      entry({ id: 's1', shared: true, belief: 'I am alone' }),
    ];
    expect(summarise(list).recurringBelief).toBeUndefined();
  });

  it('is empty for a client who has shared nothing', () => {
    expect(summarise([entry({ id: 'a', shared: false })])).toEqual({ sharedCount: 0 });
  });

  it('is empty for a client with no sessions at all', () => {
    expect(summarise([])).toEqual({ sharedCount: 0 });
  });
});
