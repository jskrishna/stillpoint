'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_WINDOW_DAYS, insights, type Insights } from '@stillpoint/protocol';
import { FEELING_COLOR } from '@stillpoint/design-tokens';
import { browserJournalStore } from '../../../lib/journal-store';
import styles from '../app.module.css';

export default function InsightsPage() {
  const [result, setResult] = useState<Insights | null>(null);

  useEffect(() => {
    setResult(insights(browserJournalStore.list(), new Date()));
  }, []);

  if (result === null || result.sessions === 0) {
    return (
      <>
        <h1 className={styles.title}>Insights</h1>
        <p className={styles.subtitle}>Last {DEFAULT_WINDOW_DAYS} days</p>
        <p className={styles.empty}>
          Nothing to show yet. Insights appear once you have finished a session.
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
                      background: FEELING_COLOR[f.id],
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

      {result.recurringBelief === undefined ? null : (
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
