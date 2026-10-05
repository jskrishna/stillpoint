import { existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACCOUNTS, PASSWORD } from './browser.mjs';
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
 * - **The headers the window is served under.** `e2e/privacy.mjs` asserts
 *   these on the web app, served by `next start` from `.next`. This is a
 *   different server from a different build, and they come from `headers()` in
 *   `next.config.ts`, which `output: 'standalone'` has no reason to drop —
 *   "no reason to" being a poor argument for the one window signed in to
 *   somebody's journal with `shell.openExternal` behind it. Checked by
 *   deleting `X-Frame-Options` from `next.config.ts` and rebuilding.
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

/**
 * The paths the app's own menu navigates to, from the app's own built module.
 *
 * Imported rather than listed here, because a second copy of them in this
 * file is the duplication `APP_PATHS` was extracted to end. `dist/` exists
 * whenever this script can run at all: `electron .` runs `dist/main.js`.
 */
const { APP_PATHS } = await import(pathToFileURL(join(DESKTOP, 'dist', 'navigation.js')).href);

const { ok, bad, finish, watchForThrows } = reporter('the desktop shell');
watchForThrows();

/**
 * The app's own Electron binary, or a reason there is none.
 *
 * `electron`'s install script is the only one `pnpm-workspace.yaml` allows to
 * run, because without it `electron .` has nothing to run. Where egress to its
 * release host is blocked the binary is simply absent, and this says so and
 * stops rather than letting the require download one — a different Electron
 * from the one the app pins, fetched mid-check.
 */
let electronBinary;
try {
  electronBinary = createRequire(join(DESKTOP, 'package.json'))('electron');
  if (typeof electronBinary !== 'string' || !existsSync(electronBinary))
    throw new Error(`not at ${String(electronBinary)}`);
} catch (e) {
  console.log(`\n  no Electron binary — skipping (${e instanceof Error ? e.message : String(e)})`);
  console.log('  `pnpm install` runs its install script; see pnpm-workspace.yaml.');
  await finish();
}

/**
 * A deadline for the whole script.
 *
 * Everything below is bounded individually, and the first run of this check
 * still hung in CI for thirteen minutes — so there is one bound that does not
 * depend on having thought of the right failure.
 */
const DEADLINE_MS = Number(process.env.DESKTOP_DEADLINE_MS ?? 360000);
setTimeout(() => {
  console.log(`\n  THREW (deadline) nothing finished within ${String(DEADLINE_MS)}ms`);
  process.exit(1);
}, DEADLINE_MS).unref?.();

/**
 * One user-data directory for this run, and nobody else's.
 *
 * `main.ts` takes a single-instance lock, and an app that cannot get it says
 * so and **quits without opening a window** — which is right for a product
 * that must not serve one journal on two ports, and a trap for a check that
 * launches twice. A launch that is killed rather than asked to quit can leave
 * `SingletonLock` behind, and then every later launch quits at once: the first
 * run of this check hung for thirteen minutes in CI waiting for a window that
 * was never going to appear.
 *
 * So the profile is fresh per run and shared by both launches in it — section
 * 5 needs the second launch to see what the first stored — which also makes
 * that assertion about this run rather than about whatever an earlier one left
 * behind.
 */
const profile = mkdtempSync(join(tmpdir(), 'stillpoint-desktop-'));

/**
 * Launches the app.
 *
 * `--no-sandbox` because this runs as root in a container, where Chromium's
 * own sandbox cannot start — the same reason `e2e/browser.mjs` passes it. It
 * is **not** the sandbox section 2 is about: that one is `webPreferences`,
 * which decides whether the page can reach Node, and this flag does not touch
 * it. Section 2 asserts the page, not the flag, for exactly this reason.
 *
 * `executablePath` is the project's **own** Electron rather than letting
 * Playwright resolve one. `require('electron')` returns the binary's path and
 * downloads it synchronously if it is missing, so this is also where a missing
 * binary turns into a sentence instead of a stall.
 */
const start = () =>
  _electron.launch({
    executablePath: electronBinary,
    args: ['.', '--no-sandbox', `--user-data-dir=${profile}`],
    cwd: DESKTOP,
    env: { ...process.env, STILLPOINT_PORT: PORT },
    timeout: 120000,
  });

/**
 * Asks the app to quit and waits for it, rather than leaving Playwright to
 * kill it — a killed app is what leaves the lock behind.
 */
const stop = async (running) => {
  await Promise.race([running.close(), new Promise((resolve) => setTimeout(resolve, 20000))]).catch(
    () => undefined,
  );
  // Whatever happened above, do not relaunch into a process that is still
  // holding the lock.
  await new Promise((resolve) => setTimeout(resolve, 1500));
};

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

await stop(app);

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

// ---------------------------------------------------------------------------
console.log('\n6. The policy the window is served under');

// `e2e/privacy.mjs` asserts these on the web app — served by `next start` from
// `.next`. The desktop window is served by a **different** server from a
// different build, and nothing checked that the headers survive the trip. They
// come from `headers()` in `apps/web/next.config.ts`, which `output:
// 'standalone'` has no reason to drop, and "no reason to" is not the argument
// to rest on for the one window that is signed in to somebody's journal and
// has `shell.openExternal` behind it.
const served = await win.evaluate(async () => {
  const r = await fetch(window.location.href);
  const out = {};
  for (const [k, v] of r.headers.entries()) out[k.toLowerCase()] = v;
  return out;
});

