import type { Metadata } from 'next';
import Noticed from './Noticed';

// See `../journal/page.tsx` for why this wrapper exists. "Insights" is the
// word the navigation already uses for this screen, so the title is not a new
// name for it.
export const metadata: Metadata = {
  title: 'Insights — Stillpoint',
};

export default function InsightsPage() {
  return <Noticed />;
}
