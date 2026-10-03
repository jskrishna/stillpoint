import type { Metadata } from 'next';
import Accounts from './Accounts';

export const metadata: Metadata = {
  title: 'Accounts — Stillpoint Admin',
};

export default function AccountsPage() {
  return <Accounts />;
}
