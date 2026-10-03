import EntryDetail from './EntryDetail';

export const dynamicParams = true;

export function generateStaticParams() {
  // An entry is the user's own private content, fetched with their token, so
  // there is nothing to prerender; the route exists and the component loads it.
  return [];
}

export default async function EntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  return <EntryDetail entryId={entryId} />;
}
