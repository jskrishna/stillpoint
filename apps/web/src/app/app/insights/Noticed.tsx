'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_WINDOW_DAYS } from '@stillpoint/protocol';
import { FEELING_SWATCHES } from '@stillpoint/design-tokens';
import { ApiError, api, type ApiInsights } from '../../../lib/api';
import { describeLoad } from '../../../lib/describe';
import styles from '../app.module.css';

// The server sends feeling ids as plain strings; the colour for one is
// presentation, and lives here.
const COLOR = new Map<string, string>(FEELING_SWATCHES.map((s) => [s.id, s.color]));

/**
 * Insights, computed by the server.
 *
 * The aggregation runs in PHP over the user's own window because the columns it
 * reads are encrypted and cannot be grouped in SQL. It is not repeated here:
 * two answers to "the belief that comes back" is one too many.
 */
export default function Noticed() {
  const [result, setResult] = useState<ApiInsights | null>(null);
  /** The sentence, not a boolean: the reason is the server's. */
  const [failed, setFailed] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api
      .insights()
      .then(setResult)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed(describeLoad('your insights', e));
      });
  }, [router]);

  if (failed !== null) {
    return (
      <>
        <h1 className={styles.title}>Insights</h1>
        <p className={styles.failure}>{failed}</p>
      </>
    );
  }

  if (result === null || result.sessions === 0) {
    return (
      <>
        <h1 className={styles.title}>Insights</h1>
        <p className={styles.subtitle}>Last {result?.windowDays ?? DEFAULT_WINDOW_DAYS} days</p>
        <p className={result === null ? styles.loading : styles.empty}>
          {result === null
            ? 'Loading…'
            : 'Nothing to show yet. Insights appear once you have finished a session.'}
        </p>
      </>
    );
  }

  const top = result.feelings[0]?.count ?? 1;

  return (
    <>
      <h1 className={styles.title}>Insights</h1>
      <p className={styles.subtitle}>Last {result.windowDays} days</p>

      <div className={styles.stats}>
        <Stat value={result.sessions} label="sessions" />
        <Stat value={result.feltCalmer} label="felt calmer" />
        <Stat value={result.reachedFinalStep} label="reached step 6" />
      </div>

      {result.feelings.length === 0 ? null : (
        <>
          <span className={styles.label}>FEELINGS YOU CHOSE MOST</span>
          <div className={styles.bars}>
            {result.feelings.map((f) => (
              <div key={f.id} className={styles.barRow}>
                <span className={styles.barName}>{f.label}</span>
                <span className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    style={{
                      width: `${String(Math.round((f.count / top) * 100))}%`,
                      background: COLOR.get(f.id) ?? 'transparent',
                      display: 'block',
                    }}
                  />
                </span>
                <span className={styles.barCount}>{f.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {result.recurringBelief === null ? null : (
        <>
          <span className={styles.label}>BELIEF THAT COMES BACK</span>
          <div className={styles.beliefCard}>
            <span className={styles.beliefText}>“{result.recurringBelief.belief}”</span>
            <span className={styles.cardMeta}>In {result.recurringBelief.sessions} sessions.</span>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
