'use client';

import { useEffect, useState } from 'react';
import { ApiError, api, type ApiCoachInvite } from '../../lib/api';
import styles from './coach.module.css';
import { LOCALE } from '@stillpoint/protocol';

/**
 * Inviting a client.
 *
 * A coach can ask; they cannot attach themselves to anyone. The pairing is
 * created when the client accepts, by the client — in a product where what a
 * coach sees is the client's own choice session by session, the relationship
 * itself has to be their choice too.
 *
 * There is no mail driver yet, so the link comes back here for the coach to
 * pass on. That is said plainly rather than implying an email went out.
 */
export default function InviteClient({ onAccepted }: { onAccepted?: () => void }) {
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<readonly ApiCoachInvite[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api
      .coachInvites()
      .then(setInvites)
      .catch(() => {
        // The list is a convenience; failing to load it should not stop a
        // coach inviting someone.
      });
  }, []);

  const invite = async () => {
    if (email.trim() === '' || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const created = await api.inviteClient(email.trim());
      setInvites((current) => [created, ...current.filter((i) => i.id !== created.id)]);
      setEmail('');
      onAccepted?.();
    } catch (e: unknown) {
      setProblem(
        e instanceof ApiError
          ? (Object.values(e.errors)[0]?.[0] ?? e.message)
          : 'Could not send that invitation. Check your connection.',
      );
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    try {
      const updated = await api.withdrawInvite(id);
      setInvites((current) => current.map((i) => (i.id === updated.id ? updated : i)));
      setProblem(null);
    } catch (e: unknown) {
      setProblem(
        e instanceof ApiError ? e.message : 'Could not withdraw that. Check your connection.',
      );
    }
  };

  const fullLink = (invite: ApiCoachInvite): string =>
    typeof window === 'undefined' ? invite.link : `${window.location.origin}${invite.link}`;

  const copy = async (invite: ApiCoachInvite) => {
    try {
      await navigator.clipboard.writeText(fullLink(invite));
      setCopied(invite.id);
    } catch {
      // Clipboard access can be refused. The link is on the screen either way.
      setCopied(null);
    }
  };

  const open = invites.filter((i) => i.usable);

  return (
    <div className={styles.inviteBox}>
      <span className={styles.label}>INVITE A CLIENT</span>
      <div className={styles.inviteRow}>
        <input
          className={styles.inviteInput}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="their@email.com"
          aria-label="Client’s email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            void invite();
          }}
          disabled={email.trim() === '' || busy}
        >
          {busy ? 'One moment…' : 'Create invitation'}
        </button>
      </div>

      <p className={styles.inviteNote}>
        They decide. Accepting the invitation is what pairs you — and they can end it at any time.
        Email is not wired up yet, so send them the link yourself.
      </p>

      {problem === null ? null : (
        <p className={styles.inviteError} role="alert">
          {problem}
        </p>
      )}

      {open.length === 0 ? null : (
        <>
          <span className={styles.label} style={{ marginTop: 16 }}>
            WAITING TO BE ACCEPTED
          </span>
          {open.map((i) => (
            <div key={i.id}>
              <p className={styles.inviteNote}>
                <strong>{i.email}</strong> · expires{' '}
                {new Date(i.expiresAt).toLocaleDateString(LOCALE, {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                ·{' '}
                <button
                  type="button"
                  className={styles.withdraw}
                  onClick={() => {
                    void copy(i);
                  }}
                >
                  {copied === i.id ? 'Copied' : 'Copy link'}
                </button>{' '}
                ·{' '}
                <button
                  type="button"
                  className={styles.withdraw}
                  onClick={() => {
                    void withdraw(i.id);
                  }}
                >
                  Withdraw
                </button>
              </p>
              <code className={styles.inviteLink}>{fullLink(i)}</code>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
