import type { Metadata } from 'next';
import ProtocolEditor from './ProtocolEditor';

export const metadata: Metadata = {
  title: 'Step prompts — Stillpoint Admin',
};

export default function ProtocolPage() {
  return <ProtocolEditor />;
}