const policy = served['content-security-policy'] ?? '';
if (/default-src 'self'/.test(policy) && /object-src 'none'/.test(policy))
  ok('a Content-Security-Policy is served here too');
else bad('a Content-Security-Policy is served here too', policy.slice(0, 200) || '(none)');

// The one directive that matters most: a token read out of `localStorage`
// cannot be sent anywhere this does not name.
const connect = /connect-src ([^;]+)/.exec(policy)?.[1]?.trim() ?? '';
if (connect !== '' && !connect.includes('*'))
  ok(`connect-src is a list, not a wildcard (${connect})`);
else bad('connect-src is a list, not a wildcard', connect || '(no connect-src)');

// True only while `UserEar` is unbound, which is what the setup screen's
// "Your voice is never saved" rests on.
if (/microphone=\(\)/.test(served['permissions-policy'] ?? ''))
  ok('and the microphone is denied, as the unbound listener implies');
else bad('and the microphone is denied', served['permissions-policy'] ?? '(no Permissions-Policy)');

for (const [header, want] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'no-referrer'],
]) {
  if (served[header] === want) ok(`${header}: ${want}`);
  else bad(`${header}: ${want}`, served[header] ?? '(absent)');
}

// ---------------------------------------------------------------------------
console.log('\n7. Signed in, and the screens the menu promises');

/*
 * Nothing here had ever signed in, which hid two things behind one gap.
 *
 * The first is whether a person can use this app at all. The window is its
 * own origin — `http://127.0.0.1:8735`, fixed for exactly that reason — so
 * every call it makes to the API is cross-origin, and the API answers a list
 * and never `*`. `CORS_ALLOWED_ORIGINS` carries this port, and if it ever
 * stopped carrying it **nobody could sign in to the desktop app** and every
 * check above would still be green: they assert the window, the pin, the
 * headers and the port, and none of them needs the API to answer.
 *
 * The second is the Help menu's own promise. Its one item is labelled "If you
 * need someone now" and loads `/app/settings`, and that screen had no crisis
 * number on it at all until recently — the label was written against the
 * phone's settings screen. `apps/web` renders the numbers there now, and
 * `e2e/flow.mjs` asserts them — but against `next start` and `.next`. This
 * window is served by a **different build** from a different directory, which
 * is the same reason section 6 re-checks the headers here.
 */
await win.goto(`${ORIGIN}/welcome`, { waitUntil: 'domcontentloaded' });
await win.waitForTimeout(2500);

await win.locator('input[type="email"]').fill(ACCOUNTS.user);
await win.locator('input[type="password"]').fill(PASSWORD);
await win.getByRole('button', { name: /Sign in/i }).click();
await win.waitForTimeout(4000);

// Asserted on the token rather than on the URL: signing in carries on through
// the welcome flow, so which screen it lands on is not the question. A token
// in `localStorage` is the API having answered this origin.
const signedIn = await win.evaluate(() => window.localStorage.getItem('stillpoint.token.v1'));
if (typeof signedIn === 'string' && signedIn !== '')
  ok('somebody can sign in from this origin, so the API allows it');
else bad('somebody can sign in from this origin', `token is ${JSON.stringify(signedIn)}`);

/*
 * Every path the menu can reach, loaded in the real window.
 *
 * `navigation.test.ts` asserts each one has a `page.tsx`; this asserts the
 * built server serves it. A renamed route would be Next's not-found page
 * **inside** this frame, which the navigation pin allows because the origin is
 * the same — so "the window did not leave" is not the check here, the content
 * is.
 */
for (const [name, path] of Object.entries(APP_PATHS)) {
  await win.goto(`${ORIGIN}${path}`, { waitUntil: 'domcontentloaded' });
  await win.waitForTimeout(2500);
  const shown = await win.locator('body').innerText();

  if (/404|This page could not be found|could not be found/i.test(shown))
    bad(`the menu's ${name} path is a real screen (${path})`, shown.slice(0, 120));
  else if (shown.trim() === '')
    bad(`the menu's ${name} path is a real screen (${path})`, 'the page rendered nothing');
  else ok(`the menu's ${name} path is a real screen (${path})`);
}

// And the Help item's whole reason, on the screen it loads. Counted on the
// `tel:` links rather than on the words, because a number that is not a link
// is not something the system can dial — and `tel:` is in `mayOpenExternally`
// precisely so this works.
await win.goto(`${ORIGIN}${APP_PATHS.settings}`, { waitUntil: 'domcontentloaded' });
await win.waitForTimeout(3500);
const settings = await win.locator('body').innerText();

if (/IF YOU NEED SOMEONE NOW/i.test(settings))
  ok('the Help item’s screen carries the crisis section it is labelled for');
else bad('the Help item’s screen carries the crisis section', settings.slice(-400));

const dialable = await win.locator('a[href^="tel:"]').count();
if (dialable >= 3) ok(`and each number is dialable (${String(dialable)} tel: links)`);
else bad('and each number is dialable', `${String(dialable)} tel: links`);

// This account is Canadian — `users.country` defaults to `CA` — so these are
// the numbers, and another market's must not be here. The same pair
// `flow.mjs` asserts on the web, because the one thing worse than no number
// is a number that does not answer where somebody is.
if (/9-?8-?8/.test(settings) && /911/.test(settings))
  ok('and they are this account’s own — 988 and 911');
else bad('and they are this account’s own', settings.slice(-400));

if (!/14416|Tele-MANAS|\b112\b/.test(settings)) ok('and not another market’s');
else bad('and not another market’s', settings.slice(-400));

await finish(() => stop(app));
