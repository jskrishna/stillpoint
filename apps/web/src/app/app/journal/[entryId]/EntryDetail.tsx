'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FEELINGS, withNote, withSharing, type JournalEntry } from '@stillpoint/protocol';
import { browserJournalStore } from '../../../../lib/journal-store';
import { duration, relativeDay } from '../../../../lib/format';
import styles from '../../app.module.css';

const LABEL = new Map(FEELINGS.map((f) => [f.id, f.label]));

/** One journal entry, with the note, sharing and delete the designs give it. */
export default function EntryDetail({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    const found = browserJournalStore.get(entryId);
    setEntry(found ?? null);
    setNote(found?.note ?? '');
    setNow(new Date());
  }, [entryId]);

  if (entry === undefined) return <p className={styles.empty}>Loading…</p>;
  if (entry === null) {
    return (
      <>
        <h1 className={styles.title}>Not found</h1>
        <p className={styles.empty}>
          This entry is not in this browser. Journal entries are stored on the device they were
          written on.
        </p>
        <Link href="/app/journal" className={styles.cta}>
          Back to journal
        </Link>
      </>
    );
  }

  // Both of these change the stored entry through an updater rather than
  // writing back a copy held in state. Writing the whole entry back loses
  // whatever the other control changed in between — which is exactly how the
  // note disappeared the moment sharing was toggled.
  const saveNote = (value: string) => {
    setNote(value);
    browserJournalStore.update(entry.id, (e) => withNote(e, value));
    setEntry((current) =>
      current === null || current === undefined ? current : withNote(current, value),
    );
  };

  const toggleShare = () => {
    const shared = !entry.sharedWithCoach;
    browserJournalStore.update(entry.id, (e) => withSharing(e, shared));
    setEntry((current) =>
      current === null || current === undefined ? current : withSharing(current, shared),
    );
  };

  const remove = () => {
    browserJournalStore.remove(entry.id);
    router.push('/app/journal');
  };

  const rows = [
    {
      label: 'WHAT YOU FELT',
      value: entry.feelings.map((id) => LABEL.get(id) ?? id).join(', '),
    },
    {
      label:
        entry.memory?.age === undefined ? 'MEMORY' : `MEMORY (AGE ${String(entry.memory.age)})`,
      value: entry.memory?.description,
    },
    { label: 'OLD BELIEF', value: entry.belief === undefined ? undefined : `“${entry.belief}”` },
    { label: 'FORGIVENESS', value: entry.forgiveness },
  ].filter((r): r is { label: string; value: string } => r.value !== undefined && r.value !== '');

  return (
    <>
      <Link href="/app/journal" className={styles.cardMeta}>
        ← Journal
      </Link>
      <span className={styles.label} style={{ marginTop: 10 }}>
        {now === null ? '' : relativeDay(entry.occurredAt, now).toUpperCase()} ·{' '}
        {duration(entry.durationMinutes).toUpperCase()}
        {entry.calmerRating === 'yes' ? ' · FELT CALMER' : ''}
      </span>
      <h1 className={styles.title}>{entry.title}</h1>

      <div>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.rowBelief}>{row.value}</span>
          </div>
        ))}
      </div>

      <label className={styles.label} style={{ marginTop: 16 }}>
        My note
      </label>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => {
          saveNote(e.target.value);
        }}
        placeholder="Anything you want to remember."
        style={{
          marginTop: 8,
          border: '1.5px solid var(--sp-color-field)',
          borderRadius: 'var(--sp-radius-field)',
          padding: 'var(--sp-space-md)',
          background: 'var(--sp-color-panel)',
          color: 'var(--sp-color-ink)',
          font: 'inherit',
          fontSize: 'var(--sp-text-control)',
          resize: 'vertical',
        }}
      />

      <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', gap: 10 }}>
        <button type="button" onClick={toggleShare} className={styles.cta} style={{ flexGrow: 1 }}>
          {entry.sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
        </button>
        <button
          type="button"
          onClick={remove}
          className={styles.cta}
          style={{
            flexGrow: 1,
            background: 'var(--sp-color-panel)',
            color: 'var(--sp-color-danger)',
            boxShadow: 'var(--sp-shadow-button)',
          }}
        >
          Delete
        </button>
      </div>
    </>
  );
}
