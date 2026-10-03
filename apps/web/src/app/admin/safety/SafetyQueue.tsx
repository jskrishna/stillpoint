'use client';

import { useEffect, useState } from 'react';
import { ApiError, api, type ApiSafetyFlag } from '../../../lib/api';
import { ago, describeAge, exact } from '../../../lib/ago';
import styles from '../admin.module.css';

/**
 * The safety queue.
 *
 * Ordered by the server, which orders by severity and then recency — the
 * ordering is the domain's, not a sort written into this table. Marking
 * reviewed is a POST and the row is replaced with what came back, so this
 * screen never shows a review the server did not record.
 *
 * Everything here is admin-only. A coach is not an admin: this holds what
 * someone said at the moment they said they were not safe, and the server
 * answers 404 to anyone without the role.
 */
/** How many flags a page holds. */
const PAGE = 50;

export default function SafetyQueue() {
  const [flags, setFlags] = useState<readonly ApiSafetyFlag[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const status = showReviewed ? 'all' : 'open';

  useEffect(() => {
    setFlags(null);
    setCursor(null);
    setProblem(null);
    api
      .safetyFlags(showReviewed ? 'all' : 'open', PAGE)
      .then((page) => {
        setFlags(page.items);
        setCursor(page.nextCursor);
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        setProblem(
          e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
            ? 'The safety queue is for reviewers. Sign in with an admin account.'
            : 'Could not load the queue. Check your connection.',
        );
      });
  }, [showReviewed]);

  const loadMore = async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.safetyFlags(status, PAGE, cursor);
      setFlags((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch {
      setProblem('Could not load more of the queue. Check your connection.');
    } finally {
      setLoadingMore(false);
    }
  };

  const ordered = flags ?? [];
  const selected = ordered.find((f) => f.id === selectedId) ?? ordered[0];

  const review = async (id: string) => {
    try {
      const updated = await api.reviewSafetyFlag(id);
      setFlags((current) => (current ?? []).map((f) => (f.id === updated.id ? updated : f)));
      setProblem(null);
    } catch {
      setProblem('Could not record that review. Check your connection.');
    }
  };

  if (problem !== null && flags === null) {
    return (
      <>
        <h1 className={styles.title}>Safety flags</h1>
        <p className={styles.sub}>{problem}</p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Safety flags</h1>
      <p className={styles.sub}>
        {flags === null
          ? 'Loading…'
          : // The server's count of the whole queue, not of this page: a
            // reviewer needs to know how much is waiting.
            `${String(total)} ${showReviewed ? 'in all' : 'open'} · most severe first`}
        {' · '}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setShowReviewed((v) => !v);
            setSelectedId(null);
          }}
        >
          {showReviewed ? 'Open only' : 'Include reviewed'}
        </button>
      </p>

      {problem === null ? null : <p className={styles.sub}>{problem}</p>}

      {flags !== null && ordered.length === 0 ? (
        <p className={styles.sub}>
          Nothing in the queue. {showReviewed ? 'No flags at all yet.' : 'Nothing open.'}
        </p>
      ) : (
        <div className={styles.split}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Level</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>What was said</th>
                <th className={styles.th}>Raised</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((f) => (
                <tr key={f.id}>
                  <td className={styles.td}>
                    <button
                      type="button"
                      className={`${styles.tag} ${levelClass(f.level)} ${styles.rowButton}`}
                      onClick={() => {
                        setSelectedId(f.id);
                      }}
                      aria-label={`Open the ${f.level} ${f.categoryLabel} flag`}
                    >
                      {label(f.level)}
                    </button>
                  </td>
                  <td className={styles.td}>{f.categoryLabel}</td>
                  <td className={styles.td}>“{truncate(f.excerpt)}”</td>
                  {/*
                    The age, which the queue did not show at all. After its
                    severity it is the thing a reviewer most needs: a `high`
                    raised four days ago is a different situation from the same
                    flag raised twenty minutes ago. Rounded down in the cell,
                    exact in the tooltip and in the label a screen reader gets.
                  */}
                  <td className={styles.td} title={exact(f.raisedAt)}>
                    <span aria-label={`Raised ${describeAge(f.raisedAt)} ago`}>
                      {ago(f.raisedAt)}
                    </span>
                  </td>
                  <td className={styles.td}>{f.status === 'open' ? 'Open' : 'Reviewed'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {cursor === null ? null : (
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => {
                void loadMore();
              }}
              disabled={loadingMore}
            >
              {loadingMore
                ? 'Loading…'
                : `Load more (${String(ordered.length)} of ${String(total)})`}
            </button>
          )}

          {selected === undefined ? null : (
            <div className={styles.detail}>
              <span className={`${styles.tag} ${levelClass(selected.level)}`}>
                {label(selected.level)} · {selected.categoryLabel}
              </span>
              <span className={styles.statLabel}>WHO</span>
              <span className={styles.quote}>{selected.user}</span>
              <span className={styles.statLabel}>WHAT THE USER SAID</span>
              <span className={styles.quote}>“{selected.excerpt}”</span>
              <span className={styles.statLabel}>WHAT HAPPENED</span>
              <span className={styles.quote}>{selected.outcome}</span>
              <span className={styles.statLabel}>WHEN</span>
              <span className={styles.quote}>
                {describeAge(selected.raisedAt)} ago
                {exact(selected.raisedAt) === undefined ? '' : ` · ${exact(selected.raisedAt)}`}
              </span>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                disabled={selected.status === 'reviewed'}
                onClick={() => {
                  void review(selected.id);
                }}
              >
                {selected.status === 'reviewed' ? 'Reviewed' : 'Mark as reviewed'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function label(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function levelClass(level: string): string {
  if (level === 'high') return styles.tagHigh ?? '';
  if (level === 'medium') return styles.tagMedium ?? '';
  return '';
}

function truncate(text: string, max = 48): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
