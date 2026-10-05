import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './coach.module.css';

export const metadata: Metadata = {
  title: 'Stillpoint Coach',
};

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <strong className={styles.brand}>Stillpoint Coach</strong>
        {/*
         * `aria-current`, as `AdminNav` and `BottomNav` have. Measured: this
         * one answered `null` where the admin nav's current item answers
         * `page`. One link, so there is nothing to disambiguate and this is
         * consistency rather than a defect somebody hit — but it is styled as
         * the current item, and the attribute is what says so to anybody not
         * looking at the styling.
         */}
        <Link href="/coach" aria-current="page" className={`${styles.navLink} ${styles.navOn}`}>
          Clients
        </Link>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
