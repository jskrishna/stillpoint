import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { reporter } from './report.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');

/**
 * The desktop shell, actually running.
 *
 * `apps/desktop` had one unit test — `navigation.test.ts`, over the two
 * decisions worth asserting in isolation — and nothing that started the app.
 * The root `CLAUDE.md` said it "has been launched under Xvfb here, which
 * proves the server starts, the app renders and a session survives a
 * relaunch", and every word of that was true once, by hand, on a machine that
 * no longer exists. That is a ritual people skip, which is the argument that
 * produced `e2e/run.mjs` and `scripts/verify-clean.mjs`.
 *
 * What only a running app can show, and what this asserts:
 *
 * - **The bundled server starts.** `apps/desktop/web` is the Next.js
 *   standalone build, spawned by the main process on a fixed port. Nothing
 *   else in this repository runs it: the web checks use `next start` against
 *   `.next`, which is a different build with a different entry point, and
 *   `next start` is explicitly not supported alongside `output: 'standalone'`.
 * - **The renderer has no Node.** Asserted from inside the page rather than
 *   read off `webPreferences`, because the consequence is what matters and the
 *   options are four lines someone can change. Be precise about what that
 *   catches, though: measured, flipping `sandbox` to false **and**
 *   `nodeIntegration` to true changes nothing visible here, because
 *   `contextIsolation` keeps Node out of the page's own world. Turning that
 *   off as well puts `require` and `process` in the page and turns these
 *   assertions red. So this guards the combination that actually exposes Node,
 *   not each option on its own — a weakening of one option with the others
 *   holding would pass.
 * - **The navigation pin, in the real main process.** The unit test covers
 *   `sameOrigin`; this covers the `will-navigate` handler that calls it, on
 *   the window that is signed in to somebody's journal.
 * - **`window.open` cannot hand the OS a local scheme.**
 * - **The fixed port is the app's identity.** `localStorage` survives a
 *   relaunch, which is the entire reason the port is 8735 and not whatever the
 *   operating system offers.
 *
 * It needs the desktop build (`pnpm --filter @stillpoint/desktop run build`)
 * and the API on :8000, both of which `e2e/run.mjs` arranges. It needs a
 * display: `xvfb-run -a node e2e/desktop.mjs`, or `pnpm run e2e desktop`,
 * which does that for you.
 *
 * What it still does not prove is everything `LAUNCH.md` item 8 is about:
 * this is a Linux container, the app has never been packaged, signed or
 * notarised, and it has never run on macOS or Windows. A green run here means
 * "this starts and holds its rules", not "this ships".
 */

const DESKTOP = fileURLToPath(new URL('../apps/desktop', import.meta.url));
const PORT = process.env.STILLPOINT_PORT ?? '8735';
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** The API, which section 3 needs as a host that actually resolves. */
const API = process.env.API_URL ?? 'http://localhost:8000/api';

const { ok, bad, finish, watchForThrows } = reporter('the desktop shell');
watchForThrows();

/**
 * Launches the app.
 *
 * `--no-sandbox` because this runs as root in a container, where Chromium's
 * own sandbox cannot start — the same reason `e2e/browser.mjs` passes it. It
 * is **not** the sandbox section 2 is about: that one is `webPreferences`,
 * which decides whether the page can reach Node, and this flag does not touch
 * it. Section 2 asserts the page, not the flag, for exactly this reason.
 */
const start = () =>
  _electron.launch({
    args: ['.', '--no-sandbox'],
    cwd: DESKTOP,
    env: { ...process.env, STILLPOINT_PORT: PORT },
  });

// ---------------------------------------------------------------------------
console.log('\n1. It starts, and serves the app to its own window');

let app = await start();
let win = await app.firstWindow({ timeout: 120000 });
await win.waitForLoadState('domcontentloaded');

// The app opens on `/app`, which redirects to `/welcome` with no token. Either
// is the app; what matters is that it is *this* origin and that it rendered.
await win
  .waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 60000 })
  .catch(() => undefined);

const landed = win.url();
if (landed.startsWith(`${ORIGIN}/`)) ok(`the window is on the app's own origin (${landed})`);
else bad("the window is on the app's own origin", landed);

const rendered = (await win.locator('body').innerText()).replace(/\s+/g, ' ');
if (/Stillpoint/.test(await win.title()) || rendered.length > 40)
  ok(`the bundled standalone server served a page (${rendered.slice(0, 60)}…)`);
else bad('the bundled standalone server served a page', rendered.slice(0, 200));

// One window, not two. A second one appearing by itself would mean the open
// handler let something through at startup.
if (app.windows().length === 1) ok('exactly one window');
else bad('exactly one window', `${String(app.windows().length)} windows`);

