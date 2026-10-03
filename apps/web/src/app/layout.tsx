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
          Served from here, not from Google's CDN. Linking it meant every
          visitor's IP and user-agent reached a third party on every page of a
          product about being upset — including the session screen. The phone
          app has always bundled its fonts; this makes the web match it, and it
          is one fewer thing that has to be reachable for the app to look like
          itself.

          `apps/web/scripts/fetch-fonts.mjs` regenerates the files; they are
          variable faces, latin and latin-ext only, and the stylesheet keeps
          Google's own `unicode-range` rules so a browser fetches a face only
          when a glyph on the page needs it. The stacks in the design tokens
          name a local fallback, so the layout holds before one arrives.
        */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
        {/*
          The two faces nearly every screen uses, asked for before the
          stylesheet has been parsed. `crossOrigin` is required even same-origin:
          fonts are fetched in CORS mode, and a preload without it is fetched
          twice.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/hanken-grotesk-normal-latin.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/newsreader-normal-latin.woff2"
          crossOrigin="anonymous"
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
