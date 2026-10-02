import type { Metadata } from 'next';
import ConsentForm from './ConsentForm';

export const metadata: Metadata = {
  title: 'Before we start — Stillpoint',
};

export default function ConsentPage() {
  return <ConsentForm />;
}
