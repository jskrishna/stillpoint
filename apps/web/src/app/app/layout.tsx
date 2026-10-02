import type { Metadata } from 'next';
import BottomNav from './BottomNav';
import styles from './app.module.css';

export const metadata: Metadata = {
  title: 'Stillpoint',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.content}>{children}</div>
      <BottomNav />
    </div>
  );
}
