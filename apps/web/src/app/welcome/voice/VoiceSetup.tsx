'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GUIDE_VOICES, type GuideVoice } from '@stillpoint/protocol';
import { ApiError, api } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import { inFlight } from '../../../lib/presses';
import { takeDestination } from '../../../lib/after-welcome';
import { NO_EAR_REASON } from '../../../lib/voice';
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

  /*
   * The refusal is this closure, not the `busy` the guard below reads: a
   * handler closes over the value from the render it was built in, so three
   * presses inside one frame all read `false`. Measured on three other
   * controls, including Publish — `lib/presses.ts` has them. The state stays,
   * because it is what the label and `aria-disabled` are drawn from.
   */
  const once = useRef(inFlight()).current;

  const go = (talkMode: 'hold' | 'type') => once(() => runGo(talkMode));

  const runGo = async (talkMode: 'hold' | 'type') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({ guideVoice: voice, talkMode });
      // The end of the welcome flow, and so the one place that asks whether
      // somebody was going somewhere specific — a coach's invitation they
      // followed while signed out. Nothing remembered means the home screen,
      // which is what this always did.
      router.push(takeDestination() ?? '/app');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isUnauthenticated) {
        router.push('/welcome');
        return;
      }
      setError(describe(e));
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Link href="/welcome/consent" className={styles.back}>
        ← Back
      </Link>
      <h1 className={styles.title}>Set up your voice</h1>
      <p className={styles.lead}>
        Choose how the guide sounds. Your voice is never saved — and until speaking is built, it is
        never sent anywhere either, because your answers are typed.
      </p>

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
        The guide can read its questions aloud. Hearing <em>you</em> is not built yet, so you type
        your answers either way. {NO_EAR_REASON}
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            void go('hold');
          }}
          aria-disabled={busy}
        >
          Let the guide speak
        </button>
        <button
          type="button"
          className={styles.quiet}
          onClick={() => {
            void go('type');
          }}
          aria-disabled={busy}
        >
          Keep it silent
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
