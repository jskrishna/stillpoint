import type { Metadata } from 'next';
import { openFlags } from '@stillpoint/protocol';
import AdminNav from './AdminNav';
import { SAFETY_FLAGS } from '../../lib/admin-data';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Stillpoint Admin',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <AdminNav openFlagCount={openFlags(SAFETY_FLAGS).length} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
