import type { Metadata } from 'next';
import EntryDetail from './EntryDetail';

/*
 * Its own title, and deliberately not the entry's own.
 *
 * Four routes under `/app` all answered to the layout's bare "Stillpoint", so
 * somebody with the journal and two entries open had three identical tabs, and
 * a screen reader announced the same three words on arriving at each. WCAG
 * 2.4.2 asks for a title that describes the page; axe's `document-title` only
 * asks for a non-empty one, which is why the audit was clean.
 *
 * Static, because the entry's title is the first words of what somebody said
 * at step 1. A document title goes into the tab, the window chrome and the
 * browser's history, which is the one place this product's content must not
 * turn up — the whole page is behind a token for that reason.
 */
export const metadata: Metadata = {
  title: 'A session — Stillpoint',
};

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
