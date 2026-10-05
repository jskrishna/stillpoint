'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import styles from '../welcome.module.css';

/**
 * Asking for a reset link.
 *
 * The answer is the same whether or not the address has an account, and this
 * screen says so plainly rather than implying a confirmation. A different
 * answer for a known address would turn this into a way to find out who uses
 * the product, and what this product is used for is not a thing to let anyone
 * check.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (email.trim() === '' || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (e: unknown) {
      // This threw the server's message away for everything but a 429 — so
      // "The email field must be a valid email address." became "Could not
      // reach Stillpoint", on a form whose whole job is to take an address.
      setProblem(describe(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.screen}>
        <div className={styles.mark} aria-hidden="true" />
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.lead}>
          If {email.trim()} has an account, a link to choose a new password is on its way. It works
          for an hour.
        </p>
        <p className={styles.unavailableNote}>
          We say “if” on purpose: telling you whether an address has an account here would let
          anyone else find that out too.
        </p>
        <div className={styles.actions}>
          <Link href="/welcome" className={`${styles.button} ${styles.secondary}`}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Link href="/welcome" className={styles.back}>
        ← Back
      </Link>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.lead}>
        We’ll email you a link. Your journal is not encrypted with your password, so resetting it
        does not lose anything.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
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

        {problem === null ? null : (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            aria-disabled={email.trim() === '' || busy}
          >
            {busy ? 'One moment…' : 'Email me a link'}
          </button>
        </div>
      </form>
    </div>
  );
}
