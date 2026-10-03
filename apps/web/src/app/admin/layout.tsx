import type { Metadata } from 'next';
import AdminNav from './AdminNav';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Stillpoint Admin',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <AdminNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
