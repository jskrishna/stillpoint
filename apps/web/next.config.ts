import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // A self-contained server under `.next/standalone`, which is what the
  // desktop shell launches: Electron has no `pnpm` to run `next start` with.
  // The tracing root is the workspace, or the trace stops at `apps/web` and
  // misses the `@stillpoint/*` symlinks pnpm puts in `node_modules`.
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // The workspace packages ship as ESM built by tsc; Next transpiles them so a
  // change in a package shows up without a separate watch process.
  transpilePackages: ['@stillpoint/protocol', '@stillpoint/design-tokens', '@stillpoint/client'],
};

export default config;
