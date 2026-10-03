/**
 * Copies the web app's standalone build into this shell.
 *
 * Next's `output: 'standalone'` writes a server and the `node_modules` it
 * actually traced, but deliberately leaves out `static/` and `public/`:
 * on a real deployment those are served by a CDN. There is no CDN inside a
 * desktop app, so they are copied in beside the server — without them every
 * stylesheet and script 404s and the window renders unstyled HTML.
 *
 * The result is `apps/desktop/web/`, which `src/server.ts` runs with Electron's
 * own Node. Nothing is built here — this only copies — but it is not the same
 * output the browser gets: `next start` and `output: 'standalone'` are not
 * supported together, so the two are separate builds into separate
 * directories. This package's `build` script runs the standalone one first.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const web = join(desktop, '..', 'web');

// `.next-standalone`, not `.next`: the standalone build is opt-in and writes
// its own directory, so it cannot overwrite the one `next start` serves. See
// `apps/web/next.config.ts`.
const dist = join(web, '.next-standalone');
const standalone = join(dist, 'standalone');
const out = join(desktop, 'web');

if (!existsSync(standalone)) {
  console.error(
    'The web app has no standalone build.\n' +
      'Run `pnpm --filter @stillpoint/web run build:standalone` first; this\n' +
      "package's own `build` script does it for you.",
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

cpSync(join(dist, 'static'), join(out, '.next-standalone', 'static'), { recursive: true });

const publicDir = join(web, 'public');
if (existsSync(publicDir)) {
  cpSync(publicDir, join(out, 'public'), { recursive: true });
}

console.log(`Bundled the web app into ${out}`);
