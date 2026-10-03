'use client';

import { useEffect, useState } from 'react';
import { ApiError, api, type ApiSafetyFlag } from '../../../lib/api';
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
export default function SafetyQueue() {
  const [flags, setFlags] = useState<readonly ApiSafetyFlag[] | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setFlags(null);
    setProblem(null);
    api
      .safetyFlags(showReviewed ? 'all' : 'open')
      .then(setFlags)
      .catch((e: unknown) => {
        setProblem(
          e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
            ? 'The safety queue is for reviewers. Sign in with an admin account.'
            : 'Could not load the queue. Check your connection.',
        );
      });
  }, [showReviewed]);

  const ordered = flags ?? [];
  const open = ordered.filter((f) => f.status === 'open').length;
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
        {flags === null ? 'Loading…' : `${open} open · most severe first`}
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
                  <td className={styles.td}>{f.status === 'open' ? 'Open' : 'Reviewed'}</td>
                </tr>
              ))}
            </tbody>
          </table>

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
