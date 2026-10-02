/**
 * Sample clients for the coach portal.
 *
 * No backend, so these are the people the designs themselves name. Their
 * journals are built as ordinary JournalEntry values and shared or not through
 * the same `sharedWithCoach` flag the app uses, so the portal exercises the
 * real sharing rule rather than a convenient shortcut.
 */

import type { Attention, Client, JournalEntry } from '@stillpoint/protocol';

export const IS_SAMPLE_DATA = true;

const day = (daysAgo: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export const CLIENTS: readonly Client[] = [
  { id: 'priya', name: 'Priya S.', status: 'active', since: day(120), nextCallAt: day(0, 17) },
  { id: 'rohan', name: 'Rohan K.', status: 'active', since: day(80), nextCallAt: day(-3, 11) },
  { id: 'aarav', name: 'Aarav M.', status: 'active', since: day(30), nextCallAt: day(-4, 18) },
  { id: 'meera', name: 'Meera J.', status: 'invited' },
];

function entry(p: {
  id: string;
  title: string;
  daysAgo: number;
  minutes: number;
  feelings: JournalEntry['feelings'];
  belief?: string;
  note?: string;
  shared: boolean;
}): JournalEntry {
  return {
    id: p.id,
    title: p.title,
    occurredAt: day(p.daysAgo),
    durationMinutes: p.minutes,
    kind: 'full',
    feelings: p.feelings,
    reachedFinalStep: true,
    sharedWithCoach: p.shared,
    ...(p.belief === undefined ? {} : { belief: p.belief }),
    ...(p.note === undefined ? {} : { note: p.note }),
  };
}

/** Each client's whole journal, shared and private alike. */
export const CLIENT_JOURNALS: Readonly<Record<string, readonly JournalEntry[]>> = {
  priya: [
    entry({
      id: 'p1',
      title: 'Mother criticised my cooking',
      daysAgo: 3,
      minutes: 18,
      feelings: ['ashamed', 'hurt', 'rejected'],
      belief: 'I’m too much.',
      note: 'This one felt big. Want to talk about it.',
      shared: true,
    }),
    entry({
      id: 'p2',
      title: 'Team lead ignored my idea',
      daysAgo: 5,
      minutes: 12,
      feelings: ['rejected'],
      belief: 'I’m too much.',
      shared: true,
    }),
    entry({
      id: 'p3',
      title: 'Argument at home',
      daysAgo: 8,
      minutes: 15,
      feelings: ['angry'],
      belief: 'I’m too much.',
      shared: true,
    }),
    entry({
      id: 'p4',
      title: 'Felt left out',
      daysAgo: 12,
      minutes: 9,
      feelings: ['lonely'],
      belief: 'I’m too much.',
      shared: true,
    }),
    entry({
      id: 'p5',
      title: 'A hard morning',
      daysAgo: 14,
      minutes: 7,
      feelings: ['anxious'],
      belief: 'I don’t matter.',
      shared: true,
    }),
    entry({
      id: 'p6',
      title: 'Work review',
      daysAgo: 18,
      minutes: 11,
      feelings: ['afraid'],
      belief: 'I don’t matter.',
      shared: true,
    }),
    // Private: must never reach the coach's screens.
    entry({
      id: 'p7',
      title: 'Something I have not shared',
      daysAgo: 1,
      minutes: 20,
      feelings: ['guilty'],
      belief: 'A private belief.',
      shared: false,
    }),
  ],
  rohan: [
    entry({
      id: 'r1',
      title: 'Message left on read',
      daysAgo: 4,
      minutes: 10,
      feelings: ['afraid'],
      belief: 'I’ll be left.',
      shared: true,
    }),
    entry({
      id: 'r2',
      title: 'Plans cancelled',
      daysAgo: 9,
      minutes: 8,
      feelings: ['sad'],
      belief: 'I’ll be left.',
      shared: true,
    }),
  ],
  aarav: [
    entry({
      id: 'a1',
      title: 'Called out at work',
      daysAgo: 0,
      minutes: 14,
      feelings: ['ashamed', 'rejected', 'unworthy'],
      belief: 'I’m not good enough.',
      shared: true,
    }),
  ],
  meera: [],
};

/**
 * What the portal surfaces as needing attention.
 *
 * A safety pause is never journalled and so can never be shared — the coach
 * learns of it because the product tells them, not by reading the session.
 */
export const ATTENTION: readonly Attention[] = [
  { clientId: 'priya', reason: 'had a safety pause', at: day(3) },
];
