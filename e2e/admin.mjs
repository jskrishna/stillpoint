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

const { ok, bad, finish, watchForThrows } = reporter('the admin console');
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
  if (/u_[0-9a-f]{12}\b/.test(overview)) ok('recent sessions carry an opaque handle');
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

  // By its label, not "the select in this row": the row carries two now, one
  // for the role and one for the plan, and `locator('select')` matched both.
  await found.locator('select[aria-label^="Role for"]').selectOption('coach');

  const mail = promoted;

  // Two assertions rather than one, because they fail for different reasons
  // and which one failed is the whole diagnosis. The server's record says
  // whether the change was made; the screen says whether the trail can be
  // read. One check on the page could not tell those apart: when
  // `GET /admin/role-changes` failed, the screen printed "No role has been
  // changed yet." and this read it as the change never happening, which cost
  // two CI runs to work out.
  //
  // And it matched "User → Coach" anywhere on the page, so a change from an
  // earlier run of this script left that text in the trail and the check
  // passed with this run's change never recorded. Measured: 1 of 10 rounds.
  // Both halves are scoped to this run's own account now.
  const readTrail = () =>
    admin.evaluate(
      async ([api, mail]) => {
        const token = window.localStorage.getItem('stillpoint.token.v1');
        const r = await fetch(`${api}/admin/role-changes?limit=50`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return { status: r.status, count: 0, change: null };
        const page = await r.json();
        const mine = (page.items ?? []).filter((c) => c.userEmail === mail);
        return { status: r.status, count: mine.length, change: mine[0] ?? null };
      },
      [API, mail],
    );

  // Polled, because `selectOption` returns when the option is selected and the
  // PATCH is still in flight: reading the server once, immediately, would
  // assert that a request which had not finished had not happened.
  let inTrail = { status: 0, count: 0, change: null };
  for (let i = 0; i < 30; i++) {
    inTrail = await readTrail();
    if (inTrail.count > 0) break;
    await admin.waitForTimeout(500);
  }

  const change = inTrail.change;
  if (inTrail.count === 1 && change.fromRole === 'user' && change.toRole === 'coach')
    ok('the server recorded the change');
  else bad('the server recorded the change', JSON.stringify(inTrail));

  if (inTrail.count === 1 && change.changedByEmail === ACCOUNTS.admin) ok('and who made it');
  else bad('and who made it', JSON.stringify(change?.changedByEmail));

  // The trail row for *this* account, not the arrow anywhere on the page.
  const recorded = await admin
    .waitForFunction(
      (mail) =>
        [...document.querySelectorAll('tbody tr')].some(
          (r) => r.innerText.includes(mail) && r.innerText.includes('User → Coach'),
        ),
      promoted,
      { timeout: 15000 },
    )
    .then(
      () => true,
      () => false,
    );

  if (recorded) ok('the screen shows it in the trail');
  else
    bad('the screen shows it in the trail', (await admin.locator('body').innerText()).slice(-400));

  // The plan, which until this control existed nothing in the product could
  // set: registration does not accept one, the profile update whitelists three
  // unrelated fields, and this screen changed the role. So every account was
  // Free for ever, and the prices on the marketing site were for plans nobody
  // could be on. It is a grant and not a purchase — there is no billing here.
  await found.locator('select[aria-label^="Plan for"]').selectOption('plus');

  const planned = await (async () => {
    for (let i = 0; i < 30; i++) {
      const read = await admin.evaluate(
        async ([api, address]) => {
          const token = window.localStorage.getItem('stillpoint.token.v1');
          const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
          const users = await fetch(`${api}/admin/users?q=${encodeURIComponent(address)}`, {
            headers,
          }).then((r) => r.json());
          const trail = await fetch(`${api}/admin/plan-changes?limit=50`, { headers }).then((r) =>
            r.json(),
          );
          const mine = (trail.items ?? []).filter((c) => c.userEmail === address);
          return { plan: users.items?.[0]?.plan ?? null, change: mine[0] ?? null };
        },
        [API, mail],
      );
      if (read.plan === 'plus' && read.change !== null) return read;
      await admin.waitForTimeout(500);
    }
    return { plan: null, change: null };
  })();

  if (planned.plan === 'plus') ok('an admin can grant a paid plan');
  else bad('an admin can grant a paid plan', JSON.stringify(planned));

  if (
    planned.change !== null &&
    planned.change.fromPlan === 'free' &&
    planned.change.toPlan === 'plus' &&
    planned.change.changedByEmail === ACCOUNTS.admin
  )
    ok('and the grant is recorded, with who made it');
  else bad('and the grant is recorded, with who made it', JSON.stringify(planned.change));

  const planShown = await admin
    .waitForFunction(
      (address) =>
        [...document.querySelectorAll('tbody tr')].some(
          (r) => r.innerText.includes(address) && r.innerText.includes('Free → Plus'),
        ),
      mail,
      { timeout: 15000 },
    )
    .then(
      () => true,
      () => false,
    );

  if (planShown) ok('and the screen shows it in the plan trail');
  else
    bad(
      'and the screen shows it in the plan trail',
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
      const ownPlan = await fetch(`${api}/admin/users/${String(me.id)}/plan`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ plan: 'plus' }),
      });
      const stillAdmin = await fetch(`${api}/me`, { headers }).then((r) => r.json());
      return {
        own: own.status,
        ownPlan: ownPlan.status,
        role: stillAdmin.role,
        plan: stillAdmin.plan,
      };
    },
    [API],
  );

  if (refusals.own === 403) ok('the server refuses an admin changing their own role (403)');
  else bad('the server refuses an admin changing their own role', String(refusals.own));
  if (refusals.role === 'admin') ok('and they are still an admin');
  else bad('and they are still an admin', String(refusals.role));

  // Same argument, one step down: an unlimited allowance one person can give
  // themselves is a benefit nobody else agreed to.
  if (refusals.ownPlan === 403) ok('the server refuses an admin granting their own plan (403)');
  else bad('the server refuses an admin granting their own plan', String(refusals.ownPlan));
  if (refusals.plan === 'free') ok('and they are still on Free');
  else bad('and they are still on Free', String(refusals.plan));

  // A trail that could not be read must not read as a trail with nothing in
  // it. The screen swallowed the failure and printed "No role has been changed
  // yet." over a trail that may hold every escalation in the product — on the
  // one screen where anybody would look for them, and where the answer being
  // wrong says nobody has been granted the safety queue. It is the same shape
  // as the risk screen reporting `none` for text it could not read, and it was
  // found the same way: by a check believing it.
  await admin.route('**/admin/role-changes*', (route) => route.abort());
  await admin.reload({ waitUntil: 'domcontentloaded' });

  // Waits for the screen to have been told, not for the screen to exist. The
  // first render legitimately has an empty trail and no failure yet — the
  // request is still in flight — so reading the page as soon as the heading
  // appears reads the state before the answer, and that is this check's own
  // bug rather than the product's. It cost one run to learn, twice.
  const saidSo = await admin
    .waitForFunction(
      () => document.body.innerText.includes('Could not read the role trail'),
      null,
      { timeout: 15000 },
    )
    .then(
      () => true,
      () => false,
    );
  const blind = await admin.locator('body').innerText();
  await admin.unroute('**/admin/role-changes*');

  if (saidSo) ok('an unreadable trail says so');
  else bad('an unreadable trail says so', blind.slice(-400));
  if (!blind.includes('No role has been changed yet')) ok('and is not reported as an empty one');
  else bad('and is not reported as an empty one', 'the screen said the trail is empty');

  // -------------------------------------------------------------------------
  console.log('\n4. The step-prompt editor');

  await admin.goto(`${WEB}/admin/protocol`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const editor = await admin.locator('body').innerText();

  if (/Step prompts/.test(editor) && !editor.includes('Loading')) ok('the editor loads');
  else bad('the editor loads', editor.slice(0, 300));

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

  // This section used to lean on the seeded protocol being incomplete, which
  // was true only while the step copy was missing. `DemoSeeder` publishes a
  // complete draft now, so the draft this opens inherits that copy and there
  // was nothing left to refuse — the check passed for a reason that then went
  // away, and CI went red rather than the check going quiet, which is the
  // better of the two failures but still a check that was testing the fixture.
  //
  // So it makes its own incomplete state: blank one step's question, assert
  // that both the screen and the server refuse, and then the section below
  // fills it back in and watches the problem clear.
  const blanked = await admin.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const r = await fetch(`${api}/admin/protocol-versions/draft/steps/feel`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ main: null }),
    });
    return r.status;
  }, API);
  if (blanked === 200) ok('step 3’s question can be cleared, to have something to refuse');
  else bad('step 3’s question can be cleared', String(blanked));

  await admin.reload({ waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);
  const incomplete = await admin.locator('body').innerText();

  if (/problems? block/.test(incomplete)) ok('an incomplete protocol blocks publishing');
  else bad('an incomplete protocol blocks publishing', incomplete.slice(0, 400));
  if (/Step 3 has no main question/.test(incomplete)) ok('and it names the step at fault');
  else bad('and it names the step at fault', incomplete.slice(0, 400));
  if (/Step 1 has no main question/.test(incomplete)) bad('step 1’s question is reported missing');
  else ok('the step the designs specify is not reported missing');

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

await finish(() => browser.close());
