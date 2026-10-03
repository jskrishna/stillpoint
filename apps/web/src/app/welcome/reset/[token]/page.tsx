import { Suspense } from 'react';
import type { Metadata } from 'next';
import ResetPassword from './ResetPassword';

export const metadata: Metadata = {
  title: 'Choose a new password — Stillpoint',
};

export const dynamicParams = true;

export function generateStaticParams() {
  // A token is the link; there is nothing to prerender.
  return [];
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // The address arrives as `?email=`, which a prerendered page cannot know.
  return (
    <Suspense fallback={null}>
      <ResetPassword token={token} />
    </Suspense>
  );
}
