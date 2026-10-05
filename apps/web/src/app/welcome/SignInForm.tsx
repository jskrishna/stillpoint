'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { describe } from '../../lib/describe';
import { takeDestination } from '../../lib/after-welcome';
import { inFlight } from '../../lib/presses';
import styles from './welcome.module.css';

/**
 * Sign in, or make an account.
 *
 * The designs show Google, Apple and a passwordless sign-in link. None of the
 * three exists on the server, so none is offered here as though it did: the
 * buttons stay visible and disabled, and say why. A button that looked like
 * Google sign-in and quietly skipped to the next screen would be a lie about
 * who is signed in.
 */
export default function SignInForm() {
  const [mode, setMode] = useState<'signIn' | 'create'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const creating = mode === 'create';
  const canSubmit =
    email.trim() !== '' && password !== '' && (!creating || name.trim() !== '') && !busy;

  /*
   * The refusal is this closure, not the `busy` the guard below reads: a
   * handler closes over the value from the render it was built in, so three
   * presses inside one frame all read `false`. Measured on three other
   * controls, including Publish — `lib/presses.ts` has them. The state stays,
   * because it is what the label and `aria-disabled` are drawn from.
   */
  const once = useRef(inFlight()).current;

  const submit = () => once(() => runSubmit());

  const runSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const profile = creating
        ? await api.register(name.trim(), email.trim(), password)
        : await api.login(email.trim(), password);

      // Consent is the server's gate, not this screen's: it decides whether a
      // session may start, so it decides where the user goes next.
      if (!profile.hasRequiredConsent) {
        router.push('/welcome/consent');
        return;
      }

      // Somebody who has consented already has been through the welcome flow,
      // so signing in is the end of it for them: wherever they were going, or
      // the app. This sent every returning user to voice setup instead, and
      // that screen starts from Sage without reading the account and saves
      // whichever of its two buttons is pressed, so each sign-in put a saved
      // River back to Sage and wrote the talk mode over. The phone has always
      // gone to the app from here.
      router.push(takeDestination() ?? '/app');
    } catch (e: unknown) {
      setError(describe(e));
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.mark} aria-hidden="true" />
      <h1 className={styles.title}>Welcome to Stillpoint</h1>
      <p className={styles.lead}>A calm voice guide for when something upsets you.</p>

      <div className={styles.choices}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary} ${styles.unavailable}`}
          disabled
        >
          Continue with Google
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary} ${styles.unavailable}`}
          disabled
        >
          Continue with Apple
        </button>
        <p className={styles.unavailableNote}>
          Google and Apple sign-in are not built yet. Use an email and password for now.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {creating ? (
          <label className={styles.field}>
            Name
            <input
              className={styles.input}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </label>
        ) : null}

        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>

        <label className={styles.field}>
          Password
          <input
            className={styles.input}
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </label>

        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            aria-disabled={!canSubmit}
          >
            {busy ? 'One moment…' : creating ? 'Create my account' : 'Sign in'}
          </button>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => {
              setMode(creating ? 'signIn' : 'create');
              setError(null);
            }}
          >
            {creating ? 'I already have an account' : 'Create an account instead'}
          </button>
          {creating ? null : (
            <Link href="/welcome/forgot" className={styles.toggle}>
              I’ve forgotten my password
            </Link>
          )}
          <p className={styles.terms}>By continuing you agree to the Terms and Privacy Policy.</p>
        </div>
      </form>
    </div>
  );
}
