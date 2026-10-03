'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InviteClient from './InviteClient';
import { ApiError, api, type ApiClient } from '../../lib/api';
import { relativeDay } from '../../lib/format';
import styles from './coach.module.css';

/**
 * The coach's client list.
 *
 * Every figure here is computed by the server through `CoachView`, which shares
 * a journal down itself. So a private session cannot reach this table even by
 * mistake — it is not in what the server sent.
 */
export default function Clients() {
  const [clients, setClients] = useState<readonly ApiClient[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    api
      .coachClients()
      .then(setClients)
      .catch((e: unknown) => {
        setProblem(
          e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
            ? 'The coach portal is for coaches. Sign in with a coach account.'
            : 'Could not load your clients. Check your connection.',
        );
      });
  }, []);

  if (clients === null) {
    return (
      <>
        <h1 className={styles.title}>Your clients</h1>
        <p className={styles.sub}>{problem ?? 'Loading…'}</p>
      </>
    );
  }

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>Your clients</h1>
      </div>

      {clients.length === 0 ? (
        <p className={styles.empty}>No clients yet.</p>
      ) : (
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
            {clients.map((client) => {
              const invited = client.status === 'invited';
              return (
                <tr key={client.id}>
                  <td className={styles.td}>{client.name}</td>
                  <td className={styles.td}>
                    {client.recurringBelief === null ? '—' : `“${client.recurringBelief.belief}”`}
                  </td>
                  <td className={styles.td}>
                    {client.lastSharedAt === null || now === null
                      ? '—'
                      : relativeDay(new Date(client.lastSharedAt), now)}
                  </td>
                  <td className={styles.td}>
                    {client.sharedCount === 0 ? '—' : client.sharedCount}
                  </td>
                  <td className={styles.td}>
                    {invited
                      ? 'Invite sent'
                      : client.nextCallAt === null
                        ? '—'
                        : new Date(client.nextCallAt).toLocaleString('en-IN', {
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
      )}

      <InviteClient
        onAccepted={() => {
          void api.coachClients().then(setClients);
        }}
      />

      <p className={styles.privacy}>You only see sessions your clients choose to share.</p>
    </>
  );
}
