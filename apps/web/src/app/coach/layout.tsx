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
        <Link href="/coach" className={`${styles.navLink} ${styles.navOn}`}>
          Clients
        </Link>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
