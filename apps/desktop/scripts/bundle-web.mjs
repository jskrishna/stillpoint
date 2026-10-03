/**
 * Copies the web app's standalone build into this shell.
 *
 * Next's `output: 'standalone'` writes a server and the `node_modules` it
 * actually traced, but deliberately leaves out `.next/static` and `public`:
 * on a real deployment those are served by a CDN. There is no CDN inside a
 * desktop app, so they are copied in beside the server — without them every
 * stylesheet and script 404s and the window renders unstyled HTML.
 *
 * The result is `apps/desktop/web/`, which `src/server.ts` runs with Electron's
 * own Node. Nothing is rebuilt here: this is the same output the browser gets.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const web = join(desktop, '..', 'web');

const standalone = join(web, '.next', 'standalone');
const out = join(desktop, 'web');

if (!existsSync(standalone)) {
  console.error(
    'The web app has no standalone build.\n' +
      'Run `pnpm --filter @stillpoint/web run build` first; `pnpm run build` at the\n' +
      'root does it in the right order.',
  );
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The standalone output keeps the workspace's shape, so the server and its
// traced `node_modules` sit under `apps/web/` and at the root respectively.
cpSync(join(standalone, 'apps', 'web'), out, { recursive: true });
cpSync(join(standalone, 'node_modules'), join(out, 'node_modules'), {
  recursive: true,
  // The trace follows pnpm's symlinks; copying them as links would point at a
  // store that is not on the user's machine.
  dereference: true,
});

cpSync(join(web, '.next', 'static'), join(out, '.next', 'static'), { recursive: true });

const publicDir = join(web, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(out, 'public'), { recursive: true });
}

console.log(`Bundled the web app into ${out}`);
