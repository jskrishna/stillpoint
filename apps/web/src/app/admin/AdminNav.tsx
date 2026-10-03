'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../../lib/api';
import styles from './admin.module.css';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/safety', label: 'Safety flags' },
  { href: '/admin/protocol', label: 'Step prompts' },
  { href: '/admin/users', label: 'Accounts' },
] as const;

/**
 * The console's sidebar.
 *
 * The badge is the real count of open flags, fetched here rather than passed
 * down: the layout that renders this is a server component and has no token.
 * A failed fetch shows no badge, which is the safe way to be wrong — it
 * understates the queue rather than inventing work.
 */
export default function AdminNav() {
  const [openFlagCount, setOpenFlagCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    api
      .adminOverview()
      .then((o) => {
        setOpenFlagCount(o.openFlags);
      })
      .catch(() => {
        setOpenFlagCount(0);
      });
  }, [pathname]);

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
