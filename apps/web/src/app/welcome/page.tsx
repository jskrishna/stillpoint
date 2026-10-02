import Link from 'next/link';
import type { Metadata } from 'next';
import styles from './welcome.module.css';

export const metadata: Metadata = {
  title: 'Welcome — Stillpoint',
};

export default function SignIn() {
  return (
    <div className={styles.screen}>
      <div className={styles.mark} aria-hidden="true" />
      <h1 className={styles.title}>Welcome to Stillpoint</h1>
      <p className={styles.lead}>A calm voice guide for when something upsets you.</p>

      <div className={styles.choices}>
        <Link href="/welcome/consent" className={`${styles.button} ${styles.secondary}`}>
          Continue with Google
        </Link>
        <Link href="/welcome/consent" className={`${styles.button} ${styles.secondary}`}>
          Continue with Apple
        </Link>
      </div>

      <label className={styles.field}>
        Email
        <input className={styles.input} type="email" placeholder="you@example.com" />
      </label>

      <div className={styles.actions}>
        <Link href="/welcome/consent" className={`${styles.button} ${styles.primary}`}>
          Send me a sign-in link
        </Link>
        <p className={styles.terms}>By continuing you agree to the Terms and Privacy Policy.</p>
      </div>
    </div>
  );
}
