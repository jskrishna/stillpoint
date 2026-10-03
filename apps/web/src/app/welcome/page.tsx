import type { Metadata } from 'next';
import SignInForm from './SignInForm';

export const metadata: Metadata = {
  title: 'Welcome — Stillpoint',
};

export default function SignIn() {
  return <SignInForm />;
}
