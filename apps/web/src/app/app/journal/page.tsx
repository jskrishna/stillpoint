'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api, type ApiJournalEntry } from '../../../lib/api';
import styles from '../app.module.css';
import { duration, relativeDay } from '@stillpoint/protocol';

/**
 * The journal, as the server keeps it.
 *
 * The title and the one-line summary are computed server-side, from columns
 * that are encrypted at rest. This screen renders them and adds nothing: a
 * second summary rule in the browser would be a second answer to "what was
 * this session about".
 */
/** How many entries a page holds. The journal grows; the screen does not. */
const PAGE = 20;

export default function Journal() {
  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    api
      .journal(PAGE)
      .then((page) => {
        setEntries(page.items);
        setCursor(page.nextCursor);
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed(true);
      });
  }, [router]);

  const loadOlder = async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.journal(PAGE, cursor);
      setEntries((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>Journal</h1>
      <p className={styles.subtitle}>
        Only you can see these.
        {entries === null || total <= entries.length
          ? ''
          : ` Showing ${String(entries.length)} of ${String(total)}.`}
      </p>

      {failed ? (
        <p className={styles.failure}>Could not load your journal. Check your connection.</p>
      ) : entries === null ? (
        <p className={styles.loading}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>Nothing yet. When you finish a session it is saved here.</p>
      ) : (
        entries.map((entry) => (
          <Link key={entry.id} href={`/app/journal/${entry.id}`} className={styles.row}>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{entry.title}</span>
              <span className={styles.cardMeta}>
                {now === null ? '' : relativeDay(new Date(entry.occurredAt), now)} ·{' '}
                {duration(entry.durationMinutes)}
              </span>
              <span className={styles.rowBelief}>{entry.summary}</span>
            </span>
            <span className={styles.chevron}>›</span>
          </Link>
        ))
      )}

      {cursor === null ? null : (
        <button
          type="button"
          className={styles.cta}
          onClick={() => {
            void loadOlder();
          }}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load older'}
        </button>
      )}
    </>
  );
}
