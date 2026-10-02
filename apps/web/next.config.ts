import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship as ESM built by tsc; Next transpiles them so a
  // change in a package shows up without a separate watch process.
  transpilePackages: ['@stillpoint/protocol', '@stillpoint/design-tokens'],
};

export default config;
