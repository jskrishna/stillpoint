import { createRequire } from 'node:module';

/**
 * End-to-end check of the web app against the Laravel API.
 *
 * It is a script rather than a test suite because it needs two servers running,
 * which CI does not have. Run it by hand after changing anything in the session
 * flow or the API client:
 *
 *     cd apps/api && php artisan serve --port=8000 &
 *     pnpm run build && (cd apps/web && npx next start --port 3000) &
 *     node e2e/flow.mjs
 *
 * What it is really here for is the last section: that crisis language typed
 * into the browser is stopped by the *server*, and leaves no journal row. That
 * is the promise the marketing site makes, and the one worth checking against
 * the real thing rather than a mock.
 */

// Resolved through require: playwright is CommonJS, and the browser binary is
// the one the container already has rather than one this script downloads.
const { chromium } = createRequire(import.meta.url)('playwright');
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const email = `e2e+${Date.now()}@example.com`;
const fails = [];
const ok = (label) => console.log(`  ok   ${label}`);
const bad = (label, detail) => {
  fails.push(label);
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('    [console error]', m.text());
});
page.on('pageerror', (e) => console.log('    [page error]', e.message));

const text = () => page.locator('body').innerText();

// ------------------------------------------------- 1. register
console.log('\n1. Register and consent');
await page.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Create an account instead' }).click();
await page.getByLabel('Name').fill('E2E Tester');
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill('correct-horse-battery-staple');
await page.getByRole('button', { name: 'Create my account' }).click();
await page.waitForURL('**/welcome/consent', { timeout: 15000 });
ok('registration lands on the consent gate');

const continueBtn = page.getByRole('button', { name: /Continue|Saving/ });
if (await continueBtn.isDisabled()) ok('Continue is blocked before consent');
else bad('Continue is blocked before consent');

const boxes = page.locator('input[type=checkbox]');
await boxes.nth(0).check();
await boxes.nth(1).check();
if (!(await continueBtn.isDisabled())) ok('Continue unlocks with the required items');
else bad('Continue unlocks with the required items');
await continueBtn.click();
await page.waitForURL('**/welcome/voice', { timeout: 15000 });
ok('consent is accepted');

// ------------------------------------------------- 2. voice -> app
console.log('\n2. Voice setup');
await page.getByRole('button', { name: 'I’ll type instead' }).click();
await page.waitForURL('**/app', { timeout: 15000 });
ok('typing mode saved, lands on home');
await page.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, {
  timeout: 15000,
});
if ((await text()).includes('Nothing yet')) ok('journal starts empty');
else bad('journal starts empty', await text());

// ------------------------------------------------- 3. a full session
console.log('\n3. A full six-step session');
await page.getByRole('link', { name: /Start talking/ }).click();
await page.waitForURL('**/session', { timeout: 15000 });
await page.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});

const answers = [
  'My manager dismissed my work in front of the team',
  null,
  'Being talked over at school when I was nine',
  'I am not good enough',
  'I forgive myself',
];
for (let step = 1; step <= 6; step += 1) {
  const body = await text();
  const label = (body.match(/Step (\d) of (\d)/) ?? []).slice(1).join('/');
  if (step === 1 && label !== '1/6') bad('session starts at step 1 of 6', label);
  if (step === 1) ok(`session starts at step ${label}`);

  const feelingBtns = page.locator('button', {
    hasText: /^(Angry|Sad|Anxious|Ashamed|Hurt|Lonely)$/,
  });
  if ((await feelingBtns.count()) > 0) {
    await feelingBtns.first().click();
    ok(`step ${step}: picked a feeling`);
  } else {
    const box = page.locator('textarea, input[type=text]').first();
    if ((await box.count()) === 0) break;
    await box.fill(answers[step - 1] ?? `answer for step ${step}`);
  }
  const next = page.locator('button', { hasText: /^(Continue|Next|Done|Finish)/ }).first();
  if ((await next.count()) === 0) break;
  await next.click();
  await page.waitForTimeout(600);
}

const after = await text();
if (/Did you feel calmer|calmer/i.test(after)) ok('the session reaches the summary');
else bad('the session reaches the summary', after.slice(0, 300));

const yes = page.getByRole('button', { name: 'Yes' });
if ((await yes.count()) > 0) {
  await yes.click();
  await page.waitForTimeout(500);
  ok('rated the session');
}
const done = page.locator('button, a', { hasText: /Done|Finish|Journal/ }).first();
if ((await done.count()) > 0) {
  await done.click();
  await page.waitForTimeout(1200);
}

// ------------------------------------------------- 4. journal
console.log('\n4. The journal holds it');
await page.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const journal = await text();
if (!journal.includes('Nothing yet') && !journal.includes('Loading'))
  ok('the finished session is in the journal');
else bad('the finished session is in the journal', journal.slice(0, 300));

