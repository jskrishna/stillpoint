'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STEP_COUNT, greeting, relativeDay } from '@stillpoint/protocol';
import {
  ApiError,
  api,
  hasToken,
  type ApiJournalEntry,
  type ApiSession,
  type Profile,
} from '../../lib/api';
import styles from './app.module.css';

/** The app home: start a session, and the most recent entries. */
export default function Home() {
  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState<ApiSession | null>(null);
  /**
   * Whether this screen could not find out, which is not the same as there
   * being nothing open — and the difference costs a session.
   */
  const [openUnknown, setOpenUnknown] = useState(false);
  const router = useRouter();

  // Fetched after mount with the user's token, which the server has no access
  // to — so there is nothing to render until then.
  useEffect(() => {
    setNow(new Date());

    if (!hasToken()) {
      router.push('/welcome');
      return;
    }

    // The allowance, so the screen can say what is left before anyone starts a
    // session and is refused.
    api
      .me()
      .then(setProfile)
      .catch(() => {
        setProfile(null);
      });

    // A session someone is in the middle of. Offered rather than replaced:
    // starting a new one ends it, and on a free plan that is the difference
    // between spending one of three and spending two.
    api
      .currentSession()
      .then((current) => {
        setOpen(current);
        setOpenUnknown(false);
      })
      .catch(() => {
        // Not `setOpen(null)`. Null is this screen's word for "nothing is
        // open", which is the branch with no offer to resume and no warning —
        // and `POST /sessions` ends whatever *is* open as `user_stopped`. So a
        // dropped request turned the next tap into: the session they were
        // part-way through closed, and on a free plan one of three spent to do
        // it, with nothing on the screen having said so. A failed read is not
        // evidence that there is nothing to carry on from.
        setOpenUnknown(true);
      });

    api
      // Only the three most recent are shown, so only three are asked for.
      .journal(3)
      .then((page) => {
        setEntries(page.items);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed(true);
      });
  }, [router]);

  const recent = (entries ?? []).slice(0, 3);

  return (
    <>
      <span className={styles.greeting}>{now === null ? ' ' : greeting(now)}</span>
      <h1 className={styles.title}>Something bothering you?</h1>
      <p className={styles.lead}>
        Talk it through in {STEP_COUNT} simple steps. It takes about 10–15 minutes.
      </p>

      {/*
        An untouched session is one nothing has been said into. There is
        nothing to carry on from, and starting hands that same session back
        rather than charging another one — so this is the ordinary branch, with
        no offer to resume and no warning about a cost that is not real.
      */}
      {open === null || open.untouched ? (
        <>
          <Link href="/session" className={styles.cta}>
            <MicIcon />
            Start talking
          </Link>

          <Link href="/session?kind=quick" className={styles.quietCta}>
            Or a quick session
          </Link>

          {/*
            Never withheld: somebody who is upset is not told to come back when
            the network is poor. What the failure changes is that the cost is
            stated rather than assumed away.
          */}
          {openUnknown ? (
            <p className={styles.allowance} role="alert">
              Could not check whether you left a session open. Starting something new closes
              anything that is, and uses another full session.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <Link href="/session?resume=1" className={styles.cta}>
            <MicIcon />
            Carry on where you left off
          </Link>
          <p className={styles.allowance}>
            You were on step {open.step?.ordinal ?? 1} of {open.stepCount}
            {open.step === null ? '' : ` · ${open.step.name}`}.
          </p>

          <Link href="/session" className={styles.quietCta}>
            Or start something new
          </Link>
          <p className={styles.allowance}>
            Starting something new closes the one you left, and uses another full session.
          </p>
        </>
      )}

      {profile === null || profile.fullSessionsLeft === null ? null : (
        <p className={styles.allowance}>
          {profile.fullSessionsLeft === 0
            ? 'No full sessions left this week. Quick sessions are always available.'
            : `${String(profile.fullSessionsLeft)} of ${String(
                profile.fullSessionsPerWeek ?? 0,
              )} full ${
                profile.fullSessionsLeft === 1 ? 'session' : 'sessions'
              } left this week. Quick sessions are unlimited.`}
        </p>
      )}

      <span className={styles.label}>RECENT</span>
      {failed ? (
        <p className={styles.failure}>Could not load your journal. Check your connection.</p>
      ) : entries === null ? (
        <p className={styles.loading}>Loading…</p>
      ) : recent.length === 0 ? (
        <p className={styles.empty}>Nothing yet. Your finished sessions will appear here.</p>
      ) : (
        recent.map((entry) => (
          <Link key={entry.id} href={`/app/journal/${entry.id}`} className={styles.card}>
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{entry.title}</span>
              <span className={styles.cardMeta}>
                {now === null ? '' : relativeDay(new Date(entry.occurredAt), now)}
                {entry.calmerRating === 'yes' ? ' · Felt calmer' : ''}
              </span>
            </span>
            <span className={styles.chevron}>›</span>
          </Link>
        ))
      )}
    </>
  );
}

function MicIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
