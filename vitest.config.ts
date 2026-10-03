import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Workspace packages resolve to source, matching tsconfig.test.json's paths. */
const alias = {
  '@stillpoint/protocol': fileURLToPath(
    new URL('./packages/protocol/src/index.ts', import.meta.url),
  ),
  '@stillpoint/design-tokens': fileURLToPath(
    new URL('./packages/design-tokens/src/index.ts', import.meta.url),
  ),
  '@stillpoint/client': fileURLToPath(new URL('./packages/client/src/index.ts', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts'],
    },
  },
});
