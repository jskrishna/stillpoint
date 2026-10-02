'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './app.module.css';

const TABS = [
  { href: '/app', label: 'Home' },
  { href: '/app/journal', label: 'Journal' },
  { href: '/app/insights', label: 'Insights' },
  { href: '/app/settings', label: 'Settings' },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => {
        const on = tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${on ? styles.tabOn : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            <Icon name={tab.label} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'Home')
    return (
      <svg {...common}>
        <path d="M4 11l8-7 8 7v9H4z" />
      </svg>
    );
  if (name === 'Journal')
    return (
      <svg {...common}>
        <path d="M6 3h11a1 1 0 011 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 011-1z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
