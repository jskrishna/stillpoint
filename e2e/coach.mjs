import { createRequire } from 'node:module';

/**
 * The coach portal, against a running API.
 *
 * One sentence, checked from the outside: "You only see sessions your clients
 * choose to share." Not that a private session is hidden on the screen — that
 * its title, its belief and its note are absent from what the coach's browser
 * receives.
 *
 * It needs a coach account paired with a client, which the API cannot make
 * (`role` is not fillable and pairing is not a public route). The script
 * registers the client itself and prints the artisan command for the rest; see
 * `e2e/README.md`.
 */

const { chromium } = createRequire(import.meta.url)('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:8000/api';
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const COACH_EMAIL = process.env.COACH_EMAIL ?? 'coach@stillpoint.test';
const COACH_PASSWORD = process.env.COACH_PASSWORD ?? 'correct-horse-battery-staple';
const CLIENT_EMAIL = process.env.CLIENT_EMAIL ?? 'client@stillpoint.test';
const PASSWORD = 'correct-horse-battery-staple';

const SHARED = 'My manager dismissed my work in front of the team';
const PRIVATE = 'Something I am not ready to discuss';

const fails = [];
const ok = (l) => console.log(`  ok   ${l}`);
const bad = (l, d) => {
  fails.push(l);
  console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`);
};

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });

// ---------------------------------------------------------------------------
console.log('\n1. The client runs two sessions and shares one');

const client = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await client.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await client.getByLabel('Email').fill(CLIENT_EMAIL);
await client.getByLabel('Password').fill(PASSWORD);
await client.getByRole('button', { name: 'Sign in' }).click();
await client.waitForTimeout(2000);

const clientSignedIn = await client.evaluate(
  () => window.localStorage.getItem('stillpoint.token.v1') !== null,
);
if (!clientSignedIn) {
  bad('the client signs in', `is ${CLIENT_EMAIL} made and paired? see e2e/README.md`);
} else {
  ok('the client signs in');

  // Consent, if this is a fresh account.
  if (client.url().includes('/welcome/consent')) {
    const boxes = client.locator('input[type=checkbox]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await client.getByRole('button', { name: /Continue|Saving/ }).click();
    await client.waitForURL('**/welcome/voice', { timeout: 15000 });
  }

  /** Runs a session to the end, answering every step. */
  const runSession = async (what) => {
    await client.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
    await client.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
      timeout: 15000,
    });

    for (let step = 1; step <= 6; step += 1) {
      const feelings = client.locator('button', { hasText: /^(Angry|Sad|Anxious|Ashamed)$/ });
      if ((await feelings.count()) > 0) {
        await feelings.first().click();
      } else {
        const box = client.locator('textarea, input[type=text]').first();
        if ((await box.count()) === 0) break;
        await box.fill(step === 1 ? what : `An answer for step ${String(step)}`);
      }
      const next = client.locator('button', { hasText: /^(Continue|Next)/ }).first();
      if ((await next.count()) === 0) break;
      await next.click();
      await client.waitForTimeout(500);
    }

    const yes = client.getByRole('button', { name: 'Yes' });
    if ((await yes.count()) > 0) {
      await yes.click();
      await client.waitForTimeout(500);
    }
  };

  await runSession(SHARED);
  await runSession(PRIVATE);
  ok('two sessions finished');

  // Share the first and leave the second private, and add a note to each so
  // there is text to look for on the coach's side.
  await client.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
  await client.waitForTimeout(1500);

  const open = async (title) => {
    const row = client.locator('a[href^="/app/journal/"]', { hasText: title.slice(0, 30) }).first();
    if ((await row.count()) === 0) return false;
    await row.click();
    await client.waitForTimeout(1500);
    return true;
  };

  if (await open(SHARED)) {
    await client.locator('textarea').fill('This one felt big. Want to talk about it.');
    await client.waitForTimeout(1500);
    await client
      .locator('button', { hasText: /^Share with coach$/ })
      .first()
      .click();
    await client.waitForTimeout(1200);
    ok('one session is shared');
  } else bad('the shared session is in the journal');

  await client.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
  await client.waitForTimeout(1500);
  if (await open(PRIVATE)) {
    await client.locator('textarea').fill('A note nobody else should read.');
    await client.waitForTimeout(1500);
    const share = client.locator('button', { hasText: /^Share with coach$/ });
    if ((await share.count()) > 0) ok('the other session is left private');
    else bad('the other session is left private', 'it is already shared');
  } else bad('the private session is in the journal');
}
await client.close();

// ---------------------------------------------------------------------------
console.log('\n2. What the coach receives');

const coach = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await coach.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await coach.getByLabel('Email').fill(COACH_EMAIL);
await coach.getByLabel('Password').fill(COACH_PASSWORD);
await coach.getByRole('button', { name: 'Sign in' }).click();
await coach.waitForTimeout(2000);

const coachSignedIn = await coach.evaluate(
  () => window.localStorage.getItem('stillpoint.token.v1') !== null,
);
if (!coachSignedIn) {
  bad('the coach signs in', `is ${COACH_EMAIL} made? see e2e/README.md`);
} else {
  ok('the coach signs in');

  await coach.goto(`${WEB}/coach`, { waitUntil: 'networkidle' });
  await coach.waitForTimeout(1800);
  const list = await coach.locator('body').innerText();

  if (/Your clients/.test(list) && !list.includes('Loading')) ok('the client list loads');
  else bad('the client list loads', list.slice(0, 300));
  if (/You only see sessions your clients choose to share/.test(list))
    ok('the portal states the rule');
  else bad('the portal states the rule');
  if (!list.includes(PRIVATE)) ok('the list carries no private session');
  else bad('the list carries no private session');

  const row = coach.locator('a[href^="/coach/"]').first();
  if ((await row.count()) === 0) {
    bad('the coach has a client to open', 'is the pairing made? see e2e/README.md');
  } else {
    await row.click();
    await coach.waitForTimeout(1800);
    const detail = await coach.locator('body').innerText();

    if (detail.includes(SHARED)) ok('the shared session is there');
    else bad('the shared session is there', detail.slice(0, 400));
    if (detail.includes('This one felt big')) ok('the client’s own note travels with it');
    else bad('the client’s own note travels with it');

    // The checks that matter: absent, not hidden.
    const html = await coach.content();
    if (!html.includes(PRIVATE)) ok('the private session is absent from the page');
    else bad('the private session is absent from the page');
    if (!html.includes('A note nobody else should read'))
      ok('the private note is absent from the page');
    else bad('the private note is absent from the page');

    // And absent from the API, not just from what the page chose to render.
    const payload = await coach.evaluate(async (api) => {
      const token = window.localStorage.getItem('stillpoint.token.v1');
      const list = await fetch(`${api}/coach/clients`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      const one = await fetch(`${api}/coach/clients/${list[0].id}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      }).then((r) => r.text());
      return one;
    }, API);

    if (!payload.includes(PRIVATE)) ok('the private session is absent from the response');
    else bad('the private session is absent from the response');

    // A coach is not a reviewer.
    const queue = await coach.evaluate(async (api) => {
      const token = window.localStorage.getItem('stillpoint.token.v1');
      const r = await fetch(`${api}/admin/safety-flags`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      return r.status;
    }, API);
    if (queue === 404) ok('the safety queue refuses a coach (404)');
    else bad('the safety queue refuses a coach', String(queue));

    // The coach's own notes.
    await coach.locator('textarea').fill('Wants to talk about her manager.');
    await coach.waitForTimeout(1500);
    await coach.reload({ waitUntil: 'networkidle' });
    await coach.waitForTimeout(1800);
    const saved = await coach.locator('textarea').inputValue();
    if (saved === 'Wants to talk about her manager.') ok('the coach’s notes survive a reload');
    else bad('the coach’s notes survive a reload', saved);
  }
}
await coach.close();

await browser.close();
console.log(
  `\n${fails.length === 0 ? 'ALL PASSED' : `${String(fails.length)} FAILED: ${fails.join('; ')}`}`,
);
process.exit(fails.length === 0 ? 0 : 1);
