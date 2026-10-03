import { ACCOUNTS, API, PASSWORD, WEB, launch } from './browser.mjs';
import { reporter } from './report.mjs';

/**
 * The admin console, against a running API.
 *
 * Mostly a check on who may read what. A safety flag's excerpt is the user's
 * own words at the moment they said they were not safe, and this asserts that
 * an ordinary account cannot reach it through any of the console's screens —
 * not that it is merely hidden, but that the text is absent from the response.
 *
 * It needs an admin account, which cannot be made through the API on purpose
 * (`role` is not fillable, so no request can set it). `DemoSeeder` makes one:
 *
 *     cd apps/api && php artisan db:seed --class=DemoSeeder
 *
 * Then `node e2e/admin.mjs`. `ADMIN_EMAIL` and `SEED_PASSWORD` override; see
 * `e2e/browser.mjs`.
 */

/** Distinctive enough that finding it in a response is unambiguous. */
const FLAGGED = 'I feel like a burden to everyone and I cannot go on';

const { ok, bad, fails, watchForThrows } = reporter('the admin console');
watchForThrows();

const browser = await launch();

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
await admin.getByLabel('Email').fill(ACCOUNTS.admin);
await admin.getByLabel('Password').fill(PASSWORD);
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
  // The count alone reads as a manageable afternoon until you learn the oldest
  // has been waiting six days. One of the two sentences is always there.
  if (
    /longest-waiting open flag was raised .+ ago|Nothing is waiting in the safety queue/.test(
      overview,
    )
  )
    ok('the overview says how long the queue has been waiting');
  else bad('the overview says how long the queue has been waiting', overview.slice(0, 500));
  if (/WHAT THE SCREEN COULD NOT READ/.test(overview))
    ok('the overview admits what the screen cannot read');
  else bad('the overview admits what the screen cannot read', overview.slice(0, 500));
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

  // The age of a flag, which the queue did not show at all. After its
  // severity it is what a reviewer needs most: a `high` raised four days ago
  // is not the same situation as the same flag raised this morning.
  const ages = await admin.locator('tbody tr td:nth-child(4)').allInnerTexts();
  if (ages.length > 0 && ages.every((a) => /^(now|\d+[mhd])$/.test(a.trim())))
    ok(`every row says how long it has been waiting (${ages.slice(0, 4).join(', ')})`);
  else bad('every row says how long it has been waiting', ages.join(', '));

  const levels = await admin.locator('tbody tr td:first-child').allInnerTexts();
  const rank = { High: 3, Medium: 2, Low: 1 };
  const sorted = levels.every((l, i) => i === 0 || (rank[levels[i - 1]] ?? 0) >= (rank[l] ?? 0));
  // Summarised rather than listed: a full page of levels is 50 words of log.
  const counted = Object.entries(
    levels.reduce((acc, l) => ({ ...acc, [l]: (acc[l] ?? 0) + 1 }), {}),
  )
    .map(([l, n]) => `${String(n)} ${l}`)
    .join(', ');
  if (sorted) ok(`the queue is most severe first (${counted})`);
  else bad('the queue is most severe first', levels.join(', '));

  // The queue pages rather than truncating. It was capped at 200 rows with no
  // way to reach the rest, which is the worse of the two failures available:
  // the flags it stopped showing would be the ones nobody had looked at.
  const paging = await admin.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const first = await fetch(`${api}/admin/safety-flags?limit=2`, { headers }).then((r) =>
      r.json(),
    );
    if (first.nextCursor === null) return { total: first.total, pages: 1, overlap: 0 };
    const second = await fetch(
      `${api}/admin/safety-flags?limit=2&cursor=${String(first.nextCursor)}`,
      { headers },
    ).then((r) => r.json());
    return {
      total: first.total,
      pages: 2,
      overlap: first.items.filter((a) => second.items.some((b) => b.id === a.id)).length,
    };
  }, API);

  if (paging.total >= 1) ok(`the queue reports its whole size (${String(paging.total)})`);
  else bad('the queue reports its whole size', JSON.stringify(paging));
  if (paging.pages === 1 || paging.overlap === 0) ok('two pages of the queue share no flag');
  else bad('two pages of the queue share no flag', `${String(paging.overlap)} shared`);

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
  console.log('\n3. Accounts, and who may change a role');

  await admin.goto(`${WEB}/admin/users`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const accounts = await admin.locator('body').innerText();

  if (/\d+ accounts? ·/.test(accounts)) ok('the accounts screen loads');
  else bad('the accounts screen loads', accounts.slice(0, 300));

  // Searched for, not assumed to be on screen. This used to read the whole
  // page, which worked until the database had more accounts than one page
  // holds — every run of this script adds one — and the admin's own row, which
  // sorts by name, fell off the first page. The assertion then failed for a
  // reason that had nothing to do with the rule it is about.
  await admin.getByLabel('Search accounts').fill(ACCOUNTS.admin);
  await admin.waitForTimeout(1500);
  const ownRow = admin.locator('tbody tr', { hasText: ACCOUNTS.admin }).first();
  if (
    (await ownRow.count()) === 1 &&
    /ask another admin to change yours/.test(await ownRow.innerText())
  )
    ok('an admin is not offered a change to their own role');
  else
    bad(
      'an admin is not offered a change to their own role',
      (await admin.locator('body').innerText()).slice(0, 400),
    );

  // Make a fresh account, find it, and make it a coach.
  const promoted = `promote+${String(Date.now())}@example.com`;
  const madeIt = await admin.evaluate(
    async ([api, email, password]) => {
      const r = await fetch(`${api}/auth/register`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To Promote', email, password }),
      });
      return r.ok;
    },
    [API, promoted, PASSWORD],
  );
  if (!madeIt) bad('an account to promote could be made');

  await admin.getByLabel('Search accounts').fill(promoted);
  await admin.waitForTimeout(1500);
  const found = admin.locator('tbody tr', { hasText: promoted }).first();
  if ((await found.count()) === 1) ok('searching finds the one account');
  else bad('searching finds the one account', String(await found.count()));

  // No session content on an administration screen.
  if (!/dismissed my work|not good enough|burden/i.test(await admin.locator('body').innerText()))
    ok('the accounts screen carries no session text');
  else bad('the accounts screen carries no session text');

  await found.locator('select').selectOption('coach');
  await admin.waitForTimeout(1800);
  if ((await admin.locator('body').innerText()).includes('User → Coach'))
    ok('the change is recorded in the trail, with who made it');
  else
    bad(
      'the change is recorded in the trail',
      (await admin.locator('body').innerText()).slice(-400),
    );

  // The server refuses the two changes that should not be easy, whether or not
  // a screen offers them.
  const refusals = await admin.evaluate(
    async ([api]) => {
      const token = window.localStorage.getItem('stillpoint.token.v1');
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const me = await fetch(`${api}/me`, { headers }).then((r) => r.json());
      const own = await fetch(`${api}/admin/users/${String(me.id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'user' }),
      });
      const stillAdmin = await fetch(`${api}/me`, { headers }).then((r) => r.json());
      return { own: own.status, role: stillAdmin.role };
    },
    [API],
  );

  if (refusals.own === 403) ok('the server refuses an admin changing their own role (403)');
  else bad('the server refuses an admin changing their own role', String(refusals.own));
  if (refusals.role === 'admin') ok('and they are still an admin');
  else bad('and they are still an admin', String(refusals.role));

  // -------------------------------------------------------------------------
  console.log('\n4. The step-prompt editor');

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
  const refusal = await admin.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const r = await fetch(`${api}/admin/protocol-versions/draft/publish`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    return { status: r.status, body: await r.json() };
  }, API);
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
