import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/**
 * Where the four checks agree about the world.
 *
 * The URLs and the seeded accounts were copied into each script, which is fine
 * until one of them is changed and the other three are not — the seeded
 * password has already been wrong in three places at once.
 */
export const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
export const API = process.env.API_URL ?? 'http://localhost:8000/api';

/** Every account `DemoSeeder` makes shares this; `SEED_PASSWORD` overrides it. */
export const PASSWORD = process.env.SEED_PASSWORD ?? 'correct-horse-battery-staple';

export const ACCOUNTS = {
  user: process.env.USER_EMAIL ?? 'you@stillpoint.test',
  admin: process.env.ADMIN_EMAIL ?? 'admin@stillpoint.test',
  coach: process.env.COACH_EMAIL ?? 'coach@stillpoint.test',
  client: process.env.CLIENT_EMAIL ?? 'client@stillpoint.test',
};

/**
 * A browser, wherever Chromium happens to live.
 *
 * The development container has one at a fixed path and Playwright's own
 * download is blocked there, so that path is tried. CI installs Playwright's
 * browser the ordinary way, and there the right answer is to let Playwright
 * resolve it. `CHROMIUM_PATH` beats both.
 *
 * `--no-sandbox` because these run as root in a container, where Chromium's
 * sandbox cannot start. It is a test browser against a local server.
 */
export function launch() {
  const asked = process.env.CHROMIUM_PATH;
  const container = '/opt/pw-browsers/chromium';
  const executablePath = asked ?? (existsSync(container) ? container : undefined);

  return chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ['--no-sandbox'],
  });
}
