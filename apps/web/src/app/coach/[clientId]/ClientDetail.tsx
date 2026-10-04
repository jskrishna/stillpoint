'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FEELINGS, LOCALE, duration, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiClientDetail } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import { SaveStatus, type SaveState } from '../../../components/SaveStatus';
import styles from '../coach.module.css';

const LABEL = new Map<string, string>(FEELINGS.map((f) => [f.id, f.label]));

/** How long after the last keystroke the coach's notes are sent. */
const SAVE_AFTER_MS = 700;

/**
 * One client, as their coach sees them.
 *
 * The sharing rule is applied on the server, which answers with the shared
 * sessions and nothing else — the private entries are not hidden by this
 * markup, they are not in the data it works from. The attention notice is how
 * a coach learns a session stopped for safety at all: such a session is never
 * journalled, so it can never be shared, and the notice carries when it
 * happened and not a word of what was said.
 */
export default function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ApiClientDetail | null | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [now, setNow] = useState<Date | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const loadedNotes = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    api
      .coachClient(clientId)
      .then((found) => {
        setClient(found);
        setNotes(found.coachNotes ?? '');
        loadedNotes.current = found.coachNotes ?? '';
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setClient(null);
      });
  }, [clientId, router]);

  // Saved after typing stops, from an effect rather than a change handler.
  useEffect(() => {
    if (loadedNotes.current === null || notes === loadedNotes.current) return;
    // Typing again means the last "saved" is about older text.
    setSaveState('idle');
    const timer = setTimeout(() => {
      setSaveState('saving');
      api
        .updateCoachClient(clientId, { coachNotes: notes === '' ? null : notes })
        .then((updated) => {
          loadedNotes.current = updated.coachNotes ?? '';
          setClient(updated);
          setProblem(null);
          setSaveState('saved');
        })
        .catch((e: unknown) => {
          // Including the case this screen is most likely to meet: the client
          // ended the pairing while the coach was typing. That is a bare 404,
          // so `describe()` says the server would not do it and to reload —
          // which is what shows them the client is gone. "Check your
          // connection" was false and left them retrying.
          setProblem(describe(e));
          // Idle rather than "saved": the failure is the `role="alert"` the
          // screen already shows, and a status that lies is worse than none.
          setSaveState('idle');
        });
    }, SAVE_AFTER_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [notes, clientId]);

  if (client === undefined) return <p className={styles.empty}>Loading…</p>;
  if (client === null) {
    return (
      <>
        <h1 className={styles.title}>Not found</h1>
        <p className={styles.empty}>This client is not one of yours.</p>
        <Link href="/coach" className={styles.open}>
          Back to clients
        </Link>
      </>
    );
  }

  const firstName = client.name.split(' ')[0]?.toUpperCase() ?? 'THEIR';

  return (
    <>
      <Link href="/coach" className={styles.back}>
        ← Clients
      </Link>
      <h1 className={styles.title} style={{ marginTop: 8 }}>
        {client.name}
      </h1>
      <p className={styles.sub}>
        {client.since === null
          ? 'Invited'
          : `Client since ${new Date(client.since).toLocaleDateString(LOCALE, { month: 'long' })}`}
        {client.nextCallAt === null
          ? ''
          : ` · Next call ${new Date(client.nextCallAt).toLocaleString(LOCALE, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}`}
      </p>

      {client.attention.map((a) => (
        <p key={a.at} className={styles.attention}>
          <strong>Needs attention:</strong> {a.reason}
          {now === null ? '' : ` ${relativeDay(new Date(a.at), now)}.`}
        </p>
      ))}

      <div className={styles.split}>
        <div>
          <span className={styles.label}>SHARED SESSIONS</span>
          {client.sharedSessions.length === 0 ? (
            <p className={styles.empty}>
              {client.name} has not shared any sessions. You only see what they choose to share.
            </p>
          ) : (
            client.sharedSessions.map((entry) => (
              <div key={entry.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <strong className={styles.cardTitle}>{entry.title}</strong>
                  <span className={styles.cardMeta}>
                    {now === null ? '' : relativeDay(new Date(entry.occurredAt), now)} ·{' '}
                    {duration(entry.durationMinutes)}
                  </span>
                </div>
                {entry.feelings.length === 0 ? null : (
                  <div className={styles.row}>
                    <span className={styles.label}>FEELINGS</span>
                    <span className={styles.rowValue}>
                      {entry.feelings.map((id) => LABEL.get(id) ?? id).join(', ')}
                    </span>
                  </div>
                )}
                {entry.belief === null ? null : (
                  <div className={styles.row}>
                    <span className={styles.label}>BELIEF</span>
                    <span className={styles.rowValue}>“{entry.belief}”</span>
                  </div>
                )}
                {entry.note === null ? null : (
                  <div className={styles.row}>
                    <span className={styles.label}>{firstName}’S NOTE</span>
                    <span className={styles.rowValue}>{entry.note}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div>
          <span className={styles.label}>PATTERN</span>
          {client.recurringBelief === null ? (
            <p className={styles.empty}>No belief has come back yet across shared sessions.</p>
          ) : (
            <div className={styles.card}>
              <strong className={styles.patternText}>“{client.recurringBelief.belief}”</strong>
              <p className={styles.cardMeta} style={{ marginTop: 6 }}>
                In {client.recurringBelief.sessions} of {client.sharedCount} shared sessions.
              </p>
            </div>
          )}

          <label className={styles.field}>
            {/*
              One flex row for the words and the status, and the field named by
              the words alone — `.field` is a flex column, so two items would
              put the status on its own line, and a wrapping label would fold
              the changing status into the field's accessible name.
            */}
            <span>
              <span id="coach-notes-label">My private notes</span>
              <SaveStatus state={saveState} />
            </span>
            <textarea
              className={styles.textarea}
              aria-labelledby="coach-notes-label"
              rows={5}
              value={notes}
              placeholder="Only you can see these."
              onChange={(e) => {
                setNotes(e.target.value);
              }}
            />
          </label>
          {problem === null ? null : (
            <p className={styles.empty} role="alert">
              {problem}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
