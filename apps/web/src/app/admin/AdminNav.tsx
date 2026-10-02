'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/safety', label: 'Safety flags' },
  { href: '/admin/protocol', label: 'Step prompts' },
] as const;

export default function AdminNav({ openFlagCount }: { openFlagCount: number }) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <strong className={styles.brand}>Stillpoint Admin</strong>
      {LINKS.map((link) => {
        const on = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.navLink} ${on ? styles.navOn : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            {link.label}
            {link.label === 'Safety flags' && openFlagCount > 0 ? (
              <span className={styles.badge}>{openFlagCount}</span>
            ) : null}
          </Link>
        );
      })}
    </aside>
  );
}
