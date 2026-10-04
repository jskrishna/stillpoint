import type { Metadata } from 'next';
import ClientDetail from './ClientDetail';

// Not the client's name, for the reason the journal entry's is not its title:
// a document title reaches the tab, the window and the browser's history, and
// who somebody's coach is seeing is not a thing to leave there.
export const metadata: Metadata = {
  title: 'A client — Stillpoint Coach',
};

export const dynamicParams = true;

export function generateStaticParams() {
  // A client is only visible to their own coach, fetched with that coach's
  // token, so there is nothing to prerender.
  return [];
}

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientDetail clientId={clientId} />;
}
