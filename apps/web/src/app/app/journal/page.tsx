import type { Metadata } from 'next';
import JournalList from './JournalList';

/*
 * A server wrapper so this route can have a title, which is the only reason
 * the screen itself is a separate file.
 *
 * `metadata` cannot be exported from a `'use client'` module, and these
 * screens are all client components — so four routes under `/app` answered to
 * the layout's bare "Stillpoint". `/app/settings` and `/session` already had
 * this shape; this is the same one.
 */
export const metadata: Metadata = {
  title: 'Your journal — Stillpoint',
};

export default function JournalPage() {
  return <JournalList />;
}
