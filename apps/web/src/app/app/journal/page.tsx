'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api, type ApiJournalEntry } from '../../../lib/api';
import { describeLoad } from '../../../lib/describe';
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
  /** The sentence, not a boolean: the reason is the server's. */
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  /**
   * What arrived, for a screen reader, and empty until something has.
   *
   * The subtitle already carries "Showing 20 of 38." and suppresses itself
   * once everything is loaded, which is sensible on a first load — "Showing 8
   * of 8." is noise — and is exactly backwards after a press: the sentence
   * that would confirm eighteen more entries arrived is the one that
   * disappears when they do. So the confirmation is its own polite region,
   * silent until there is news, in the same words the subtitle uses.
   */
  const [arrived, setArrived] = useState('');
  const arrivedRef = useRef<HTMLParagraphElement | null>(null);
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
        setFailed(describeLoad('your journal', e));
      });
  }, [router]);

  const loadOlder = async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.journal(PAGE, cursor);
      const shown = (entries?.length ?? 0) + page.items.length;
      setEntries((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
      setTotal(page.total);
      setArrived(`Showing ${String(shown)} of ${String(page.total)}.`);

      // The button goes when the last page lands, and the press that made it
      // go has nowhere to leave focus — measured, `document.activeElement`
      // became `<body>`, returning a keyboard user to the top of a list that
      // had just got longer. So focus moves to the line that says what
      // arrived, which is the same answer as the session screen's pause: when
      // the thing you pressed is gone, something has to take focus
      // deliberately. While the button is still there it keeps focus itself,
      // which is what `aria-disabled` below is for.
      if (page.nextCursor === null) {
        requestAnimationFrame(() => arrivedRef.current?.focus());
      }
    } catch (e: unknown) {
      // The error is bound rather than discarded. "No error object to
      // describe" was true of this line only because it did not bind one, and
      // a 429 here — the budget every authenticated route shares — was being
      // reported as a bad connection.
      setFailed(describeLoad('more', e));
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

      {/*
        Polite, not an alert: more of somebody's own journal arriving is not
        something to interrupt them with. The opposite of the session screen's
        crisis block, and the same reasoning.
      */}
      <p
        ref={arrivedRef}
        role="status"
        tabIndex={-1}
        className={styles.subtitle}
        style={
          arrived === ''
            ? {
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
              }
            : undefined
        }
      >
        {arrived}
      </p>

      {failed !== null ? (
        <p className={styles.failure}>{failed}</p>
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
          /*
           * `aria-disabled`, not `disabled`, for the reason the console's
           * buttons have it: a `disabled` button leaves the tab order, so the
           * focus that was on it lands at the top of the document. Measured
           * here — focus was on "Load older", the press made it `<body>`, and
           * it stayed there. The handler refuses the second press.
           */
          aria-disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load older'}
        </button>
      )}
    </>
  );
}
