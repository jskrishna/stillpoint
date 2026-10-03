/**
 * Builds the app in standalone mode, into `.next-standalone/`.
 *
 * A script rather than `NEXT_OUTPUT=standalone next build` in the manifest:
 * that spelling is a shell builtin on macOS and Linux and a syntax error in
 * Windows' `cmd`, and the desktop shell is built on all three.
 *
 * `next.config.ts` reads the variable and decides; see the comment there for
 * why standalone is not simply always on.
 */
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(dirname(fileURLToPath(import.meta.url)));

const result = spawnSync('next', ['build'], {
  cwd: web,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEXT_OUTPUT: 'standalone' },
});

process.exit(result.status ?? 1);
