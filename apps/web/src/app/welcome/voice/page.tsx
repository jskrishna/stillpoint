import type { Metadata } from 'next';
import VoiceSetup from './VoiceSetup';

export const metadata: Metadata = {
  title: 'Set up your voice — Stillpoint',
};

export default function VoicePage() {
  return <VoiceSetup />;
}