const row = page.locator('a[href^="/app/journal/"]').first();
if ((await row.count()) > 0) {
  await row.click();
  await page.waitForTimeout(1500);
  const detail = await text();
  if (detail.includes('OLD BELIEF') || detail.includes('WHAT YOU FELT'))
    ok('the entry detail loads from the server');
  else bad('the entry detail loads from the server', detail.slice(0, 300));

  // the note, and sharing, must not clobber each other
  await page.locator('textarea').fill('A note that must survive a sharing toggle.');
  await page.waitForTimeout(1500);
  await page
    .locator('button', { hasText: /Share with coach|Shared with coach/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const reloaded = await text();
  const noteKept = (await page.locator('textarea').inputValue()).includes('must survive');
  const shared = reloaded.includes('Shared with coach');
  if (noteKept && shared) ok('the note survives toggling sharing, both persisted');
  else bad('the note survives toggling sharing', `note=${noteKept} shared=${shared}`);
} else bad('a journal row exists to open');

// ------------------------------------------------- 5. insights
console.log('\n5. Insights come from the server');
await page.goto(`${WEB}/app/insights`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const ins = await text();
if (/Last \d+ days/.test(ins) && !ins.includes('Loading')) ok('insights render');
else bad('insights render', ins.slice(0, 300));
if (/sessions/.test(ins)) ok('insights count the session');
else bad('insights count the session', ins.slice(0, 200));

// ------------------------------------------------- 6. settings
console.log('\n6. Settings write to the account');
await page.goto(`${WEB}/app/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const set = await text();
if (set.includes(email)) ok('settings show the signed-in account');
else bad('settings show the signed-in account', set.slice(0, 300));
await page.locator('select').nth(2).selectOption('never');
await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const sharing = await page.locator('select').nth(2).inputValue();
if (sharing === 'never') ok('a changed preference survives a reload');
else bad('a changed preference survives a reload', sharing);

// ------------------------------------------------- 7. the safety stop
console.log('\n7. The safety stop is the server’s, not the browser’s');
await page.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});

const requests = [];
page.on('request', (r) => {
  if (r.url().includes('/api/')) requests.push(`${r.method()} ${r.url().replace(/^.*\/api/, '')}`);
});

await page.locator('textarea, input[type=text]').first().fill('I want to kill myself');
await page
  .locator('button', { hasText: /^(Continue|Next)/ })
  .first()
  .click();
await page.waitForTimeout(2000);

const stopped = await text();
if (/Tele-MANAS|14416/.test(stopped)) ok('the crisis screen shows the Tele-MANAS helpline');
else bad('the crisis screen shows the Tele-MANAS helpline', stopped.slice(0, 400));
if (/112/.test(stopped)) ok('the crisis screen shows emergency 112');
else bad('the crisis screen shows emergency 112');
if (!/Step \d of 6/.test(stopped)) ok('the session is over, no step is shown');
else bad('the session is over, no step is shown');
if (requests.some((r) => r.includes('/turns')))
  ok(`the utterance went to the server (${requests.join(', ')})`);
else bad('the utterance went to the server', requests.join(', '));

// A stopped session is terminal. Checked against the API rather than the
// screen, because what matters is that the server refuses to carry it on — a
// reload starting a fresh session is fine, the old one resuming is not.
const stoppedId = (requests.find((r) => r.includes('/turns')) ?? '').match(
  /sessions\/([^/]+)/,
)?.[1];
if (stoppedId === undefined) {
  bad('captured the stopped session id');
} else {
  const terminal = await page.evaluate(async (id) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const read = await fetch(`http://localhost:8000/api/sessions/${id}`, { headers });
    const session = await read.json();
    const resume = await fetch(`http://localhost:8000/api/sessions/${id}/turns`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterance: 'actually I am fine, let us carry on' }),
    });
    return {
      ended: session.ended,
      endReason: session.endReason,
      step: session.step,
      resumeStatus: resume.status,
    };
  }, stoppedId);

  if (terminal.ended === true && terminal.endReason === 'safety_stop')
    ok('the session is recorded as a safety stop');
  else bad('the session is recorded as a safety stop', JSON.stringify(terminal));

  if (terminal.step === null) ok('the stopped session is on no step');
  else bad('the stopped session is on no step', JSON.stringify(terminal.step));

  if (terminal.resumeStatus === 409) ok('the server refuses another turn on it (409)');
  else bad('the server refuses another turn on it', String(terminal.resumeStatus));
}

// and it left no journal entry
await page.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rows = await page.locator('a[href^="/app/journal/"]').count();
if (rows === 1) ok('the safety-stopped session left no journal entry');
else bad('the safety-stopped session left no journal entry', `${rows} rows`);

// ------------------------------------------------- 8. sign out
console.log('\n8. Sign out');
await page.goto(`${WEB}/app/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page
  .locator('button', { hasText: /^Sign out/ })
  .first()
  .click();
await page.waitForURL('**/welcome', { timeout: 15000 });
ok('sign out returns to welcome');
await page.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
if (page.url().includes('/welcome')) ok('the app is unreachable once signed out');
else bad('the app is unreachable once signed out', page.url());

await browser.close();
console.log(
  `\n${fails.length === 0 ? 'ALL PASSED' : `${fails.length} FAILED: ${fails.join('; ')}`}`,
);
process.exit(fails.length === 0 ? 0 : 1);
