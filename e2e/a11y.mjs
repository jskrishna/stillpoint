import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * WCAG 2.1 AA audit with axe-core over every route, in both palettes, at phone
 * and desktop width.
 *
 * `CLAUDE.md` asks for this after UI work, and it is a script rather than a
 * test because it needs the built app and a running API — the same reason as
 * `flow.mjs`. See `e2e/README.md` for how to start both.
 *
 * Contrast is already covered at the token level by
 * `packages/design-tokens/src/contrast.test.ts`, which asserts every text role
 * against every surface in both palettes. What this catches is the rest: a
 * label with nothing to label, a control with no accessible name, a heading
 * level skipped, a colour pairing that only happens once a component is
 * rendered.
 */

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

/** Routes that need no account. */
const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/welcome',
  '/admin',
  '/admin/protocol',
  '/admin/safety',
  '/coach',
  '/coach/priya',
];

/** Routes behind a token, reached after the script registers and consents. */
const PRIVATE_ROUTES = [
  '/welcome/consent',
  '/welcome/voice',
  '/app',
  '/app/journal',
  '/app/insights',
  '/app/settings',
  '/session',
];

const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
];
const THEMES = ['light', 'dark'];

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const context = await browser.newContext();
const page = await context.newPage();

// An account, so the private routes render something rather than redirecting.
const email = `a11y+${Date.now()}@example.com`;
await page.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Create an account instead' }).click();
await page.getByLabel('Name').fill('Audit');
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill('correct-horse-battery-staple');
await page.getByRole('button', { name: 'Create my account' }).click();
await page.waitForURL('**/welcome/consent', { timeout: 15000 });
const boxes = page.locator('input[type=checkbox]');
await boxes.nth(0).check();
await boxes.nth(1).check();
await page.getByRole('button', { name: /Continue|Saving/ }).click();
await page.waitForURL('**/welcome/voice', { timeout: 15000 });
console.log(`signed in as ${email}\n`);

const ROUTES = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES];
let combinations = 0;
const violations = [];

for (const route of ROUTES) {
  for (const size of WIDTHS) {
    for (const theme of THEMES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      // Let any fetch settle, so axe sees content and not "Loading…".
      await page.waitForTimeout(900);

      await page.addScriptTag({ content: AXE });
      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        }),
      );

      combinations += 1;
      const nodes = result.violations.reduce((n, v) => n + v.nodes.length, 0);
      const label = `${route} · ${theme} · ${size.name}`;
      if (nodes === 0) {
        console.log(`  ok   ${label}`);
      } else {
        console.log(`  FAIL ${label} — ${nodes} node${nodes === 1 ? '' : 's'}`);
        for (const v of result.violations) {
          console.log(`         ${v.id} (${v.impact}): ${v.help}`);
          for (const n of v.nodes.slice(0, 3)) console.log(`           ${n.target.join(' ')}`);
        }
        violations.push({ label, violations: result.violations });
      }
    }
  }
}

await browser.close();

console.log(
  `\n${String(combinations)} combinations across ${String(ROUTES.length)} routes, both palettes, 390 and 1440.`,
);
console.log(
  violations.length === 0 ? 'CLEAN' : `${String(violations.length)} failing combinations`,
);
process.exit(violations.length === 0 ? 0 : 1);
