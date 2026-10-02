import type { Metadata } from 'next';
import SessionFlow from './SessionFlow';

export const metadata: Metadata = {
  title: 'Session — Stillpoint',
  description: 'Talk it through in six steps.',
};

export default function SessionPage() {
  return <SessionFlow />;
}
