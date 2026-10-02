import Link from 'next/link';
import { summarise } from '@stillpoint/protocol';
import { ATTENTION, CLIENTS, CLIENT_JOURNALS } from '../../lib/coach-data';
import { relativeDay } from '../../lib/format';
import styles from './coach.module.css';

/**
 * The coach's client list.
 *
 * Every row is built through summarise(), which shares the journal down itself,
 * so a private session cannot reach this table even by mistake.
 */
export default function Clients() {
  const now = new Date();

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>Your clients</h1>
        <span className={styles.button}>Invite client</span>
      </div>

      {ATTENTION.map((a) => {
        const client = CLIENTS.find((c) => c.id === a.clientId);
        if (client === undefined) return null;
        return (
          <p key={a.clientId} className={styles.attention}>
            <strong>Needs attention:</strong> {client.name} {a.reason} on {relativeDay(a.at, now)}.{' '}
            <Link href={`/coach/${client.id}`} className={styles.attentionLink}>
              Check in
            </Link>
          </p>
        );
      })}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Client</th>
            <th className={styles.th}>Belief that comes back</th>
            <th className={styles.th}>Last session</th>
            <th className={styles.th}>Shared</th>
            <th className={styles.th}>Next call</th>
            <th className={styles.th} />
          </tr>
        </thead>
        <tbody>
          {CLIENTS.map((client) => {
            const summary = summarise(CLIENT_JOURNALS[client.id] ?? []);
            const invited = client.status === 'invited';
            return (
              <tr key={client.id}>
                <td className={styles.td}>{client.name}</td>
                <td className={styles.td}>
                  {summary.recurringBelief === undefined
                    ? '—'
                    : `“${summary.recurringBelief.belief}”`}
                </td>
                <td className={styles.td}>
                  {summary.lastSharedAt === undefined
                    ? '—'
                    : relativeDay(summary.lastSharedAt, now)}
                </td>
                <td className={styles.td}>
                  {summary.sharedCount === 0 ? '—' : summary.sharedCount}
                </td>
                <td className={styles.td}>
                  {invited
                    ? 'Invite sent'
                    : client.nextCallAt === undefined
                      ? '—'
                      : client.nextCallAt.toLocaleString('en-IN', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                </td>
                <td className={styles.td}>
                  {invited ? (
                    <span className={styles.open}>Resend</span>
                  ) : (
                    <Link href={`/coach/${client.id}`} className={styles.open}>
                      Open
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className={styles.privacy}>You only see sessions your clients choose to share.</p>
    </>
  );
}
