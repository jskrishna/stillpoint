import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ACCOUNTS, API, PASSWORD, WEB, launch } from './browser.mjs';
import { reporter } from './report.mjs';

const require = createRequire(import.meta.url);

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

const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/**
 * Routes that need no account.
 *
 * `/welcome/invite/<token>` is one of them on purpose: whoever holds an
 * invitation has not signed in yet. The token is made at run time, below.
 */
const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/welcome',
  '/welcome/forgot',
  // The reset screen renders for any token: it is only checked when the form
  // is submitted. What it needs is the `?email=` the link carries, without
  // which it shows "this link is incomplete" instead of the form — and the
  // form is the screen worth auditing.
  '/welcome/reset/a-sample-token?email=someone%40example.com',
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

/**
 * The console, audited as an admin sees it.
 *
 * Signed out these render a one-line "the console is for staff", which is not
 * the screen worth auditing: the real one is a data table with a detail pane.
 * Needs the admin account `e2e/admin.mjs` documents; without it these routes
 * are skipped and said to be skipped rather than passing on the refusal.
 */
const ADMIN_ROUTES = ['/admin', '/admin/protocol', '/admin/safety', '/admin/users'];

/**
 * The coach portal, audited as a coach sees it.
 *
 * `/coach/<id>` is resolved at run time: a client id belongs to a real pairing
 * and cannot be hard-coded. Needs the coach account and pairing that
 * `e2e/coach.mjs` documents.
 */
const COACH_ROUTES = ['/coach'];

const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
];
const THEMES = ['light', 'dark'];

/** Signs a fresh page in with an existing account, or reports that it cannot. */
async function signIn(email, password) {
  const page = await browser.newPage();
  await page.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2500);
  const signedIn = await page.evaluate(
    () => window.localStorage.getItem('stillpoint.token.v1') !== null,
  );

  return { page, signedIn };
}

const browser = await launch();
const userPage = await browser.newPage();

// An account, so the private routes render something rather than redirecting.
const email = `a11y+${String(Date.now())}@example.com`;
await userPage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await userPage.getByRole('button', { name: 'Create an account instead' }).click();
await userPage.getByLabel('Name').fill('Audit');
await userPage.getByLabel('Email').fill(email);
await userPage.getByLabel('Password').fill(PASSWORD);
await userPage.getByRole('button', { name: 'Create my account' }).click();
await userPage.waitForURL('**/welcome/consent', { timeout: 15000 });
const boxes = userPage.locator('input[type=checkbox]');
await boxes.nth(0).check();
await boxes.nth(1).check();
await userPage.getByRole('button', { name: /Continue|Saving/ }).click();
await userPage.waitForURL('**/welcome/voice', { timeout: 15000 });
console.log(`signed in as ${email}`);

// Two more pages, signed in as the staff accounts, for their own routes.
const { page: adminPage, signedIn: asAdmin } = await signIn(ACCOUNTS.admin, PASSWORD);
console.log(asAdmin ? `signed in as ${ACCOUNTS.admin}` : 'no admin account — skipping the console');

const { page: coachPage, signedIn: asCoach } = await signIn(ACCOUNTS.coach, PASSWORD);
console.log(
  asCoach ? `signed in as ${ACCOUNTS.coach}\n` : 'no coach account — skipping the portal\n',
);

// A client's id belongs to a real pairing and an invitation's token to a real
// invitation, so both routes are resolved rather than guessed. With no coach
// there is nothing to audit on either screen.
const clientRoutes = [];
const inviteRoutes = [];
if (asCoach) {
  const made = await coachPage.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

    const clients = await fetch(`${api}/coach/clients`, { headers }).then((r) =>
      r.ok ? r.json() : [],
    );

    // An invitation to audit the screen with. It is never accepted, so it
    // leaves nothing behind but a pending row.
    const invite = await fetch(`${api}/coach/invites`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `a11y-invite+${String(Date.now())}@example.com` }),
    }).then((r) => (r.ok ? r.json() : null));

    return { clientId: clients[0]?.id, inviteLink: invite?.link };
  }, API);

  if (made.clientId !== undefined) clientRoutes.push(`/coach/${String(made.clientId)}`);
  if (made.inviteLink !== undefined && made.inviteLink !== null)
    inviteRoutes.push(String(made.inviteLink));
}

