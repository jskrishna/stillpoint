'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STEP_COUNT } from '@stillpoint/protocol';
import { ApiError, api, hasToken, type ApiJournalEntry } from '../../lib/api';
import { greeting } from '../../lib/greeting';
import { relativeDay } from '../../lib/format';
import styles from './app.module.css';

/** The app home: start a session, and the most recent entries. */
export default function Home() {
  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  // Fetched after mount with the user's token, which the server has no access
  // to — so there is nothing to render until then.
  useEffect(() => {
    setNow(new Date());

    if (!hasToken()) {
      router.push('/welcome');
      return;
    }

    api
      // Only the three most recent are shown, so only three are asked for.
      .journal(3)
      .then((page) => {
        setEntries(page.items);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed(true);
      });
  }, [router]);

  const recent = (entries ?? []).slice(0, 3);

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

      <span className={styles.label}>RECENT</span>
      {failed ? (
        <p className={styles.failure}>Could not load your journal. Check your connection.</p>
      ) : entries === null ? (
        <p className={styles.loading}>Loading…</p>
      ) : recent.length === 0 ? (
        <p className={styles.empty}>Nothing yet. Your finished sessions will appear here.</p>
      ) : (
        recent.map((entry) => (
          <Link key={entry.id} href={`/app/journal/${entry.id}`} className={styles.card}>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{entry.title}</span>
              <span className={styles.cardMeta}>
                {now === null ? '' : relativeDay(new Date(entry.occurredAt), now)}
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
