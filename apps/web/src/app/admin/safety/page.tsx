import type { Metadata } from 'next';
import SafetyQueue from './SafetyQueue';

export const metadata: Metadata = {
  title: 'Safety flags — Stillpoint Admin',
};

export default function SafetyPage() {
  return <SafetyQueue />;
}
