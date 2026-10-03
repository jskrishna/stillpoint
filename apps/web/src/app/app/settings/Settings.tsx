'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  COACH_SHARINGS,
  COACH_SHARING_LABEL,
  GUIDE_VOICES,
  TALK_MODES,
  TALK_MODE_LABEL,
  type CoachSharing,
  type GuideVoice,
  type TalkMode,
} from '@stillpoint/protocol';
import { ApiError, api, type Profile } from '../../../lib/api';
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
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Only the count is needed here, so only the count is fetched: the journal
    // is paged and the whole of it is a lot of decryption for a number.
    Promise.all([api.me(), api.journal(1)])
      .then(([me, page]) => {
        setProfile(me);
        setEntryCount(page.total);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        setFailed('Could not load your settings. Check your connection.');
      });
  }, [router]);

  const save = async (changes: Parameters<typeof api.updateMe>[0]) => {
    try {
      setProfile(await api.updateMe(changes));
      setFailed(null);
    } catch {
      setFailed('Could not save that. Check your connection.');
    }
  };

  const exportData = async () => {
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
    } catch {
      setFailed('Could not export your data. Check your connection.');
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = async () => {
    try {
      // One request per entry, because each delete is authorised on its own.
      for (const entry of await api.wholeJournal()) await api.deleteJournalEntry(entry.id);
      setEntryCount(0);
      setConfirming(false);
      setFailed(null);
    } catch {
      // Re-read the count, so what the screen says is what survived.
      setEntryCount(
        await api
          .journal(1)
          .then((p) => p.total)
          .catch(() => entryCount),
      );
      setFailed('Some entries were not deleted. Check your connection and try again.');
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

  return (
    <>
      <h1 className={styles.title}>Settings</h1>

      <span className={styles.label}>ACCOUNT</span>
      <Link href="/pricing" className={styles.settingRow}>
        <span>Upgrade to Plus</span>
        <span className={styles.settingValue}>
          {profile.plan === 'plus' ? 'Plus plan' : 'Free plan'}
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
        disabled={exporting}
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
              onClick={() => {
                void deleteEverything();
              }}
            >
              Delete everything
            </button>
          </div>
        </div>
      ) : null}

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

      <p className={styles.footnote}>
        Your journal is stored on your account and encrypted at rest. Deleting an entry removes it
        for good.
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
