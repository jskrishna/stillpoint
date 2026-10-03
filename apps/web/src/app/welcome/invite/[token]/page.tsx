import type { Metadata } from 'next';
import AcceptInvite from './AcceptInvite';

export const metadata: Metadata = {
  title: 'An invitation — Stillpoint',
};

export const dynamicParams = true;

export function generateStaticParams() {
  // A token is the invitation; there is nothing to prerender.
  return [];
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
