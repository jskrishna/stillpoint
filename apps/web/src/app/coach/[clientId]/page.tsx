import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FEELINGS, sharedWith, summarise } from '@stillpoint/protocol';
import { CLIENTS, CLIENT_JOURNALS } from '../../../lib/coach-data';
import { duration, relativeDay } from '../../../lib/format';
import styles from '../coach.module.css';

export function generateStaticParams() {
  return CLIENTS.map((c) => ({ clientId: c.id }));
}

const LABEL = new Map(FEELINGS.map((f) => [f.id, f.label]));

/**
 * One client, as their coach sees them.
 *
 * sharedWith() is applied before anything is rendered, so the private entries
 * in the client's journal are not merely hidden by the markup — they are not in
 * the data this page works from.
 */
export default async function ClientDetail({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = CLIENTS.find((c) => c.id === clientId);
  if (client === undefined) notFound();

  const journal = CLIENT_JOURNALS[clientId] ?? [];
  const shared = sharedWith(journal);
  const summary = summarise(journal);
  const now = new Date();

  return (
    <>
      <Link href="/coach" className={styles.back}>
        ← Clients
      </Link>
      <h1 className={styles.title} style={{ marginTop: 8 }}>
        {client.name}
      </h1>
      <p className={styles.sub}>
        {client.since === undefined
          ? 'Invited'
          : `Client since ${client.since.toLocaleDateString('en-IN', { month: 'long' })}`}
        {client.nextCallAt === undefined
          ? ''
          : ` · Next call ${client.nextCallAt.toLocaleString('en-IN', {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}`}
      </p>

      <div className={styles.split}>
        <div>
          <span className={styles.label}>SHARED SESSIONS</span>
          {shared.length === 0 ? (
            <p className={styles.empty}>
              {client.name} has not shared any sessions. You only see what they choose to share.
            </p>
          ) : (
            shared.map((entry) => (
              <div key={entry.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <strong className={styles.cardTitle}>{entry.title}</strong>
                  <span className={styles.cardMeta}>
                    {relativeDay(entry.occurredAt, now)} · {duration(entry.durationMinutes)}
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
                {entry.belief === undefined ? null : (
                  <div className={styles.row}>
                    <span className={styles.label}>BELIEF</span>
                    <span className={styles.rowValue}>“{entry.belief}”</span>
                  </div>
                )}
                {entry.note === undefined ? null : (
                  <div className={styles.row}>
                    <span className={styles.label}>
                      {client.name.split(' ')[0]?.toUpperCase()}’S NOTE
                    </span>
                    <span className={styles.rowValue}>{entry.note}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div>
          <span className={styles.label}>PATTERN</span>
          {summary.recurringBelief === undefined ? (
            <p className={styles.empty}>No belief has come back yet across shared sessions.</p>
          ) : (
            <div className={styles.card}>
              <strong className={styles.patternText}>“{summary.recurringBelief.belief}”</strong>
              <p className={styles.cardMeta} style={{ marginTop: 6 }}>
                In {summary.recurringBelief.sessions} of {summary.sharedCount} shared sessions.
              </p>
            </div>
          )}

          <label className={styles.field}>
            My private notes
            <textarea
              className={styles.textarea}
              rows={5}
              defaultValue=""
              placeholder="Only you can see these."
            />
          </label>
        </div>
      </div>
    </>
  );
}
