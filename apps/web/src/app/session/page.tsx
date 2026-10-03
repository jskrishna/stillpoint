import { Suspense } from 'react';
import type { Metadata } from 'next';
import SessionFlow from './SessionFlow';
import styles from './session.module.css';

export const metadata: Metadata = {
  title: 'Session — Stillpoint',
  description: 'Talk it through in six steps.',
};

export default function SessionPage() {
  // `SessionFlow` reads `?kind=quick`, and a prerendered page cannot know the
  // search params — so the shell renders and the flow fills in. The fallback is
  // the same line the flow shows while it is starting, so there is no flicker
  // between two different "wait a moment"s.
  return (
    <Suspense
      fallback={
        <div className={styles.screen}>
          <p className={styles.hint}>Starting…</p>
        </div>
      }
    >
      <SessionFlow />
    </Suspense>
  );
}
