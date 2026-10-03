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

const config: NextConfig = {
  reactStrictMode: true,
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
