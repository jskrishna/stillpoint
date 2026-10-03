import { createRequire } from 'node:module';

/**
 * The admin console, against a running API.
 *
 * Mostly a check on who may read what. A safety flag's excerpt is the user's
 * own words at the moment they said they were not safe, and this asserts that
 * an ordinary account cannot reach it through any of the console's screens —
 * not that it is merely hidden, but that the text is absent from the response.
 *
 * It needs an admin account, which cannot be made through the API on purpose
 * (`role` is not fillable, so no request can set it). Make one first:
 *
 *     cd apps/api && php artisan tinker --execute="
 *       \$u = App\Models\User::firstOrCreate(
 *         ['email' => 'admin@stillpoint.test'],
 *         ['name' => 'Admin', 'password' => 'correct-horse-battery-staple'],
 *       );
 *       \$u->role = App\Domain\Role::Admin;
 *       \$u->save();
 *     "
 *
 * Then `node e2e/admin.mjs`. ADMIN_EMAIL and ADMIN_PASSWORD override.
 */

const { chromium } = createRequire(import.meta.url)('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@stillpoint.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'correct-horse-battery-staple';
const PASSWORD = 'correct-horse-battery-staple';

/** Distinctive enough that finding it in a response is unambiguous. */
const FLAGGED = 'I feel like a burden to everyone and I cannot go on';

const fails = [];
const ok = (l) => console.log(`  ok   ${l}`);
const bad = (l, d) => {
  fails.push(l);
  console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`);
};

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });

// ---------------------------------------------------------------------------
console.log('\n1. An ordinary account, and what the console tells it');

const user = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await user.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await user.getByRole('button', { name: 'Create an account instead' }).click();
await user.getByLabel('Name').fill('Plain User');
await user.getByLabel('Email').fill(`plain+${String(Date.now())}@example.com`);
await user.getByLabel('Password').fill(PASSWORD);
await user.getByRole('button', { name: 'Create my account' }).click();
await user.waitForURL('**/welcome/consent', { timeout: 15000 });

const boxes = user.locator('input[type=checkbox]');
await boxes.nth(0).check();
await boxes.nth(1).check();
await user.getByRole('button', { name: /Continue|Saving/ }).click();
await user.waitForURL('**/welcome/voice', { timeout: 15000 });

// Say something the screen flags but does not stop on, so there is a fresh
// medium flag in the queue to review.
await user.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await user.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
await user.locator('textarea, input[type=text]').first().fill(FLAGGED);
await user
  .locator('button', { hasText: /^(Continue|Next)/ })
  .first()
  .click();
await user.waitForTimeout(1500);

const stillRunning = await user.locator('body').innerText();
if (/Step \d of 6/.test(stillRunning)) ok('a medium signal flags without stopping the session');
else bad('a medium signal flags without stopping the session', stillRunning.slice(0, 220));

for (const route of ['/admin', '/admin/safety']) {
  await user.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
  await user.waitForTimeout(1500);
  const text = await user.locator('body').innerText();
  if (/for (staff|reviewers)/i.test(text)) ok(`${route} refuses an ordinary account`);
  else bad(`${route} refuses an ordinary account`, text.slice(0, 220));
  if (!text.includes('burden')) ok(`${route} carries no excerpt for them`);
  else bad(`${route} carries no excerpt for them`);
}
await user.close();

// ---------------------------------------------------------------------------
console.log('\n2. The admin');

const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await admin.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await admin.getByLabel('Email').fill(ADMIN_EMAIL);
await admin.getByLabel('Password').fill(ADMIN_PASSWORD);
await admin.getByRole('button', { name: 'Sign in' }).click();
await admin.waitForTimeout(2500);

// Checked by the token, not the URL: sign-in sends an account with no session
// consent to the consent gate, and an admin who only uses the console has
// never given any. Consent gates starting a session, not reading the console.
const signedIn = await admin.evaluate(
  () => window.localStorage.getItem('stillpoint.token.v1') !== null,
);

if (!signedIn) {
  bad('the admin signs in', `no token, still on ${admin.url()} — is the admin account made?`);
} else {
  ok('the admin signs in');

  await admin.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const overview = await admin.locator('body').innerText();

  if (/Last \d+ days/.test(overview) && !overview.includes('Loading')) ok('the overview loads');
  else bad('the overview loads', overview.slice(0, 300));
  if (/open safety flags/.test(overview)) ok('the overview counts open flags');
  else bad('the overview counts open flags');
  if (/u_[0-9a-f]{4}/.test(overview)) ok('recent sessions carry an opaque handle');
  else bad('recent sessions carry an opaque handle', overview.slice(-300));
  if (!/@example\.com/.test(overview)) ok('the overview names nobody');
  else bad('the overview names nobody');
  if (!overview.includes('burden')) ok('the overview carries no session text');
  else bad('the overview carries no session text');

  await admin.goto(`${WEB}/admin/safety`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const queue = await admin.locator('body').innerText();

  if (/open · most severe first/.test(queue)) ok('the queue loads');
  else bad('the queue loads', queue.slice(0, 300));
  if (queue.includes('burden')) ok('a reviewer can read the excerpt');
  else bad('a reviewer can read the excerpt', queue.slice(0, 400));

  const levels = await admin.locator('tbody tr td:first-child').allInnerTexts();
  const rank = { High: 3, Medium: 2, Low: 1 };
  const sorted = levels.every((l, i) => i === 0 || (rank[levels[i - 1]] ?? 0) >= (rank[l] ?? 0));
  if (sorted) ok(`the queue is most severe first (${levels.join(', ')})`);
  else bad('the queue is most severe first', levels.join(', '));

  // Open this run's own flag and review it, rather than whatever happens to be
  // first: the queue may already hold flags from an earlier run.
  const openBefore = Number(/(\d+) open/.exec(queue)?.[1] ?? '0');
  const row = admin.locator('tbody tr', { hasText: 'burden' }).first();
  if ((await row.count()) === 0) {
    bad('this run’s flag is in the queue');
  } else {
    await row.locator('button').first().click();
    await admin.waitForTimeout(400);
    const detail = await admin.locator('body').innerText();
    if (detail.includes(FLAGGED.slice(0, 30))) ok('the detail pane shows the full excerpt');
    else bad('the detail pane shows the full excerpt', detail.slice(-300));

    await admin.getByRole('button', { name: 'Mark as reviewed' }).click();
    await admin.waitForTimeout(1200);
    await admin.reload({ waitUntil: 'networkidle' });
    await admin.waitForTimeout(1800);

    const after = await admin.locator('body').innerText();
    const openAfter = Number(/(\d+) open/.exec(after)?.[1] ?? '-1');
    // The count, not the absence of the text: every run of this script adds a
    // flag, so an earlier run's identical excerpt is legitimately still open.
    if (openAfter === openBefore - 1) ok(`the review persists (${openBefore} open → ${openAfter})`);
    else bad('the review persists', `${openBefore} open → ${openAfter}`);

    await admin.locator('button', { hasText: 'Include reviewed' }).click();
    await admin.waitForTimeout(1800);
    const all = await admin.locator('body').innerText();
    if (all.includes('burden') && /Reviewed/.test(all)) ok('it is still readable as reviewed');
    else bad('it is still readable as reviewed', all.slice(0, 300));
  }
  // -------------------------------------------------------------------------
  console.log('\n3. The step-prompt editor');

  await admin.goto(`${WEB}/admin/protocol`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const editor = await admin.locator('body').innerText();

  if (/Step prompts/.test(editor) && !editor.includes('Loading')) ok('the editor loads');
  else bad('the editor loads', editor.slice(0, 300));

  // Five of six steps have no copy, which is the honest state the PRD has not
  // filled yet — and it must block publishing.
  if (/problems? block/.test(editor)) ok('an incomplete protocol blocks publishing');
  else bad('an incomplete protocol blocks publishing', editor.slice(0, 400));
  if (/Step 1 has no main question/.test(editor)) bad('step 1’s question is reported missing');
  else ok('the step the designs specify is not reported missing');

  // An earlier run may have left a draft open, so this does not assume either
  // way: with none open the editor is read-only and offers to open one.
  const openDraft = admin.getByRole('button', { name: 'Edit as a new draft' });
  if ((await openDraft.count()) > 0) {
    const readOnly = await admin.locator('textarea').first().getAttribute('readonly');
    if (readOnly !== null) ok('with no draft open the editor is read-only');
    else bad('with no draft open the editor is read-only');
    await openDraft.click();
    await admin.waitForTimeout(1500);
    ok('a draft opens');
  } else {
    ok('a draft is already open from an earlier run');
  }

  // The server refuses regardless of the button, which is the check that
  // matters: a screen's own guard can always be skipped.
  const refusal = await admin.evaluate(async () => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const r = await fetch('http://localhost:8000/api/admin/protocol-versions/draft/publish', {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    return { status: r.status, body: await r.json() };
  });
  if (refusal.status === 422 && (refusal.body.problems ?? []).length > 0)
    ok(
      `the server refuses an incomplete draft (422, ${String(refusal.body.problems.length)} problems)`,
    );
  else bad('the server refuses an incomplete draft', JSON.stringify(refusal).slice(0, 220));

  // An edit is saved, and the step's problem clears once it is complete.
  const copy = `Which of these are you feeling? (${String(Date.now())})`;
  await admin.locator('button', { hasText: '3. Feel' }).click();
  await admin.waitForTimeout(300);
  await admin.locator('textarea').first().fill(copy);
  await admin.locator('input').first().fill('At least one feeling chosen');
  await admin.locator('input[type=number]').fill('3');
  await admin.waitForTimeout(1800);
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  await admin.locator('button', { hasText: '3. Feel' }).click();
  await admin.waitForTimeout(400);

  const saved = await admin.locator('textarea').first().inputValue();
  if (saved === copy) ok('a step edit survives a reload');
  else bad('a step edit survives a reload', saved);

  const after = await admin.locator('body').innerText();
  if (!/Step 3 has no main question/.test(after)) ok('the step’s problems clear once it is filled');
  else bad('the step’s problems clear once it is filled');
}
await admin.close();

await browser.close();
console.log(
  `\n${fails.length === 0 ? 'ALL PASSED' : `${String(fails.length)} FAILED: ${fails.join('; ')}`}`,
);
process.exit(fails.length === 0 ? 0 : 1);
