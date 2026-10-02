/**
 * Sample data for the admin console.
 *
 * There is no backend, so these are the figures the designs themselves print,
 * kept in one place and clearly labelled rather than scattered through the
 * screens as if they were live. Replace with a real source; nothing reads them
 * except the admin pages.
 */

import type { SafetyFlag } from '@stillpoint/protocol';

/** Marks the console as showing sample rather than live figures. */
export const IS_SAMPLE_DATA = true;

export const OVERVIEW = {
  windowDays: 7,
  sessions: 4812,
  reachedFinalStepPct: 71,
  feltCalmerPct: 78,
} as const;

/** How many of every 100 sessions reach each step. */
export const STEP_REACH: readonly number[] = [100, 94, 90, 79, 74, 71];

export interface RecentSession {
  readonly user: string;
  readonly kind: 'Deep' | 'Quick';
  readonly minutes: number;
  readonly reachedStep: number;
  readonly result: 'Calmer' | 'A little' | 'Safety';
}

export const RECENT_SESSIONS: readonly RecentSession[] = [
  { user: 'u_8f21', kind: 'Deep', minutes: 14, reachedStep: 6, result: 'Calmer' },
  { user: 'u_2c90', kind: 'Quick', minutes: 3, reachedStep: 3, result: 'A little' },
  { user: 'u_71ab', kind: 'Deep', minutes: 9, reachedStep: 4, result: 'Safety' },
  { user: 'u_3d10', kind: 'Deep', minutes: 18, reachedStep: 6, result: 'Calmer' },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

export const SAFETY_FLAGS: readonly SafetyFlag[] = [
  {
    id: 'f_1',
    sessionId: 'ses_4f8a21',
    level: 'high',
    category: 'self_harm',
    excerpt: 'I keep messing up. Sometimes I think everyone would be better off without me.',
    outcome: 'Session stopped. Helplines shown. User tapped “Call Tele-MANAS”.',
    raisedAt: hoursAgo(0.07),
    status: 'open',
  },
  {
    id: 'f_2',
    sessionId: 'ses_90bc12',
    level: 'medium',
    category: 'trauma',
    excerpt: '…blaming myself for my father…',
    outcome: 'Flagged for review. Session continued.',
    raisedAt: hoursAgo(1),
    status: 'open',
  },
  {
    id: 'f_3',
    sessionId: 'ses_71ab03',
    level: 'medium',
    category: 'harm_to_others',
    excerpt: '…I could hurt him…',
    outcome: 'Flagged for review. Session continued.',
    raisedAt: hoursAgo(3),
    status: 'open',
  },
  {
    id: 'f_4',
    sessionId: 'ses_2c9044',
    level: 'low',
    category: 'medical',
    excerpt: '…stopped my meds…',
    outcome: 'Flagged for review. Session continued.',
    raisedAt: hoursAgo(26),
    status: 'reviewed',
  },
];
