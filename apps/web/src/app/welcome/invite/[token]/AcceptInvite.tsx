'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api, hasToken, type ApiInvitation } from '../../../../lib/api';
import styles from '../../welcome.module.css';

/**
 * Accepting a coach's invitation.
 *
 * Readable without an account, because whoever holds the link has not signed in
 * and needs to know who is asking before deciding whether to. Accepting is what
 * creates the pairing, and only the person it was sent to can do it — which is
 * the point: what a coach sees is the client's own choice session by session, so
 * the relationship has to be their choice too.
 */
export default function AcceptInvite({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<ApiInvitation | null | undefined>(undefined);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api
      .invitation(token)
      .then(setInvitation)
      .catch(() => {
        setInvitation(null);
      });
  }, [token]);

  const accept = async () => {
    if (!hasToken()) {
      // Sign in first, and come back. The invitation is in the URL, so it
      // survives the trip.
      router.push(`/welcome?next=${encodeURIComponent(`/welcome/invite/${token}`)}`);
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      const result = await api.acceptInvitation(token);
      setAccepted(result.coachName);
    } catch (e: unknown) {
      setProblem(
        e instanceof ApiError
          ? e.message
          : 'Could not accept this invitation. Check your connection.',
      );
      setBusy(false);
    }
  };

  if (invitation === undefined) {
    return (
      <div className={styles.screen}>
        <p className={styles.unavailableNote}>Loading…</p>
      </div>
    );
  }

  if (invitation === null) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>We don’t recognise this link</h1>
        <p className={styles.lead}>Ask your coach to send you a new invitation.</p>
        <div className={styles.actions}>
          <Link href="/welcome" className={`${styles.button} ${styles.secondary}`}>
            Go to Stillpoint
          </Link>
        </div>
      </div>
    );
  }

  if (accepted !== null) {
    return (
      <div className={styles.screen}>
        <div className={styles.mark} aria-hidden="true" />
        <h1 className={styles.title}>{accepted} is now your coach</h1>
        <p className={styles.lead}>
          They see a session only when you choose to share it. You can see who your coaches are, and
          end it, in Settings.
        </p>
        <div className={styles.actions}>
          <Link href="/app" className={`${styles.button} ${styles.primary}`}>
            Go to Stillpoint
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.mark} aria-hidden="true" />
      <h1 className={styles.title}>{invitation.coachName} would like to be your coach</h1>
      <p className={styles.lead}>
        Sent to {invitation.email}. A coach sees a session <strong>only</strong> when you choose to
        share it — never your whole journal, and never a session that ended because you were not
        safe. You can end it at any time.
      </p>

      {invitation.usable ? null : <p className={styles.unavailableNote}>{invitation.reason}</p>}

      {problem === null ? null : (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            void accept();
          }}
          disabled={!invitation.usable || busy}
        >
          {busy ? 'One moment…' : `Accept, and share with ${invitation.coachName}`}
        </button>
        <Link href="/app" className={styles.toggle}>
          Not now
        </Link>
      </div>
    </div>
  );
}
