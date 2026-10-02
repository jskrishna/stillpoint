'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STEP_COUNT, byNewest, type JournalEntry } from '@stillpoint/protocol';
import { browserJournalStore, storageAvailable } from '../../lib/journal-store';
import { greeting } from '../../lib/greeting';
import { relativeDay } from '../../lib/format';
import styles from './app.module.css';

/** The app home: start a session, and the most recent entries. */
export default function Home() {
  const [entries, setEntries] = useState<readonly JournalEntry[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [canStore, setCanStore] = useState(true);

  // Read after mount: the journal lives in this browser, so the server has
  // nothing to render and a first paint from it would flash the wrong state.
  useEffect(() => {
    setEntries(byNewest(browserJournalStore.list()));
    setNow(new Date());
    setCanStore(storageAvailable());
  }, []);

  const recent = entries.slice(0, 3);

  return (
    <>
      <span className={styles.greeting}>{now === null ? ' ' : greeting(now)}</span>
      <h1 className={styles.title}>Something bothering you?</h1>
      <p className={styles.lead}>
        Talk it through in {STEP_COUNT} simple steps. It takes about 10–15 minutes.
      </p>

      <Link href="/session" className={styles.cta}>
        <MicIcon />
        Start talking
      </Link>

      {canStore ? null : (
        <p className={styles.notice}>
          This browser is blocking storage, so sessions cannot be saved to your journal.
        </p>
      )}

      <span className={styles.label}>RECENT</span>
      {recent.length === 0 ? (
        <p className={styles.empty}>Nothing yet. Your finished sessions will appear here.</p>
      ) : (
        recent.map((entry) => (
          <Link key={entry.id} href={`/app/journal`} className={styles.card}>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{entry.title}</span>
              <span className={styles.cardMeta}>
                {now === null ? '' : relativeDay(entry.occurredAt, now)}
                {entry.calmerRating === 'yes' ? ' · Felt calmer' : ''}
              </span>
            </span>
            <span className={styles.chevron}>›</span>
          </Link>
        ))
      )}
    </>
  );
}

function MicIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
