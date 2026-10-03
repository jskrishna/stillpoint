'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FEELINGS, duration, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry } from '../../../../lib/api';
import styles from '../../app.module.css';

const LABEL = new Map<string, string>(FEELINGS.map((f) => [f.id, f.label]));

/** How long after the last keystroke the note is sent. */
const SAVE_AFTER_MS = 700;

/**
 * One journal entry, with the note, sharing and delete the designs give it.
 *
 * The note and the sharing flag are sent as separate PATCHes carrying only the
 * field that changed. The server applies each on its own, so one cannot clobber
 * the other — which is how the note used to vanish the moment sharing was
 * toggled.
 */
export default function EntryDetail({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<ApiJournalEntry | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const loadedNote = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    api
      .journalEntry(entryId)
      .then((found) => {
        setEntry(found);
        setNote(found.note ?? '');
        loadedNote.current = found.note ?? '';
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setEntry(null);
      });
  }, [entryId, router]);

  // The note is saved after typing stops, not inside the change handler: a
  // save belongs to an effect, where React decides when it runs, and not to a
  // render that may happen twice.
  useEffect(() => {
    if (loadedNote.current === null || note === loadedNote.current) return;
    const timer = setTimeout(() => {
      setSaving(true);
      api
        .updateJournalEntry(entryId, { note: note === '' ? null : note })
        .then((updated) => {
          loadedNote.current = updated.note ?? '';
          setEntry(updated);
          setFailed(null);
        })
        .catch(() => {
          setFailed('Your note is not saved. Check your connection.');
        })
        .finally(() => {
          setSaving(false);
        });
    }, SAVE_AFTER_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [note, entryId]);

  if (entry === undefined) return <p className={styles.loading}>Loading…</p>;
  if (entry === null) {
    return (
      <>
        <h1 className={styles.title}>Not found</h1>
        <p className={styles.empty}>This entry is no longer in your journal.</p>
        <Link href="/app/journal" className={styles.cta}>
          Back to journal
        </Link>
      </>
    );
  }

  const toggleShare = async () => {
    try {
      setEntry(await api.updateJournalEntry(entry.id, { sharedWithCoach: !entry.sharedWithCoach }));
      setFailed(null);
    } catch {
      setFailed('Could not change sharing. Check your connection.');
    }
  };

  const remove = async () => {
    try {
      await api.deleteJournalEntry(entry.id);
      router.push('/app/journal');
    } catch {
      setFailed('Could not delete this entry. Check your connection.');
    }
  };

  const rows = [
    {
      label: 'WHAT YOU FELT',
      value: entry.feelings.map((id) => LABEL.get(id) ?? id).join(', '),
    },
    {
      label:
        entry.memory?.age === undefined ? 'MEMORY' : `MEMORY (AGE ${String(entry.memory.age)})`,
      value: entry.memory?.description ?? null,
    },
    { label: 'OLD BELIEF', value: entry.belief === null ? null : `“${entry.belief}”` },
    { label: 'FORGIVENESS', value: entry.forgiveness },
  ].filter((r): r is { label: string; value: string } => r.value !== null && r.value !== '');

  return (
    <>
      <Link href="/app/journal" className={styles.cardMeta}>
        ← Journal
      </Link>
      <span className={styles.label} style={{ marginTop: 10 }}>
        {now === null ? '' : relativeDay(new Date(entry.occurredAt), now).toUpperCase()} ·{' '}
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
        My note{saving ? ' · saving…' : ''}
      </label>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
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

      {failed === null ? null : (
        <p className={styles.failure} role="alert">
          {failed}
        </p>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => {
            void toggleShare();
          }}
          className={styles.cta}
          style={{ flexGrow: 1 }}
        >
          {entry.sharedWithCoach ? 'Shared with coach' : 'Share with coach'}
        </button>
        <button
          type="button"
          onClick={() => {
            void remove();
          }}
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
