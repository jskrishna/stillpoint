'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { byNewest, listSummary, type JournalEntry } from '@stillpoint/protocol';
import { browserJournalStore } from '../../../lib/journal-store';
import { duration, relativeDay } from '../../../lib/format';
import styles from '../app.module.css';

export default function Journal() {
  const [entries, setEntries] = useState<readonly JournalEntry[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setEntries(byNewest(browserJournalStore.list()));
    setNow(new Date());
  }, []);

  return (
    <>
      <h1 className={styles.title}>Journal</h1>
      <p className={styles.subtitle}>Only you can see these.</p>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          Nothing yet. When you finish a session it is saved here, on this device only.
        </p>
      ) : (
        entries.map((entry) => (
          <Link key={entry.id} href={`/app/journal/${entry.id}`} className={styles.row}>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{entry.title}</span>
              <span className={styles.cardMeta}>
                {now === null ? '' : relativeDay(entry.occurredAt, now)} ·{' '}
                {duration(entry.durationMinutes)}
              </span>
              <span className={styles.rowBelief}>{listSummary(entry)}</span>
            </span>
            <span className={styles.chevron}>›</span>
          </Link>
        ))
      )}
    </>
  );
}
