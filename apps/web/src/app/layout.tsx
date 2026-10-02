import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, Newsreader } from 'next/font/google';
import { stylesheet } from '@stillpoint/design-tokens';
import './globals.css';

/** The guide's voice and the user's own words. */
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

/** Everything the user operates. */
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stillpoint — talk it through',
  description:
    'A voice guide that helps you calm down and understand why something hurt, in 6 simple steps. Not therapy or medical advice.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable}`}>
      <head>
        {/*
          Tokens are emitted from @stillpoint/design-tokens rather than copied
          into a stylesheet, so the site cannot drift from the design system.
          Generated at render from a pure function; nothing user-supplied.
        */}
        <style dangerouslySetInnerHTML={{ __html: stylesheet() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
