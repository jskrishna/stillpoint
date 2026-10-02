import type { Metadata, Viewport } from 'next';
import { stylesheet } from '@stillpoint/design-tokens';
import './globals.css';

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
    <html lang="en">
      <head>
        {/*
          Fonts are linked rather than fetched through next/font, which pulls
          them at build time and so makes the build depend on reaching Google
          Fonts. The stacks in the design tokens name a local fallback, so the
          layout holds before the webfont arrives — and the designs link them
          the same way.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap"
        />
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
