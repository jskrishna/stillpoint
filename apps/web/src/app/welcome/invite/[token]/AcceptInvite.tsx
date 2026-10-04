'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api, hasToken, type ApiInvitation } from '../../../../lib/api';
import { describe } from '../../../../lib/describe';
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
  /**
   * The server's own reason for not showing an invitation, when it is not
   * "there is no such invitation". Those are different answers and this screen
   * used to give the first one for both.
   */
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api
      .invitation(token)
      .then((found) => {
        setInvitation(found);
        setUnreachable(null);
      })
      .catch((e: unknown) => {
        // Only the server saying there is no such invitation means there is no
        // such invitation. Anything else — a dropped request, a 5xx, a 429 —
        // used to land on "We don't recognise this link. Ask your coach to
        // send you a new invitation.", which is a definite statement about a
        // link that may be perfectly good, and it sends somebody to ask their
        // coach to reissue it for nothing. This route is in the `guessable`
        // rate limiter, so a 429 is a real way to reach it.
        const gone = e instanceof ApiError && (e.status === 404 || e.status === 410);
        if (gone) {
          setInvitation(null);
          return;
        }
        // Everything that is left: a 429 from the `guessable` limiter, a 5xx,
        // or no answer at all. `describe()` tells those three apart; the
        // fallback here said "check your connection" for all of them, which is
        // false for two. The screen's own trailing sentence carries the part
        // that matters — that none of this means the link is wrong.
        setUnreachable(describe(e));
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
      setProblem(describe(e));
      setBusy(false);
    }
  };

  // Above the loading branch on purpose. The catch sets this and leaves
  // `invitation` undefined — null is reserved for "there is no such
  // invitation" — so ordered the other way round, a link that could not be
  // checked said "Loading…" for ever instead of saying so.
  if (unreachable !== null) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Could not check this link</h1>
        <p className={styles.lead} role="alert">
          {unreachable} This does not mean the link is wrong.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              window.location.reload();
            }}
          >
            Try again
          </button>
          <Link href="/welcome" className={`${styles.button} ${styles.secondary}`}>
            Go to Stillpoint
          </Link>
        </div>
      </div>
    );
  }

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
