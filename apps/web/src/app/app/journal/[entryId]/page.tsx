import EntryDetail from './EntryDetail';

export const dynamicParams = true;

export function generateStaticParams() {
  // Entries live in the browser, so there is nothing to prerender; the route
  // exists and the component resolves the entry on the client.
  return [];
}

export default async function EntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  return <EntryDetail entryId={entryId} />;
}