/**
 * A finished session, so the one route that needs content can be audited.
 *
 * `/app/journal/[entryId]` was the only one of the app's twenty routes this
 * script never reached, and the reason is worth keeping: it is the only one
 * that needs a row to exist. `DemoSeeder` deliberately makes no content — a
 * fixture that already holds what a test is about is a test that passes
 * whether or not the code works — and the account this script registers has
 * never had a session. So the summary said every route was clean while the one
 * screen where somebody reads back their own words and writes a note on them
 * had never been looked at.
 *
 * The other two dynamic routes were already resolved from real rows rather
 * than guessed (`/coach/<id>`, the invitation link), which is the same method:
 * make the thing, then audit the screen that shows it.
 *
 * A quick session, because the allowance prices the long one and nothing here
 * is about the allowance.
 */
const entryRoutes = [];
{
  const made = await userPage.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const started = await fetch(`${api}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'quick' }),
    });
    if (!started.ok) return { why: `starting a session: ${String(started.status)}` };
    const session = await started.json();

    // Six ordinary answers. Nothing here trips the risk screen: a session that
    // stops for safety is never journalled, so it would leave no entry.
    for (const utterance of [
      'The meeting went badly and I said nothing',
      'I can see how I let it sit with me',
      'hurt',
      'A morning when I was nine and nobody asked',
      'I am not taken seriously',
      'I am letting that one go',
    ]) {
      const turn = await fetch(`${api}/sessions/${String(session.id)}/turns`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ utterance }),
      });
      if (turn.status === 409) break;
      if (!turn.ok) return { why: `taking a turn: ${String(turn.status)}` };
    }

    const journal = await fetch(`${api}/journal?limit=1`, { headers }).then((r) =>
      r.ok ? r.json() : { items: [] },
    );
    const id = journal.items?.[0]?.id;
    return id === undefined ? { why: 'the session left no journal entry' } : { id };
  }, API);

  if (made.id === undefined) console.log(`no journal entry to audit — ${String(made.why)}\n`);
  else entryRoutes.push(`/app/journal/${String(made.id)}`);
}

const ROUTES = [
  ...PUBLIC_ROUTES.map((route) => ({ route, as: 'user' })),
  // Audited signed out, which is how it is met.
  ...inviteRoutes.map((route) => ({ route, as: 'anonymous' })),
  ...[...PRIVATE_ROUTES, ...entryRoutes].map((route) => ({ route, as: 'user' })),
  ...ADMIN_ROUTES.map((route) => ({ route, as: 'admin' })),
  ...[...COACH_ROUTES, ...clientRoutes].map((route) => ({ route, as: 'coach' })),
];

// A page with no token, for the routes someone meets before signing in.
const anonymousPage = await browser.newPage();

const PAGES = { user: userPage, admin: adminPage, coach: coachPage, anonymous: anonymousPage };
const AVAILABLE = { user: true, admin: asAdmin, coach: asCoach, anonymous: asCoach };
const SETUP = { admin: 'e2e/admin.mjs', coach: 'e2e/coach.mjs', anonymous: 'e2e/coach.mjs' };

let combinations = 0;
let skipped = 0;
const { ok, bad, watchForThrows } = reporter('WCAG 2.1 AA');
watchForThrows();

const violations = [];

for (const { route, as } of ROUTES) {
  if (!AVAILABLE[as]) {
    console.log(`  skip ${route} — needs a ${as} account (see ${SETUP[as]})`);
    skipped += 1;
    continue;
  }

  const page = PAGES[as];

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
        ok(label);
      } else {
        // The rule ids and the first few offending selectors, in the annotation
        // as well as the log: "3 nodes" on its own is not something anyone can
        // act on without opening the log, and the log is not always reachable.
        bad(
          `${label} — ${String(nodes)} node${nodes === 1 ? '' : 's'}`,
          result.violations
            .map((v) => `${v.id} (${v.impact}): ${v.nodes[0]?.target.join(' ') ?? ''}`)
            .join('; '),
        );
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
  `\n${String(combinations)} combinations across ${String(ROUTES.length - skipped)} routes, both palettes, 390 and 1440.` +
    (skipped === 0 ? '' : ` ${String(skipped)} route(s) skipped.`),
);
console.log(
  violations.length === 0 ? 'CLEAN' : `${String(violations.length)} failing combinations`,
);
process.exit(violations.length === 0 ? 0 : 1);
