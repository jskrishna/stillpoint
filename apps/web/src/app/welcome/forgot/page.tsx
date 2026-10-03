import type { Metadata } from 'next';
import ForgotPassword from './ForgotPassword';

export const metadata: Metadata = {
  title: 'Reset your password — Stillpoint',
};

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
