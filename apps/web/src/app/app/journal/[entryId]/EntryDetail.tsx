'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FEELINGS,
  coachSharingFromStored,
  duration,
  mayShareEntry,
  relativeDay,
  type CoachSharing,
} from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry } from '../../../../lib/api';
import { describe } from '../../../../lib/describe';
import { SaveStatus, type SaveState } from '../../../../components/SaveStatus';
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
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * The owner's standing choice about their coach, because the server enforces
   * it and a button it will refuse should not be offered. It starts at the
   * designed default, which permits sharing — the control is left alone until
   * the account answers rather than withheld, since guessing `never` would
   * hide a control that works.
   */
  const [sharing, setSharing] = useState<CoachSharing>('ask_each_time');
  const loadedNote = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    api
      .me()
      .then((profile) => {
        setSharing(coachSharingFromStored(profile.coachSharing));
      })
      .catch(() => {
        // Left at the default, so the control behaves as it did before this
        // setting was enforced. The server is the thing that refuses.
      });
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
    // Typing again means the last "saved" is about older text.
    setSaveState('idle');
    const timer = setTimeout(() => {
      setSaveState('saving');
      api
        .updateJournalEntry(entryId, { note: note === '' ? null : note })
        .then((updated) => {
          loadedNote.current = updated.note ?? '';
          setEntry(updated);
          setFailed(null);
          setSaveState('saved');
        })
        .catch((e: unknown) => {
          setFailed(describe(e));
          // Back to idle, not "saved": the failure is the `role="alert"`
          // below, and a status saying nothing is better than one that lies.
          setSaveState('idle');
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
    } catch (e: unknown) {
      // The server's own reason when it has one. "Check your connection" was
      // told to somebody whose own "Never share" setting had refused it, which
      // is both wrong and unfixable by anything they would then try.
      setFailed(describe(e));
    }
  };

  const remove = async () => {
    try {
      await api.deleteJournalEntry(entry.id);
      router.push('/app/journal');
    } catch (e: unknown) {
      setFailed(describe(e));
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

      {/*
        `htmlFor`, because this label is the textarea's sibling rather than its
        parent. Without it the field's accessible name fell back to the
        placeholder — "Anything you want to remember." — so the visible label
        was not the programmatic one, and somebody driving the page by voice
        asking for "My note" matched nothing. `axe` does not flag it: a
        placeholder is an accepted name source, which is the same reason it
        would not have caught the session screen having no live region.
      */}
      <label className={styles.label} htmlFor="journal-note" style={{ marginTop: 16 }}>
        <span id="journal-note-label">My note</span>
        <SaveStatus state={saveState} />
      </label>
      <textarea
        id="journal-note"
        // Named by the span alone, not by the whole label: the status beside
        // it changes as the save runs, and a field whose accessible name keeps
        // changing is worse than one named by its placeholder. `htmlFor` stays
        // so clicking the words still focuses the field.
        aria-labelledby="journal-note-label"
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
        {/*
          Sharing off in settings leaves only the way out: turning it off is
          always allowed, so an entry already shared keeps a control, and one
          that is not says why instead of offering a button the server refuses.
        */}
        {!mayShareEntry(sharing) && !entry.sharedWithCoach ? (
          <p className={styles.meta} style={{ flexGrow: 1 }}>
            Sharing is off in settings.
          </p>
        ) : (
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
        )}
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
