'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COACH_SHARING_LABEL,
  GUIDE_VOICES,
  TALK_MODE_LABEL,
  type CoachSharing,
  type GuideVoice,
  type Preferences,
  type TalkMode,
} from '@stillpoint/protocol';
import { browserPreferences } from '../../../lib/preferences-store';
import { browserJournalStore } from '../../../lib/journal-store';
import styles from '../app.module.css';

/**
 * Settings.
 *
 * Every control changes a stored preference and nothing else: the labels come
 * from the protocol, so a mode added there appears here without this screen
 * being touched.
 */
export default function Settings() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [entryCount, setEntryCount] = useState(0);

  useEffect(() => {
    setPrefs(browserPreferences.read());
    setEntryCount(browserJournalStore.list().length);
  }, []);

  const update = (change: (p: Preferences) => Preferences) => {
    setPrefs(browserPreferences.write(change));
  };

  const exportData = () => {
    const payload = JSON.stringify(
      { preferences: browserPreferences.read(), journal: browserJournalStore.list() },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stillpoint-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteEverything = () => {
    for (const entry of browserJournalStore.list()) browserJournalStore.remove(entry.id);
    browserPreferences.write(() => ({
      voice: 'sage',
      talkMode: 'hold',
      coachSharing: 'ask_each_time',
      acceptedConsent: [],
    }));
    setPrefs(browserPreferences.read());
    setEntryCount(0);
  };

  if (prefs === null) return <h1 className={styles.title}>Settings</h1>;

  return (
    <>
      <h1 className={styles.title}>Settings</h1>

      <span className={styles.label}>ACCOUNT</span>
      <Link href="/pricing" className={styles.settingRow}>
        <span>Upgrade to Plus</span>
        <span className={styles.settingValue}>
          Free plan<span className={styles.chevron}>›</span>
        </span>
      </Link>

      <span className={styles.label}>VOICE</span>
      <Choice
        name="Guide voice"
        value={prefs.voice}
        options={GUIDE_VOICES.map((v: GuideVoice) => ({ value: v.id, label: v.name }))}
        onChange={(voice) => {
          update((p) => ({ ...p, voice: voice as GuideVoice['id'] }));
        }}
      />
      <Choice
        name="Talk mode"
        value={prefs.talkMode}
        options={Object.entries(TALK_MODE_LABEL).map(([value, label]) => ({ value, label }))}
        onChange={(mode) => {
          update((p) => ({ ...p, talkMode: mode as TalkMode }));
        }}
      />

      <span className={styles.label}>PRIVACY</span>
      <Choice
        name="Coach sharing"
        value={prefs.coachSharing}
        options={Object.entries(COACH_SHARING_LABEL).map(([value, label]) => ({ value, label }))}
        onChange={(sharing) => {
          update((p) => ({ ...p, coachSharing: sharing as CoachSharing }));
        }}
      />

      <button type="button" className={styles.settingRow} onClick={exportData}>
        <span>Export my data</span>
        <span className={styles.settingValue}>
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          <span className={styles.chevron}>›</span>
        </span>
      </button>

      <button type="button" className={styles.settingRow} onClick={deleteEverything}>
        <span className={styles.danger}>Delete everything on this device</span>
        <span className={styles.chevron}>›</span>
      </button>

      <p className={styles.footnote}>
        Your journal and settings are stored in this browser only. Clearing site data removes them,
        and nothing syncs between devices.
      </p>
    </>
  );
}

function Choice({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.settingRow}>
      <span>{name}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
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
