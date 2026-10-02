'use client';

import { useState } from 'react';
import {
  SAFETY_CATEGORY_LABEL,
  byUrgency,
  markReviewed,
  openFlags,
  type SafetyFlag,
} from '@stillpoint/protocol';
import { SAFETY_FLAGS } from '../../../lib/admin-data';
import styles from '../admin.module.css';

/**
 * The safety queue.
 *
 * Ordered by byUrgency(), so the most severe flag is always the one staff meet
 * first — the ordering is the domain's, not a sort written into the table.
 */
export default function SafetyQueue() {
  const [flags, setFlags] = useState<readonly SafetyFlag[]>(SAFETY_FLAGS);
  const ordered = byUrgency(flags);
  const [selectedId, setSelectedId] = useState<string>(ordered[0]?.id ?? '');
  const selected = ordered.find((f) => f.id === selectedId) ?? ordered[0];

  const review = (id: string) => {
    setFlags((current) => current.map((f) => (f.id === id ? markReviewed(f) : f)));
  };

  return (
    <>
      <h1 className={styles.title}>Safety flags</h1>
      <p className={styles.sub}>{openFlags(flags).length} open · most severe first · sample data</p>

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
              <tr
                key={f.id}
                onClick={() => {
                  setSelectedId(f.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <td className={styles.td}>
                  <span className={`${styles.tag} ${levelClass(f.level)}`}>{label(f.level)}</span>
                </td>
                <td className={styles.td}>{SAFETY_CATEGORY_LABEL[f.category]}</td>
                <td className={styles.td}>“{truncate(f.excerpt)}”</td>
                <td className={styles.td}>{f.status === 'open' ? 'Open' : 'Reviewed'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {selected === undefined ? null : (
          <div className={styles.detail}>
            <span className={`${styles.tag} ${levelClass(selected.level)}`}>
              {label(selected.level)} · {SAFETY_CATEGORY_LABEL[selected.category]}
            </span>
            <span className={styles.statLabel}>WHAT THE USER SAID</span>
            <span className={styles.quote}>“{selected.excerpt}”</span>
            <span className={styles.statLabel}>WHAT HAPPENED</span>
            <span className={styles.quote}>{selected.outcome}</span>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              disabled={selected.status === 'reviewed'}
              onClick={() => {
                review(selected.id);
              }}
            >
              {selected.status === 'reviewed' ? 'Reviewed' : 'Mark as reviewed'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function label(level: SafetyFlag['level']): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function levelClass(level: SafetyFlag['level']): string {
  if (level === 'high') return styles.tagHigh ?? '';
  if (level === 'medium') return styles.tagMedium ?? '';
  return '';
}

function truncate(text: string, max = 48): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
