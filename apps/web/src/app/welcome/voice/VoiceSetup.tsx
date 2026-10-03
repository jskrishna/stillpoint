'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GUIDE_VOICES, type GuideVoice } from '@stillpoint/protocol';
import { ApiError, api } from '../../../lib/api';
import styles from '../welcome.module.css';

/**
 * Voice setup.
 *
 * "I'll type instead" never asks for the microphone, and is not styled as a
 * lesser path: typing is a mode of its own, and it is the one that works today.
 */
export default function VoiceSetup() {
  const [voice, setVoice] = useState<GuideVoice['id']>('sage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const go = async (talkMode: 'hold' | 'type') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({ guideVoice: voice, talkMode });
      router.push('/app');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isUnauthenticated) {
        router.push('/welcome');
        return;
      }
      setError('Could not save that. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Link href="/welcome/consent" className={styles.back}>
        ← Back
      </Link>
      <h1 className={styles.title}>Set up your voice</h1>
      <p className={styles.lead}>We need your microphone to hear you. Your voice is never saved.</p>

      <span className={styles.label}>GUIDE VOICE</span>
      <div className={styles.choices}>
        {GUIDE_VOICES.map((v) => (
          <label
            key={v.id}
            className={`${styles.radioCard} ${voice === v.id ? styles.radioOn : ''}`}
          >
            <input
              type="radio"
              name="voice"
              className={styles.checkbox}
              checked={voice === v.id}
              onChange={() => {
                setVoice(v.id);
              }}
            />
            <span className={styles.radioText}>
              <span className={styles.radioName}>{v.name}</span>
              <span className={styles.radioDetail}>{v.description}</span>
            </span>
          </label>
        ))}
      </div>

      <p className={styles.blocked} style={{ textAlign: 'left', marginTop: 16 }}>
        Speaking is not built yet — the voice stack is still being chosen. Either button starts a
        typed session for now.
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            void go('hold');
          }}
          disabled={busy}
        >
          Allow microphone
        </button>
        <button
          type="button"
          className={styles.quiet}
          onClick={() => {
            void go('type');
          }}
          disabled={busy}
        >
          I’ll type instead
        </button>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
