import ClientDetail from './ClientDetail';

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
