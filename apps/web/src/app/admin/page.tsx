'use client';

import { useEffect, useState } from 'react';
import { STEP_LIST } from '@stillpoint/protocol';
import { describeAge } from '../../lib/ago';
import { ApiError, api, type ApiAdminOverview } from '../../lib/api';
import styles from './admin.module.css';

const RESULT_LABEL: Readonly<Record<string, string>> = {
  yes: 'Calmer',
  a_little: 'A little',
  no: 'No change',
  safety: 'Safety',
  unrated: 'Unrated',
};

/**
 * The console's overview.
 *
 * Every figure is computed by the server from plain columns — kind, step, end
 * reason, rating. None of it touches the encrypted text: this screen answers
 * "how is the protocol working", and the one place staff read someone's words
 * is the safety queue, which has its own screen and its own reason.
 */
export default function Overview() {
  const [overview, setOverview] = useState<ApiAdminOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminOverview()
      .then(setOverview)
      .catch((e: unknown) => {
        setProblem(
          e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
            ? 'The console is for staff. Sign in with an admin account.'
            : 'Could not load the overview. Check your connection.',
        );
      });
  }, []);

  if (overview === null) {
    return (
      <>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.sub}>{problem ?? 'Loading…'}</p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Overview</h1>
      <p className={styles.sub}>Last {overview.windowDays} days</p>

      <div className={styles.stats}>
        <Stat value={overview.sessions.toLocaleString('en-IN')} label="sessions" />
        <Stat value={`${String(overview.reachedFinalStepPct)}%`} label="reached step 6" />
        <Stat value={`${String(overview.feltCalmerPct)}%`} label="felt calmer" />
        <Stat value={String(overview.openFlags)} label="open safety flags" />
      </div>

      {/*
        The count on its own is reassuring in the wrong way. Four open flags
        reads as a manageable afternoon until you learn the oldest has been
        waiting six days — a queue nobody is getting through is the
        safeguarding failure, and it is invisible in a number.
      */}
      {overview.openFlags === 0 ? (
        <p className={styles.sub}>Nothing is waiting in the safety queue.</p>
      ) : (
        <p className={styles.sub}>
          The longest-waiting open flag was raised{' '}
          <strong>{describeAge(overview.oldestOpenFlagAt)} ago</strong>.
        </p>
      )}

      <span className={styles.label}>HOW FAR PEOPLE GET</span>
      <div className={styles.funnel}>
        {STEP_LIST.map((step, i) => {
          const reach = overview.stepReach[i] ?? 0;
          return (
            <div key={step.id} className={styles.funnelRow}>
              <span className={styles.funnelName}>Step {step.ordinal}</span>
              <span className={styles.funnelTrack}>
                <span className={styles.funnelFill} style={{ width: `${String(reach)}%` }} />
              </span>
              <span className={styles.funnelCount}>{reach}</span>
            </div>
          );
        })}
      </div>

      <span className={styles.label}>WHAT THE SCREEN COULD NOT READ</span>
      <p className={styles.sub}>
        {overview.unreadableTurns === 0
          ? 'Nothing this window. The safety screen reads English, Hinglish and Hindi; anything written in another script is not screened at all, and this is where that would show.'
          : `${String(overview.unreadableTurns)} ${
              overview.unreadableTurns === 1 ? 'turn' : 'turns'
            } in ${String(overview.unreadableSessions)} ${
              overview.unreadableSessions === 1 ? 'session' : 'sessions'
            } were written in a script the safety screen has no phrases for, so they were not screened. Nobody was flagged for it — it is counted so the gap is visible.`}
      </p>

      <span className={styles.label}>RECENT SESSIONS</span>
      {overview.recentSessions.length === 0 ? (
        <p className={styles.sub}>No sessions yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>User</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Reached</th>
              <th className={styles.th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {overview.recentSessions.map((s, i) => (
              <tr key={`${s.user}-${String(i)}`}>
                <td className={styles.td}>{s.user}</td>
                <td className={styles.td}>
                  {s.kind === 'quick' ? 'Quick' : 'Deep'} · {s.minutes} min
                </td>
                <td className={styles.td}>Step {s.reachedStep}</td>
                <td className={styles.td}>
                  <span className={`${styles.tag} ${s.result === 'safety' ? styles.tagHigh : ''}`}>
                    {RESULT_LABEL[s.result] ?? s.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
