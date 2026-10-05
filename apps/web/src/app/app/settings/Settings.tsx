'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  COACH_SHARINGS,
  DEFAULT_COUNTRY,
  helplinesFor,
  COACH_SHARING_LABEL,
  GUIDE_VOICES,
  PLAN_LABEL,
  TALK_MODES,
  TALK_MODE_LABEL,
  isPlanId,
  type CoachSharing,
  type GuideVoice,
  type TalkMode,
} from '@stillpoint/protocol';
import { ApiError, api, type ApiMyCoach, type Profile } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import { inFlight } from '../../../lib/presses';
import HelplineLink from '../../../components/HelplineLink';
import styles from '../app.module.css';

/**
 * Settings.
 *
 * Every control sends one field to `PATCH /me` and renders what comes back, so
 * the screen cannot disagree with the account. The labels come from the
 * protocol: a mode added there appears here without this screen being touched.
 */
export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [coaches, setCoaches] = useState<readonly ApiMyCoach[]>([]);
  const [endingCoach, setEndingCoach] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * In flight, on the three controls that change something and cannot be
   * undone.
   *
   * Each of these used to guard on the state its own response changes — the
   * coach list, the entry count, a redirect — and none of those changes until
   * the response lands, so the window between the press and the answer was
   * open. Measured on the journal delete, where it is worst because the
   * handler is a loop: three taps sent 10 deletes for 8 entries, the extra
   * ones answering 404, and the screen then said "Some entries were not
   * deleted." about a journal that had been deleted entirely. A false sentence
   * on the screen whose own copy promises "It is removed for good".
   */
  const [deletingJournal, setDeletingJournal] = useState(false);
  const [endingBusy, setEndingBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [erasePassword, setErasePassword] = useState('');
  const [eraseConfirm, setEraseConfirm] = useState('');
  const [eraseProblem, setEraseProblem] = useState<string | null>(null);
  const [erasingBusy, setErasingBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Only the count is needed here, so only the count is fetched: the journal
    // is paged and the whole of it is a lot of decryption for a number.
    Promise.all([api.me(), api.journal(1), api.myCoaches()])
      .then(([me, page, mine]) => {
        setProfile(me);
        setEntryCount(page.total);
        setCoaches(mine);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed(describe(e));
      });
  }, [router]);

  const save = async (changes: Parameters<typeof api.updateMe>[0]) => {
    try {
      setProfile(await api.updateMe(changes));
      setFailed(null);
    } catch (e: unknown) {
      setFailed(describe(e));
    }
  };

  /*
   * Four refusals, in closures rather than in React state.
   *
   * `if (exporting) return` and its three neighbours could not refuse a
   * same-frame second press: the handler closes over the value from the
   * render it was built in. Measured on the phone's equivalent export button
   * with `GET /journal` held open — three presses inside one frame, **three**
   * whole-journal reads. The state stays, because it is what each label and
   * `aria-disabled` is drawn from; `inFlight` is the refusal.
   *
   * `lib/presses.ts` has the measurements, including why three separate
   * clicks send one and say nothing.
   */
  const onceExporting = useRef(inFlight()).current;
  const onceDeletingJournal = useRef(inFlight()).current;
  const onceEnding = useRef(inFlight()).current;
  const onceErasing = useRef(inFlight()).current;

  const exportData = () => onceExporting(runExport);

  const runExport = async () => {
    // The user's own copy of their own data. The whole journal is fetched here
    // and nowhere else — it is the one place that genuinely needs all of it,
    // and it goes straight to a file on their machine, not to any service.
    setExporting(true);
    try {
      const journal = await api.wholeJournal();
      const payload = JSON.stringify({ account: profile, journal }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stillpoint-data.json';
      a.click();
      URL.revokeObjectURL(url);
      setFailed(null);
    } catch (e: unknown) {
      setFailed(describe(e));
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = () => onceDeletingJournal(runDeleteEverything);

  const runDeleteEverything = async () => {
    setDeletingJournal(true);
    try {
      // One request per entry, because each delete is authorised on its own.
      for (const entry of await api.wholeJournal()) await api.deleteJournalEntry(entry.id);
      setEntryCount(0);
      setConfirming(false);
      setFailed(null);
    } catch (e: unknown) {
      // Re-read the count, so what the screen says is what survived.
      setEntryCount(
        await api
          .journal(1)
          .then((p) => p.total)
          .catch(() => entryCount),
      );
      // The partial failure is the news and the reason comes after it: a
      // refusal mid-loop is not a connection problem, and this screen had no
      // way to say which.
      setFailed(`Some entries were not deleted. ${describe(e)}`);
    } finally {
      setDeletingJournal(false);
    }
  };

  /**
   * Ends a coaching relationship.
   *
   * The user's own decision and immediate — a coach cannot do this for them and
   * does not need to agree. Shared entries stay shared: that flag is a separate
   * choice and stays where the user put it. What ends is anyone being able to
   * read them.
   */
  const endCoaching = (coach: ApiMyCoach) => onceEnding(() => runEndCoaching(coach));

  const runEndCoaching = async (coach: ApiMyCoach) => {
    setEndingBusy(true);
    try {
      await api.endCoaching(coach.id);
      setCoaches((current) => current.filter((c) => c.id !== coach.id));
      setEndingCoach(null);
      setFailed(null);
    } catch (e: unknown) {
      setFailed(describe(e));
    } finally {
      setEndingBusy(false);
    }
  };

  /**
   * Erases the account.
   *
   * Not reversible, and it takes everything: sessions, journal, who could read
   * it. The password and the typed confirmation are both the server's
   * requirement, not this screen's — so a client cannot skip either.
   */
  const eraseAccount = () => onceErasing(runEraseAccount);

  const runEraseAccount = async () => {
    setErasingBusy(true);
    setEraseProblem(null);
    try {
      await api.deleteAccount(erasePassword, eraseConfirm);
      router.push('/welcome');
    } catch (e: unknown) {
      setEraseProblem(describe(e));
      setErasingBusy(false);
    }
  };

  const signOut = async () => {
    await api.logout();
    router.push('/welcome');
  };

  if (profile === null) {
    return (
      <>
        <h1 className={styles.title}>Settings</h1>
        {failed === null ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <p className={styles.failure}>{failed}</p>
        )}
      </>
    );
  }

  // The account's own country, with `DEFAULT_COUNTRY` as the fallback rather
  // than a literal — the rule the consent screens were fixed to follow after
  // `helplinesFor('IN')` told a Canadian to call 112.
  const helplines = helplinesFor(profile.country === '' ? DEFAULT_COUNTRY : profile.country);

  return (
    <>
      <h1 className={styles.title}>Settings</h1>

      <span className={styles.label}>ACCOUNT</span>
      <Link href="/pricing" className={styles.settingRow}>
        <span>Upgrade to Plus</span>
        {/*
          `PLAN_LABEL`, because this said `plan === 'plus' ? 'Plus plan' :
          'Free plan'` — three plans and two branches, so an account granted
          **Coach** from the console was told it was on **Free**, on the one
          screen that reports which plan somebody has. The phone had the same
          bug the other way round and showed the raw `plus`.
        */}
        <span className={styles.settingValue}>
          {isPlanId(profile.plan) ? `${PLAN_LABEL[profile.plan]} plan` : profile.plan}
          <span className={styles.chevron}>›</span>
        </span>
      </Link>
      <div className={styles.settingRow}>
        <span>Signed in as</span>
        <span className={styles.settingValue}>{profile.email}</span>
      </div>

      <span className={styles.label}>VOICE</span>
      <Choice
        name="Guide voice"
        value={profile.guideVoice}
        options={GUIDE_VOICES.map((v: GuideVoice) => ({ value: v.id, label: v.name }))}
        onChange={(guideVoice) => {
          void save({ guideVoice });
        }}
      />
      <Choice
        name="Talk mode"
        value={profile.talkMode}
        options={TALK_MODES.map((m: TalkMode) => ({ value: m, label: TALK_MODE_LABEL[m] }))}
        onChange={(talkMode) => {
          void save({ talkMode });
        }}
      />

      <span className={styles.label}>WHO CAN SEE YOUR SESSIONS</span>
      {coaches.length === 0 ? (
        <p className={styles.footnote}>
          Nobody. Your journal is yours alone until you accept a coach’s invitation.
        </p>
      ) : (
        coaches.map((coach) => (
          <div key={coach.id}>
            <div className={styles.settingRow}>
              <span>
                {coach.name}
                <span className={styles.settingValue} style={{ display: 'block' }}>
                  {coach.sharedSessions === 0
                    ? 'No sessions shared yet'
                    : `${String(coach.sharedSessions)} ${
                        coach.sharedSessions === 1 ? 'session' : 'sessions'
                      } shared`}
                </span>
              </span>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setEndingCoach(endingCoach === coach.id ? null : coach.id);
                }}
              >
                {endingCoach === coach.id ? 'Keep them' : 'End coaching'}
              </button>
            </div>
            {endingCoach === coach.id ? (
              <div className={styles.notice}>
                <p>
                  {coach.name} will no longer be able to read any of your sessions, including the
                  ones you already shared. You stay shared on those entries — it is only{' '}
                  {coach.name} who stops being able to see them. This cannot be undone without a new
                  invitation.
                </p>
                <button
                  type="button"
                  className={styles.cta}
                  style={{
                    marginTop: 12,
                    background: 'var(--sp-color-panel)',
                    color: 'var(--sp-color-danger)',
                    boxShadow: 'var(--sp-shadow-button)',
                  }}
                  aria-disabled={endingBusy}
                  onClick={() => {
                    void endCoaching(coach);
                  }}
                >
                  {endingBusy ? 'Ending…' : `End coaching with ${coach.name}`}
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}

      <span className={styles.label}>PRIVACY</span>
      <Choice
        name="Coach sharing"
        value={profile.coachSharing}
        options={COACH_SHARINGS.map((c: CoachSharing) => ({
          value: c,
          label: COACH_SHARING_LABEL[c],
        }))}
        onChange={(coachSharing) => {
          void save({ coachSharing });
        }}
      />

      <button
        type="button"
        className={styles.settingRow}
        onClick={() => {
          void exportData();
        }}
        aria-disabled={exporting}
      >
        <span>{exporting ? 'Gathering your data…' : 'Export my data'}</span>
        <span className={styles.settingValue}>
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          <span className={styles.chevron}>›</span>
        </span>
      </button>

      <button
        type="button"
        className={styles.settingRow}
        onClick={() => {
          setConfirming(true);
        }}
        /*
         * `disabled`, deliberately, where every other button in this flow uses
         * `aria-disabled`. That rule is about a button whose own press
         * disables it, because then the focus that pressed it has nowhere to
         * go. This one is unavailable at rest — there is nothing to delete —
         * so no press ever moves the focus off it, and the native attribute is
         * the plainer answer.
         */
        disabled={entryCount === 0}
      >
        <span className={styles.danger}>Delete my journal</span>
        <span className={styles.chevron}>›</span>
      </button>

      {confirming ? (
        <div className={styles.notice}>
          <p>
            This deletes all {entryCount} {entryCount === 1 ? 'entry' : 'entries'} from your
            account. It cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              className={styles.cta}
              style={{ flexGrow: 1 }}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep them
            </button>
            <button
              type="button"
              className={styles.cta}
              style={{
                flexGrow: 1,
                background: 'var(--sp-color-panel)',
                color: 'var(--sp-color-danger)',
                boxShadow: 'var(--sp-shadow-button)',
              }}
              aria-disabled={deletingJournal}
              onClick={() => {
                void deleteEverything();
              }}
            >
              {deletingJournal ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </div>
      ) : null}

      {/*
        The crisis numbers, which this screen did not have and the phone's has
        had all along.
        **A parity gap on the one thing that must not drift between surfaces.**
        `apps/mobile`'s settings screen renders `helplinesFor(profile.country)`
        under a group headed "If you need someone now"; this one rendered
        nothing, so a person looking for a number in the web app or the desktop
        shell had nowhere to find one outside a session. The desktop app's Help
        menu has an item with that exact label which navigates **here** — so on
        that surface, "If you need someone now" landed on a page whose contents
        are voice preferences, coach sharing and two delete buttons.
        The country is the account's own, falling back to `DEFAULT_COUNTRY`
        rather than to a literal, which is the rule the consent screens were
        fixed to follow. An unserved country gets an empty list and this
        section is not drawn: a wrong crisis number is worse than none, and so
        is a heading with nothing under it.
      */}
      {helplines.length === 0 ? null : (
        <>
          <span className={styles.label}>IF YOU NEED SOMEONE NOW</span>
          <div className={styles.helplines}>
            {helplines.map((h) => (
              <HelplineLink key={h.number} helpline={h} />
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        className={styles.settingRow}
        onClick={() => {
          void signOut();
        }}
      >
        <span>Sign out</span>
        <span className={styles.chevron}>›</span>
      </button>

      {failed === null ? null : (
        <p className={styles.failure} role="alert">
          {failed}
        </p>
      )}

      <span className={styles.label}>DELETE MY ACCOUNT</span>
      {erasing ? (
        <div className={styles.notice}>
          <p>
            This removes your account and everything in it — every session, every journal entry, and
            anyone’s ability to read them. It cannot be undone, and we cannot get it back for you.
          </p>
          <label className={styles.label} style={{ marginTop: 12 }}>
            Your password
            <input
              className={styles.select}
              type="password"
              autoComplete="current-password"
              value={erasePassword}
              onChange={(e) => {
                setErasePassword(e.target.value);
              }}
            />
          </label>
          <label className={styles.label} style={{ marginTop: 12 }}>
            Type {api.DELETE_CONFIRMATION} to confirm
            <input
              className={styles.select}
              type="text"
              autoComplete="off"
              value={eraseConfirm}
              onChange={(e) => {
                setEraseConfirm(e.target.value);
              }}
            />
          </label>
          {eraseProblem === null ? null : (
            <p className={styles.failure} role="alert">
              {eraseProblem}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              className={styles.cta}
              style={{ flexGrow: 1 }}
              onClick={() => {
                setErasing(false);
                setErasePassword('');
                setEraseConfirm('');
                setEraseProblem(null);
              }}
            >
              Keep my account
            </button>
            <button
              type="button"
              className={styles.cta}
              style={{
                flexGrow: 1,
                background: 'var(--sp-color-panel)',
                color: 'var(--sp-color-danger)',
                boxShadow: 'var(--sp-shadow-button)',
              }}
              aria-disabled={
                erasingBusy ||
                erasePassword === '' ||
                eraseConfirm.trim() !== api.DELETE_CONFIRMATION
              }
              onClick={() => {
                void eraseAccount();
              }}
            >
              {erasingBusy ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.settingRow}
          onClick={() => {
            setErasing(true);
          }}
        >
          <span className={styles.danger}>Delete my account</span>
          <span className={styles.chevron}>›</span>
        </button>
      )}

      <p className={styles.footnote}>
        Your journal is stored on your account and encrypted at rest. Deleting an entry removes it
        for good, and deleting your account removes all of it.
      </p>
    </>
  );
}

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className={styles.settingRow}>
      <span>{name}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => {
          // Looked up rather than cast: the only values this can emit are the
          // ones it was given.
          const picked = options.find((o) => o.value === e.target.value);
          if (picked !== undefined) onChange(picked.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
