'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '../../../../lib/api';
import styles from '../../welcome.module.css';

/**
 * Choosing a new password from a reset link.
 *
 * The address comes from the link rather than being typed again: the token is
 * only valid for one address, so asking for it would be asking the person to
 * repeat something the link already knows and could only get wrong.
 *
 * Succeeding sends them to sign in rather than signing them in here. A reset
 * revokes every existing token, which is the point of one, and that includes
 * any this browser was holding.
 */
export default function ResetPassword({ token }: { token: string }) {
  const search = useSearchParams();
  const email = search.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const mismatch = again !== '' && password !== again;
  const canSubmit = password !== '' && password === again && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.resetPassword(email, token, password);
      setDone(true);
    } catch (e: unknown) {
      setProblem(
        e instanceof ApiError
          ? (Object.values(e.errors)[0]?.[0] ?? e.message)
          : 'Could not reach Stillpoint. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  if (email === '') {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>This link is incomplete</h1>
        <p className={styles.lead}>Ask for a new one and open it straight from the email.</p>
        <div className={styles.actions}>
          <Link href="/welcome/forgot" className={`${styles.button} ${styles.primary}`}>
            Ask for a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.screen}>
        <div className={styles.mark} aria-hidden="true" />
        <h1 className={styles.title}>Your password is changed</h1>
        <p className={styles.lead}>
          Anywhere that was signed in has been signed out, including this browser. Sign in with the
          new password.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => {
              router.push('/welcome');
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.mark} aria-hidden="true" />
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.lead}>For {email}.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={styles.field}>
          New password
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </label>

        <label className={styles.field}>
          And again
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => {
              setAgain(e.target.value);
            }}
          />
        </label>

        {mismatch ? <p className={styles.unavailableNote}>Those two do not match.</p> : null}

        {problem === null ? null : (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={!canSubmit}
          >
            {busy ? 'One moment…' : 'Change my password'}
          </button>
          <Link href="/welcome/forgot" className={styles.toggle}>
            Ask for a new link
          </Link>
        </div>
      </form>
    </div>
  );
}
