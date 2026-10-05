import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * A self-contained server under `standalone/`, which is what the desktop shell
 * launches and what the Docker image runs: neither has a `pnpm` to run
 * `next start` with.
 *
 * Opt-in, because `next start` is not supported alongside it — Next says so at
 * every boot — and `next start` is what local development, the README and the
 * end-to-end job all use. Left on unconditionally, every one of those ran a
 * combination the framework warns against, and the end-to-end job's server was
 * one of them.
 *
 * It also writes somewhere else. Two builds of the same app into one `.next`
 * means whichever ran last decides what `next start` finds, so a root
 * `pnpm run build` — web, then the desktop shell — used to leave a standalone
 * directory behind for `next start` to trip over. Separate outputs cannot do
 * that to each other.
 */
const standalone = process.env['NEXT_OUTPUT'] === 'standalone';

/**
 * The API's origin, which the page is allowed to talk to and nothing else is.
 *
 * Taken from the same variable the client reads, so the policy cannot name a
 * different API from the one the app actually calls. A malformed value is left
 * out rather than guessed at: a broken `connect-src` is a broken app, which is
 * loud, and that is the right failure for a security header.
 */
function apiOrigin(): string | null {
  try {
    return new URL(process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8000/api').origin;
  } catch {
    return null;
  }
}

/**
 * The headers, and what each one is actually for.
 *
 * The web client keeps its bearer token in `localStorage`, which any script on
 * the page can read — documented at the top of `src/lib/api.ts` as the
 * shortcut it is. This does not fix that. What it does is take away the second
 * half of the attack: a stolen token still has to leave the page, and
 * `connect-src`, `img-src`, `form-action` and `base-uri` are the ways it would
 * go.
 *
 * `script-src` keeps `'unsafe-inline'`, which is worth being plain about: it
 * means injected inline script still runs. Removing it needs a per-request
 * nonce, and every route here is statically prerendered — the middleware that
 * would mint the nonce would make all of them dynamic. That is a real cost for
 * a product whose pages are the same for everybody, so the trade is taken
 * deliberately and in this direction: constrain where script can come from and
 * where anything can be sent, rather than make every page dynamic.
 *
 * This app loads nothing from anywhere else — no analytics, no tag manager, no
 * webfont CDN (`e2e/privacy.mjs` asserts it) — so `'self'` is not an
 * aspiration here, it is what the app already does. That is why a strict policy
 * is available at all, and it is worth keeping that way.
 *
 * `microphone=()` is current and will date. `UserEar` is deliberately unbound
 * and every session is typed, so nothing here needs the microphone; the guide
 * only speaks, which needs no permission. Binding a listener means changing
 * this line, and it should be as visible a change as that decision is.
 */
function securityHeaders(dev: boolean): { key: string; value: string }[] {
  const api = apiOrigin();

  const csp = [
    "default-src 'self'",
    // `unsafe-eval` only in development, where Next's fast refresh needs it.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    // CSS Modules are external files; the inline allowance is for the style
    // Next injects itself.
    "style-src 'self' 'unsafe-inline'",
    // `data:` for the inline SVG mark.
    "img-src 'self' data:",
    // Self-hosted, by `scripts/fetch-fonts.mjs`, for exactly this reason.
    "font-src 'self'",
    // Where the token could be sent, so this is the line that matters most.
    // `ws:` in development is Next's own hot-reload socket.
    `connect-src 'self'${api === null ? '' : ` ${api}`}${dev ? ' ws: wss:' : ''}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // `frame-ancestors` above is the one browsers honour; this is for anything
    // that only knows the old header.
    { key: 'X-Frame-Options', value: 'DENY' },
    // No referrer at all, not `same-origin`: a URL here can name a journal
    // entry, and the API is a different origin.
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
  ];
}

const config: NextConfig = {
  reactStrictMode: true,
  /*
   * This origin does not name its framework.
   *
   * The API's does not either — `SecurityHeaders` calls `header_remove()` and
   * `deploy/php.ini` sets `expose_php=Off`, and `deploy/smoke.mjs` asserts
   * over HTTP that nothing comes back. That rule was applied to one of the two
   * origins: measured, `GET /app/journal` answered
   * `X-Powered-By: Next.js` while the API answered nothing, and the web origin
   * is the one a visitor's browser talks to on every page.
   *
   * It is not a vulnerability on its own and neither was the API's. It is the
   * same argument made there — a version is free reconnaissance and this costs
   * one line to stop giving — and the point is that the two origins now agree.
   */
  poweredByHeader: false,
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV !== 'production') },
    ]),
  ...(standalone
    ? {
        output: 'standalone' as const,
        distDir: '.next-standalone',
        // The tracing root is the workspace, or the trace stops at `apps/web`
        // and misses the `@stillpoint/*` symlinks pnpm puts in `node_modules`.
        outputFileTracingRoot: join(import.meta.dirname, '../..'),
      }
    : {}),
  // The workspace packages ship as ESM built by tsc; Next transpiles them so a
  // change in a package shows up without a separate watch process.
  transpilePackages: ['@stillpoint/protocol', '@stillpoint/design-tokens', '@stillpoint/client'],
};

export default config;
