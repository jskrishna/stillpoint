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
// Emoji-led on purpose, and the emoji are the assertion rather than
// decoration. The queue's row preview cut the excerpt with `slice`, which
// counts UTF-16 code units, so an excerpt whose 48th unit fell inside a
// surrogate pair ended in half a character — measured on this screen as
// `…\ud83d…`, which a browser draws as a replacement glyph. Twenty-four of
// them puts the cut inside the 24th pair.
//
// The screen still grades it `medium` and still reports `unreadable: false`:
// `normalise()` drops anything outside Latin and Devanagari, so the emoji are
// deleted before matching and the phrase that follows is what it reads.
// Checked against the screen itself rather than assumed.
const CRYING = '\u{1F622}';
//
// The single `I` before the emoji run is load-bearing: it makes the 48th code
// unit fall *inside* the 24th surrogate pair. Written without it — an even
// number of units before the run — `slice(0, 48)` cuts cleanly between two
// emoji, and the three assertions about a broken character pass against the
// bug. Checked: they did, and only the fourth went red. A fixture that does
// not reproduce the hazard is not a fixture.
const FLAGGED = `I${CRYING.repeat(24)} feel like a burden to everyone and I cannot go on`;
// An ASCII slice of it, for the places a check needs a substring: slicing the
// utterance itself is the bug this section is about, in the check.
const FLAGGED_WORDS = 'feel like a burden to everyone';

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

  // The kind each session was, in the product's own word. The row read
  // "Deep · 1 min" for a `full` session — a word that appears nowhere else
  // here, while the API's enum is `full`, the pricing page sells "3 full
  // sessions a week" and the session screen refuses with "That is this week's
  // full sessions". An admin reading this screen to answer a question about
  // somebody's allowance had a fifth word for it.
  //
  // Asserted on the word rather than only on its absence: a row has to name a
  // kind, so a missing label and a wrong one must both be red.
  if (/\bFull · \d+ min/.test(overview) || /\bQuick · \d+ min/.test(overview))
    ok('recent sessions name their kind in the product’s own word');
  else bad('recent sessions name their kind in the product’s own word', overview.slice(-400));
  if (!/\bDeep\b/.test(overview)) ok('and not a word the rest of the product never uses');
  else bad('and not a word the rest of the product never uses', overview.slice(-400));

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
  // Keyed on the emoji rather than on a word, because a word is what the bug
  // below removed: with the excerpt cut at 48 code units the preview held
  // twenty-four emoji and half a character and no readable text at all, so a
  // locator looking for "burden" stopped resolving and the section failed on
  // the wrong line. The emoji are in the preview either way.
  const row = admin.locator('tbody tr', { hasText: CRYING }).first();
  if ((await row.count()) === 0) {
    bad('this run’s flag is in the queue');
  } else {
    await row.locator('button').first().click();
    await admin.waitForTimeout(400);
    const detail = await admin.locator('body').innerText();
    if (detail.includes(FLAGGED_WORDS)) ok('the detail pane shows the full excerpt');
    else bad('the detail pane shows the full excerpt', detail.slice(-300));

    // And the row's preview, cut to characters rather than code units. A lone
    // surrogate is what `slice` left behind, and `innerText` hands it over
    // unpaired, so the measurement is to iterate by code point: the string
    // iterator yields an unpaired surrogate as a one-unit string, where a
    // valid pair comes back as two units. A replacement glyph is checked
    // beside it, since that is what the reviewer actually sees.
    //
    // Written first as "strip the valid pairs, then look for a leftover" with
    // a `/gu` regex, which **cannot work**: in unicode mode a character class
    // will not match half a code point, so the replace matched nothing and
    // every preview read as broken. It failed loudly against the fix rather
    // than passing against the bug, which is the better of the two ways for a
    // check to be wrong.
    const preview = await row.innerText();
    const orphaned = Array.from(preview).some(
      (ch) => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff,
    );
    if (!orphaned) ok('the row preview cuts the excerpt on a whole character');
    else bad('the row preview cuts the excerpt on a whole character', JSON.stringify(preview));
    // There is deliberately no check for U+FFFD beside that one. The
    // replacement glyph is how Chromium *draws* a lone surrogate; `innerText`
    // hands the unpaired unit over as it is, so a glyph assertion stays green
    // against the bug — written and measured, it did. The surrogate is the
    // measurement and the glyph would have been a check that cannot fail.
    //
    // This next one is a control rather than a finding: a cut that returned
    // nothing at all would pass the assertion above and show a reviewer no
    // excerpt, so it stays green against the bug on purpose.
    if (preview.includes(CRYING)) ok('and still previews what was said');
    else bad('and still previews what was said', JSON.stringify(preview));
    // The other symptom of the same bug, and the one a reviewer would notice:
    // 48 code units is twenty-four emoji, so the preview held no words. 48
    // characters reaches the sentence.
    if (/burden/.test(preview)) ok('and reaches the words, not only the emoji');
    else bad('and reaches the words, not only the emoji', JSON.stringify(preview));

    // Focus, which the press used to take away: `disabled` leaves the tab
    // order, so `document.activeElement` became `<body>` the moment the
    // review landed and a reviewer using a screen reader was told nothing.
    // `aria-disabled` keeps the button where it is and its own name becomes
    // the announcement. Asserted rather than hoped for, because nothing about
    // the rendered page shows it.
    //
    // Three clicks, on a handle held across them, for the reason the publish
    // block below has in full: the label becomes "Marking…" in flight, so a
    // role+name locator stops resolving and a second click would never be
    // sent. Re-marking a reviewed flag is harmless in itself; the request
    // nobody wanted is the thing, and the same shape on Publish is not
    // harmless.
    const reviewRequests = [];
    const countReviews = (request) => {
      if (/\/admin\/safety-flags\/[^/]+\/review$/.test(request.url()))
        reviewRequests.push(request.url());
    };
    admin.on('request', countReviews);

    const reviewButton = await admin
      .getByRole('button', { name: 'Mark as reviewed' })
      .elementHandle();
    await reviewButton.focus();
    await reviewButton.click();
    await reviewButton.click({ force: true });
    await reviewButton.click({ force: true });
    await admin.waitForTimeout(1200);
    admin.off('request', countReviews);

    if (reviewRequests.length === 1) ok('a double-tapped review sends one request');
    else bad('a double-tapped review sends one request', `sent ${String(reviewRequests.length)}`);

    const stayed = await admin.evaluate(() => {
      const a = document.activeElement;
      return a === null || a === document.body
        ? '<body>'
        : `${a.tagName.toLowerCase()} "${(a.textContent ?? '').trim()}"`;
    });
    if (stayed === 'button "Reviewed"')
      ok('reviewing keeps focus on the button, whose name becomes the news');
    else bad('reviewing keeps focus on the button', `focus is ${stayed}`);

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

    // ---- a slow answer to an abandoned filter must not be believed --------
    //
    // Nothing orders two answers, so the request for `all` can come back after
    // the request for `open` that replaced it, and the last `setState` wins.
    // Measured before the guard: the filter button read "Include reviewed" —
    // so the screen was showing open work only — the count line read
    // `2 open · most severe first`, and one of the two rows was marked
    // Reviewed. A reviewer deciding what still needs following up was shown
    // finished work, counted as open, in the flattering direction.
    //
    // Held here rather than hoped for: the `all` request is delayed 2.5s and
    // the `open` request that follows is not, so the arrival order is the
    // wrong one every run.
    await admin.locator('button', { hasText: 'Open only' }).click();
    await admin.waitForTimeout(1800);

    // Keyed on the **API's** URL, not `**/admin/safety-flags*`. A bare glob
    // also matches this app's own `/admin/safety` page and the `_rsc`
    // requests Next.js makes for it, so the handler was delaying navigations
    // by 2.5s — and a page request still intercepted when the handler is
    // removed is left unhandled, which the browser reports as a bare
    // "Failed to fetch". That is what took this script out in CI, several
    // sections after the block that installed it.
    await admin.route(`${API}/admin/safety-flags*`, async (route) => {
      if (new URL(route.request().url()).search.includes('status=all'))
        await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await admin.locator('button', { hasText: 'Include reviewed' }).click();
    await admin.waitForTimeout(200);
    await admin.locator('button', { hasText: 'Open only' }).click();
    await admin.waitForTimeout(4000);
    await admin.unroute(`${API}/admin/safety-flags*`);

    const offering = await admin
      .locator('button', { hasText: /Include reviewed|Open only/ })
      .innerText();
    const shown = await admin.locator('tbody tr').allInnerTexts();
    const reviewedRows = shown.filter((r) => /Reviewed/.test(r)).length;
    if (offering === 'Include reviewed' && reviewedRows === 0)
      ok(
        `a late answer for the other filter is not believed (${String(shown.length)} open, 0 reviewed)`,
      );
    else
      bad(
        'a late answer for the other filter is not believed',
        `button "${offering}", ${String(reviewedRows)} of ${String(shown.length)} rows reviewed`,
      );
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

  // The same race on the screen where `admin` is granted. Measured before the
  // guard: the box held `zzzz-nobody` and the screen listed `11 accounts ·
  // 1 admin`, every row of it — every account in the product, under a search
  // that matches none of them. The earlier query's answer is held back so it
  // lands second, which is the order a slow network produces by itself.
  // The API's URL, for the reason above: `**/admin/users*` also matches the
  // page this check is standing on.
  await admin.route(`${API}/admin/users*`, async (route) => {
    if (!new URL(route.request().url()).search.includes('q=zzzz-nobody'))
      await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await admin.getByLabel('Search accounts').fill('promote+');
  await admin.waitForTimeout(600); // long enough for the debounce to fire it
  await admin.getByLabel('Search accounts').fill('zzzz-nobody');
  await admin.waitForTimeout(4000);
  await admin.unroute(`${API}/admin/users*`);

  const searched = await admin.locator('body').innerText();
  const countLine = /\d+ accounts? · \d+ admins?/.exec(searched)?.[0] ?? 'no count line';
  if (/No account matches that\./.test(searched) && !searched.includes(promoted))
    ok('a late answer for an abandoned search is not believed');
  else
    bad(
      'a late answer for an abandoned search is not believed',
      `box holds "zzzz-nobody", screen says "${countLine}", the abandoned query’s row ${
        searched.includes(promoted) ? 'is' : 'is not'
      } listed`,
    );

  // Put the screen back where the rest of this section expects it.
  await admin.getByLabel('Search accounts').fill(promoted);
  await admin.waitForTimeout(1500);

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
    let why;
    for (let i = 0; i < 30; i++) {
      // Caught, because an uncaught `page.evaluate` ends the script: a browser
      // `fetch` that fails at the network level reports a bare "Failed to
      // fetch" with no status, and this loop used to turn that into an
      // uncaught throw that skipped sections 4 to 6 entirely. A named failure
      // after thirty tries says what did not happen; a stack trace from
      // inside an eval says where the script stopped.
      const read = await admin
        .evaluate(
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
        )
        .catch((e) => ({ plan: null, change: null, why: String(e).slice(0, 140) }));
      if (read.plan === 'plus' && read.change !== null) return read;
      why = read.why ?? why;
      await admin.waitForTimeout(500);
    }
    // The last reason the read failed, if it ever did, rather than a bare null
    // pair: "Failed to fetch" and "the grant never landed" need different
    // next steps.
    return { plan: null, change: null, ...(why === undefined ? {} : { why }) };
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
  await admin.route(`${API}/admin/role-changes*`, (route) => route.abort());
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
  await admin.unroute(`${API}/admin/role-changes*`);

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

  /*
   * Which of the six steps is open, said rather than only drawn.
   *
   * Measured in the accessibility tree: six buttons with no `pressed`,
   * `checked`, `selected` or `current` on any of them, so an admin editing the
   * product's voice with a screen reader could not tell which step they were
   * in. `aria-current`, not `aria-pressed` — these are not toggles, they
   * select one of a set, which is what `AdminNav` and `BottomNav` already say.
   *
   * Asserted on the **DOM attribute** and not through the accessibility tree,
   * because Chromium's `Accessibility.getFullAXTree` does not report
   * `aria-current` at all. Measured: it is absent from the property dump for
   * these buttons *and* for the console's own nav link, which has carried
   * `aria-current="page"` since it was written. So an AX-tree check here could
   * not tell the fix from the bug, and the attribute is what the browser hands
   * its accessibility layer — the same reason `mobile.mjs` reads
   * `autoComplete` off the DOM.
   *
   * Both halves: exactly one tab carries it, and it follows the selection. One
   * alone would pass against a version marking every tab current.
   */
  const currentTabs = () =>
    admin.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => /^\d\. \w/.test((b.textContent ?? '').trim()))
        .map(
          (b) =>
            `${(b.textContent ?? '').trim().split(/\s+/).slice(0, 2).join(' ')}=${b.getAttribute('aria-current') ?? 'absent'}`,
        ),
    );

  const tabsAtFirst = await currentTabs();
  await admin.getByRole('button', { name: /^4\. Remember/ }).click();
  await admin.waitForTimeout(500);
  const tabsAtFourth = await currentTabs();

  const marked = (rows) => rows.filter((r) => r.endsWith('=true'));
  if (
    tabsAtFirst.length === 6 &&
    marked(tabsAtFirst).length === 1 &&
    marked(tabsAtFirst)[0]?.startsWith('1.') === true &&
    marked(tabsAtFourth).length === 1 &&
    marked(tabsAtFourth)[0]?.startsWith('4.') === true
  )
    ok('the editor says which step is open, and only that one');
  else
    bad(
      'the editor says which step is open, and only that one',
      `first: ${tabsAtFirst.join(' ')} / fourth: ${tabsAtFourth.join(' ')}`,
    );

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

  // ---- publishing, which nothing here used to assert at all --------------
  //
  // The rest of this section asserts the 422 for an incomplete draft and
  // stopped there, so a successful publish — the one action on this screen
  // that changes what the guide says to everybody — was never exercised end
  // to end.
  //
  // It happens **first**, before the checks below edit any copy, and that
  // ordering is the point: those edits carry a timestamp so a reload can be
  // seen to have round-tripped, and publishing afterwards would promote
  // "Which of these are you feeling? (1791…)" to the live version every other
  // check then reads. Here the draft is the live copy with nothing changed in
  // it, so publishing it is a no-op in content and still a real publish.
  //
  // Two things, and the second cannot be seen on the rendered page: that the
  // version line is a live region, so the new live version is announced, and
  // that the Publish button still holds focus afterwards. It used to be
  // `disabled`, which leaves the tab order — measured,
  // `document.activeElement` became `<body>` the moment the publish
  // succeeded, on the most consequential button in the console.
  //
  // `count()` first on the region: with none there is nothing to read, and a
  // throw out of `innerText` is a red run naming a timeout rather than the
  // thing that broke.
  const liveLine = admin.locator('p[role="status"]').first();
  const beforePublish =
    (await liveLine.count()) > 0 ? await liveLine.innerText() : '(no live region)';
  //
  // Three clicks rather than one, on a handle held across them, because a
  // double-tap on this button used to publish once and then tell the admin
  // "There is no draft to publish." — measured, 3 POSTs answering
  // [200, 422, 422], with the 422's wording on the screen after a publish
  // that had worked and advanced the live version. The server's id-ordered
  // lock on `protocol_versions` means two live versions were never possible;
  // what was possible was a refusal shown for the thing that succeeded. The
  // handle matters: the label becomes "Publishing…" while the request is in
  // flight, so a role+name locator stops resolving after the first click and
  // would pass without ever sending a second.
  const publishRequests = [];
  const countPublish = (request) => {
    if (request.url().endsWith('/admin/protocol-versions/draft/publish'))
      publishRequests.push(request.url());
  };
  admin.on('request', countPublish);

  const publish = await admin.getByRole('button', { name: 'Publish' }).elementHandle();
  await publish.focus();
  await publish.click();
  await publish.click({ force: true });
  await publish.click({ force: true });
  await admin.waitForTimeout(2500);
  admin.off('request', countPublish);

  if (publishRequests.length === 1) ok('a double-tapped publish sends one request');
  else bad('a double-tapped publish sends one request', `sent ${String(publishRequests.length)}`);

  const announced = (await liveLine.count()) > 0 ? await liveLine.innerText() : '(no live region)';
  const held = await admin.evaluate(() => {
    const a = document.activeElement;
    return a === null || a === document.body
      ? '<body>'
      : `${a.tagName.toLowerCase()} "${(a.textContent ?? '').trim()}"`;
  });

  if (/^Live version /.test(announced) && announced !== beforePublish)
    ok(`publishing announces the new live version (${announced})`);
  else bad('publishing announces the new live version', `"${beforePublish}" → "${announced}"`);
  if (held === 'button "Publish"') ok('and the button it was pressed on keeps focus');
  else bad('and the button it was pressed on keeps focus', `focus is ${held}`);
  if (!/not published/.test(await admin.locator('body').innerText())) ok('and the draft is gone');
  else bad('and the draft is gone');

  // And the screen does not end up contradicting what just happened. This is
  // the half the request count cannot see: a second request is a wasted round
  // trip, a 422 rendered over a successful publish is a false sentence about
  // state, which is the class `CLAUDE.md` names.
  const afterPublish = await admin.locator('body').innerText();
  if (!/no draft to publish/i.test(afterPublish))
    ok('and it is not told there was no draft to publish');
  else bad('and it is not told there was no draft to publish');

  // A fresh draft for the refusal checks below, since publishing closed the
  // one they were going to use.
  await admin.getByRole('button', { name: 'Edit as a new draft' }).click();
  await admin.waitForTimeout(1500);

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

  // And a refusal says what the server said.
  //
  // `main` is capped at 500 characters, and this screen used to answer every
  // failed save with "Could not save that edit. Check your connection." — told
  // to an admin writing the step copy that `LAUNCH.md` item 4 asks them to
  // write the hour a deployment is up, about a request that arrived perfectly
  // well. They would lose the edit and have nothing to try. Measured against
  // the running API: it answers "The main field must not be greater than 500
  // characters.", which is the sentence that helps.
  await admin.locator('textarea').first().fill('x'.repeat(600));
  const refused = await admin
    .waitForFunction(() => /must not be greater than 500/.test(document.body.innerText), null, {
      timeout: 15000,
    })
    .then(
      () => true,
      () => false,
    );
  const shown = await admin.locator('body').innerText();
  if (refused) ok('an over-long step prompt is refused in the server’s own words');
  else bad('an over-long step prompt is refused in the server’s own words', shown.slice(0, 400));
  if (!/Could not save that edit/.test(shown)) ok('and not blamed on the connection');
  else bad('and not blamed on the connection', shown.slice(0, 400));

  // Put the step back, so the draft is publishable again.
  await admin.locator('textarea').first().fill(copy);
  await admin.waitForTimeout(1800);

  // ---- the safety pause's own words --------------------------------------
  //
  // This screen had no field for them. The route
  // (`PATCH /admin/protocol-versions/draft/safety`), its validation, a feature
  // test, `api.editProtocolSafety()` and `ApiProtocolVersion.pauseTitle` all
  // existed — and `editProtocolSafety` was a method **nothing called**, so the
  // one piece of copy on the crisis screen that an admin is meant to own could
  // only be changed with a hand-written PATCH. `publishProblems()` refuses a
  // draft whose title or body is empty, so this screen could already report a
  // problem with that copy and gave no way to fix it.
  const pauseTitle = admin.getByLabel('Title', { exact: true });
  if ((await pauseTitle.count()) === 1) ok('the safety pause’s wording is on the screen');
  else
    bad(
      'the safety pause’s wording is on the screen',
      `${String(await pauseTitle.count())} fields`,
    );

  const wording = `Let’s pause here. (${String(Date.now())})`;
  await pauseTitle.fill(wording);
  await admin.waitForTimeout(1800);
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);

  const keptWording = await admin.getByLabel('Title', { exact: true }).inputValue();
  if (keptWording === wording) ok('and an edit to it survives a reload');
  else bad('and an edit to it survives a reload', keptWording);

  // Emptied, it is refused — by the server, in the server's own words. The
  // field is `sometimes|filled`, so this is the one field on the screen where
  // clearing it is not a saveable state, and an admin who clears it should be
  // told rather than left thinking it saved. Nothing is hidden to prevent it.
  await admin.getByLabel('Title', { exact: true }).fill('');
  const emptyRefused = await admin
    .waitForFunction(
      () => /pause title field must have a value/i.test(document.body.innerText),
      null,
      {
        timeout: 15000,
      },
    )
    .then(
      () => true,
      () => false,
    );
  const saidOnEmpty = await admin.locator('body').innerText();
  if (emptyRefused) ok('an emptied pause title is refused in the server’s own words');
  else bad('an emptied pause title is refused in the server’s own words', saidOnEmpty.slice(-400));

  // And back, so the draft is left publishable for the next run.
  await admin.getByLabel('Title', { exact: true }).fill('Let’s pause here.');
  await admin.waitForTimeout(1800);
}
await admin.close();

await finish(() => browser.close());