// ---------------------------------------------------------------------------
console.log('\n2. The page has nothing it should not have');

// The page's own view, not the options that produced it. What this catches is
// stated in the header: the combination that actually exposes Node, which
// needs `contextIsolation` off as well as `nodeIntegration` on.
const reach = await win.evaluate(() => ({
  require: typeof require,
  process: typeof process,
  module: typeof module,
  // A preload would most likely have left something here.
  exposed: Object.keys(window).filter((k) => /electron|ipc|node|preload/i.test(k)),
}));

if (reach.require === 'undefined' && reach.module === 'undefined')
  ok('no `require` and no `module` in the renderer');
else bad('no `require` and no `module` in the renderer', JSON.stringify(reach));

if (reach.process === 'undefined') ok('no `process` either');
else bad('no `process` either', `typeof process is ${reach.process}`);

if (reach.exposed.length === 0) ok('and no preload bridge on `window`');
else bad('and no preload bridge on `window`', reach.exposed.join(', '));

// ---------------------------------------------------------------------------
console.log('\n3. The navigation pin, in the main process rather than in a unit test');

// The case the old `url.startsWith(origin)` check let through. Everything
// before the `@` is userinfo, so this string **starts with this app's own
// origin** and resolves somewhere else — and the somewhere else here is the
// API, deliberately: a host that does not resolve would make this assertion
// pass whether or not the pin works, which is the worst kind of green.
const smuggled = `${ORIGIN}@${new URL(API).host}/api/me`;
if (new URL(smuggled).host === new URL(API).host && smuggled.startsWith(ORIGIN))
  ok(`the URL really is a prefix of this origin and a different host (${new URL(smuggled).host})`);
else bad('the URL really is a prefix of this origin and a different host', smuggled);

await win.evaluate((url) => {
  window.location.href = url;
}, smuggled);
await win.waitForTimeout(3000);

const after = win.url();
if (after.startsWith(`${ORIGIN}/`)) ok(`the window did not go (still ${after})`);
else bad('the window did not go', after);

const stillOurs = (await win.locator('body').innerText()).replace(/\s+/g, ' ');
// The API answers 401 with a JSON body to an unauthenticated request. If it
// were on screen, the pin would have failed and the page would be showing
// another origin's response inside this app's frame.
if (!/Unauthenticated|"message"/.test(stillOurs)) ok("and the API's answer is not in the frame");
else bad("and the API's answer is not in the frame", stillOurs.slice(0, 200));

// ---------------------------------------------------------------------------
console.log('\n4. What may be handed to the operating system');

// The renderer is sandboxed, but the content policy keeps `'unsafe-inline'`
// and `apps/web/next.config.ts` is plain that injected inline script still
// runs. So this is what a payload in the page would try.
const opened = await win.evaluate(() => {
  const handle = window.open('file:///etc/passwd');
  return handle === null;
});
await win.waitForTimeout(1500);

if (app.windows().length === 1) ok('a `file:` URL opens no window in this app');
else bad('a `file:` URL opens no window in this app', `${String(app.windows().length)} windows`);
if (opened) ok('and `window.open` hands the page nothing back');
else bad('and `window.open` hands the page nothing back');

if (win.url().startsWith(`${ORIGIN}/`)) ok('and the window is where it was');
else bad('and the window is where it was', win.url());

// ---------------------------------------------------------------------------
console.log('\n5. The fixed port is the app’s identity');

// Asking the operating system for a free port is the obvious thing and it is
// wrong here: the port is part of the origin, the origin is what the browser
// keys storage by, and the web app keeps its bearer token in `localStorage`. A
// new port each launch is an empty store each launch — the app signs everybody
// out every time it starts, and nothing in the logs says why.
const planted = `survives-${String(Date.now())}`;
await win.evaluate((value) => {
  window.localStorage.setItem('stillpoint.e2e.relaunch', value);
}, planted);
await win.waitForTimeout(500);

await app.close();

app = await start();
win = await app.firstWindow({ timeout: 120000 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2000);

const relaunchedTo = win.url();
if (relaunchedTo.startsWith(`${ORIGIN}/`)) ok(`it comes back on the same origin (${ORIGIN})`);
else bad('it comes back on the same origin', relaunchedTo);

const kept = await win.evaluate(() => window.localStorage.getItem('stillpoint.e2e.relaunch'));
if (kept === planted) ok('and what the page stored is still there, so a session survives');
else bad('and what the page stored is still there', `read back ${JSON.stringify(kept)}`);

await win
  .evaluate(() => {
    window.localStorage.removeItem('stillpoint.e2e.relaunch');
  })
  .catch(() => undefined);

await finish(() => app.close());
