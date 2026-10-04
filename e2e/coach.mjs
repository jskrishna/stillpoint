import { ACCOUNTS, API, PASSWORD, WEB, launch } from './browser.mjs';
import { reporter } from './report.mjs';

/**
 * The coach portal, against a running API.
 *
 * One sentence, checked from the outside: "You only see sessions your clients
 * choose to share." Not that a private session is hidden on the screen — that
 * its title, its belief and its note are absent from what the coach's browser
 * receives.
 *
 * It needs a coach account paired with a client, which the API cannot make
 * (`role` is not fillable and pairing is not a public route). `DemoSeeder`
 * makes both: `php artisan db:seed --class=DemoSeeder` in `apps/api`. The
 * script registers its own extra client on top, so a run is not reading an
 * earlier run's rows.
 */

// Unique per run: a fixed title finds an earlier run's row, which is already
// shared, and then nothing under test is actually being exercised.
const RUN = String(Date.now()).slice(-6);
const SHARED = `My manager dismissed my work in front of the team ${RUN}`;
const PRIVATE = `Something I am not ready to discuss ${RUN}`;

const { ok, bad, finish, watchForThrows } = reporter('the coach portal');
watchForThrows();

const browser = await launch();

// ---------------------------------------------------------------------------
console.log('\n1. The client runs two sessions and shares one');

const client = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await client.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await client.getByLabel('Email').fill(ACCOUNTS.client);
await client.getByLabel('Password').fill(PASSWORD);
await client.getByRole('button', { name: 'Sign in' }).click();
await client.waitForTimeout(2000);

const clientSignedIn = await client.evaluate(
  () => window.localStorage.getItem('stillpoint.token.v1') !== null,
);
if (!clientSignedIn) {
  bad('the client signs in', `is ${ACCOUNTS.client} made and paired? see e2e/README.md`);
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

  /**
   * Runs a session to the end, answering every step.
   *
   * A quick session, because those are unlimited: a full one spends the free
   * plan's weekly allowance and this script is run over and over.
   */
  const runSession = async (what) => {
    await client.goto(`${WEB}/session?kind=quick`, { waitUntil: 'networkidle' });
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

    // Clicked only if it is not already shared, so a re-run does not unshare it.
    const share = client.locator('button', { hasText: /^Share with coach$/ }).first();
    if ((await share.count()) > 0) await share.click();
    await client.waitForTimeout(1200);

    if ((await client.locator('body').innerText()).includes('Shared with coach'))
      ok('one session is shared');
    else bad('one session is shared', (await client.locator('body').innerText()).slice(0, 300));
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
await coach.getByLabel('Email').fill(ACCOUNTS.coach);
await coach.getByLabel('Password').fill(PASSWORD);
await coach.getByRole('button', { name: 'Sign in' }).click();
await coach.waitForTimeout(2000);

const coachSignedIn = await coach.evaluate(
  () => window.localStorage.getItem('stillpoint.token.v1') !== null,
);
if (!coachSignedIn) {
  bad('the coach signs in', `is ${ACCOUNTS.coach} made? see e2e/README.md`);
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
    //
    // Unique per run on purpose. Filling the same text twice is not an edit —
    // the save effect returns early when the field matches what was loaded —
    // so on a second run against the same database nothing was saved and the
    // status assertion below read an empty region. A check that depends on
    // the database being fresh is a check that passes for the wrong reason.
    const notes = `Wants to talk about her manager. (${String(Date.now())})`;
    await coach.locator('textarea').fill(notes);
    await coach.waitForTimeout(1500);

    // Saved after typing stops, and said so. The only confirmation used to be
    // `· saving…` appended to the field's label, in no live region, on screen
    // for exactly as long as the request took — there was never a "saved" at
    // all. What is assertable without a screen reader is the region and its
    // content, which is the mechanism that decides whether anything is said.
    const region = coach.locator('[role="status"]').first();
    const status =
      (await region.count()) > 0 ? await region.innerText() : '(there is no live region)';
    if (/saved/.test(status)) ok('a saved note says so, in a live region');
    else bad('a saved note says so, in a live region', `the region reads "${status}"`);

    // And the status is not folded into the field's own name: `.field` is a
    // wrapping label, so the whole label would have named the textarea and its
    // accessible name would change every time a save ran.
    const named = await coach
      .locator('textarea')
      .first()
      .evaluate((el) => {
        const by = el.getAttribute('aria-labelledby');
        return by === null ? null : (document.getElementById(by)?.textContent ?? '').trim();
      });
    if (named === 'My private notes') ok('and the field is still named by its label alone');
    else bad('and the field is still named by its label alone', JSON.stringify(named));

    await coach.reload({ waitUntil: 'networkidle' });
    await coach.waitForTimeout(1800);
    const saved = await coach.locator('textarea').inputValue();
    if (saved === notes) ok('the coach’s notes survive a reload');
    else bad('the coach’s notes survive a reload', saved);
  }
  // -------------------------------------------------------------------------
  console.log('\n3. An invitation, end to end');

  const invited = `invited+${String(Date.now())}@example.com`;

  await coach.goto(`${WEB}/coach`, { waitUntil: 'networkidle' });
  await coach.waitForTimeout(1500);
  await coach.getByLabel('Client’s email address').fill(invited);
  await coach.getByRole('button', { name: /Create invitation/ }).click();
  await coach.waitForTimeout(1500);

  const link = await coach.locator('code').first().innerText();
  if (/\/welcome\/invite\//.test(link)) ok('the coach is given a link to pass on');
  else bad('the coach is given a link to pass on', link);

  const beforeAccept = await coach.locator('a[href^="/coach/"]').count();

  // A coach cannot attach themselves. Nothing has happened until the client
  // accepts — read from the API, not the page, because the page legitimately
  // lists the address under "waiting to be accepted".
  const pairedYet = await coach.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const clients = await fetch(`${api}/coach/clients`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    return clients.map((c) => c.name);
  }, API);
  if (!pairedYet.includes('Newly Invited')) ok('inviting alone creates no pairing');
  else bad('inviting alone creates no pairing', pairedYet.join(', '));

  // Somebody else holding the link cannot accept it.
  const stranger = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stranger.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await stranger.getByRole('button', { name: 'Create an account instead' }).click();
  await stranger.getByLabel('Name').fill('Someone Else');
  await stranger.getByLabel('Email').fill(`stranger+${String(Date.now())}@example.com`);
  await stranger.getByLabel('Password').fill(PASSWORD);
  await stranger.getByRole('button', { name: 'Create my account' }).click();
  await stranger.waitForURL('**/welcome/consent', { timeout: 15000 });
  await stranger.goto(link, { waitUntil: 'networkidle' });
  await stranger.waitForTimeout(1500);
  await stranger.getByRole('button', { name: /^Accept, and share with/ }).click();
  await stranger.waitForTimeout(1500);
  if (/different address/i.test(await stranger.locator('body').innerText()))
    ok('someone else holding the link cannot accept it');
  else
    bad(
      'someone else holding the link cannot accept it',
      (await stranger.locator('body').innerText()).slice(0, 300),
    );
  await stranger.close();

  // The person it was sent to can. The link is readable before signing in.
  const client = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await client.goto(link, { waitUntil: 'networkidle' });
  await client.waitForTimeout(1500);
  const offered = await client.locator('body').innerText();
  if (/would like to be your coach/.test(offered)) ok('the invitation reads without an account');
  else bad('the invitation reads without an account', offered.slice(0, 300));
  if (offered.includes(invited)) ok('it says which address it was sent to');
  else bad('it says which address it was sent to');
  if (/only.*when you choose to share/is.test(offered)) ok('it states what a coach will see');
  else bad('it states what a coach will see');

  // A link that could not be checked is not a link that is wrong. Any failure
  // used to land on "We don't recognise this link. Ask your coach to send you
  // a new invitation." — a definite statement about a perfectly good link,
  // which sends somebody to ask their coach to reissue it for nothing. This
  // route is in the `guessable` rate limiter, so a 429 is a real way to get
  // there, and whoever holds the link has no account and no other way in.
  await client.route('**/invites/*', (route) => route.abort());
  await client.goto(link, { waitUntil: 'domcontentloaded' });
  const couldNot = await client
    .waitForFunction(() => /Could not check this link/.test(document.body.innerText), null, {
      timeout: 15000,
    })
    .then(
      () => true,
      () => false,
    );
  const unchecked = await client.locator('body').innerText();
  await client.unroute('**/invites/*');

  if (couldNot) ok('a link that could not be checked says so');
  else bad('a link that could not be checked says so', unchecked.slice(0, 400));
  if (!/don’t recognise this link/.test(unchecked)) ok('and is not called unrecognised');
  else bad('and is not called unrecognised', 'it told them the link is wrong');

  // The invitee's actual journey, which this check used to skip.
  //
  // It registered at `/welcome` and then `goto(link)` — navigating back to the
  // invitation by hand, which is exactly what the product failed to do. So the
  // check passed while the flow was broken, because the script knew the link
  // and the person would not. Measured: the invitee clicked Accept, signed in,
  // and landed on the consent screen with the invitation gone. The push
  // carried `?next=` and nothing read it.
  //
  // So: open the link signed out, press the button the screen offers, and let
  // the product do the routing. No `goto` anywhere in here.
  await client.goto(link, { waitUntil: 'networkidle' });
  await client.waitForTimeout(1500);
  await client.getByRole('button', { name: /^Accept, and share with/ }).click();
  await client.waitForURL('**/welcome', { timeout: 15000 });
  ok('accepting while signed out sends the invitee to sign in');

  await client.getByRole('button', { name: 'Create an account instead' }).click();
  await client.getByLabel('Name').fill('Newly Invited');
  await client.getByLabel('Email').fill(invited);
  await client.getByLabel('Password').fill(PASSWORD);
  await client.getByRole('button', { name: 'Create my account' }).click();

  // Consent stays first whatever they were going to: it is the server's gate,
  // and it is the screen that names the crisis numbers.
  await client.waitForURL('**/welcome/consent', { timeout: 15000 });
  ok('and consent still comes first, before the invitation');
  const inviteeBoxes = client.locator('input[type=checkbox]');
  await inviteeBoxes.nth(0).check();
  await inviteeBoxes.nth(1).check();
  await client.getByRole('button', { name: /Continue|Saving/ }).click();
  await client.waitForURL('**/welcome/voice', { timeout: 15000 });
  await client.getByRole('button', { name: 'Keep it silent' }).click();

  // And then back where they were going, rather than the home screen.
  const returned = await client.waitForURL(`**${new URL(link).pathname}`, { timeout: 15000 }).then(
    () => true,
    () => false,
  );
  if (returned) ok('and the welcome flow ends back at the invitation');
  else bad('and the welcome flow ends back at the invitation', client.url());

  await client.waitForTimeout(1500);
  await client.getByRole('button', { name: /^Accept, and share with/ }).click();
  await client.waitForTimeout(2000);
  if (/is now your coach/.test(await client.locator('body').innerText()))
    ok('the person it was sent to accepts, and that creates the pairing');
  else
    bad(
      'the person it was sent to accepts',
      (await client.locator('body').innerText()).slice(0, 300),
    );

  await coach.reload({ waitUntil: 'networkidle' });
  await coach.waitForTimeout(1800);
  const afterAccept = await coach.locator('a[href^="/coach/"]').count();
  if (afterAccept === beforeAccept + 1)
    ok(`the coach now has the client (${String(beforeAccept)} → ${String(afterAccept)})`);
  else bad('the coach now has the client', `${String(beforeAccept)} → ${String(afterAccept)}`);

  // -------------------------------------------------------------------------
  console.log('\n4. The client can see who reads their sessions, and end it');

  await client.goto(`${WEB}/app/settings`, { waitUntil: 'networkidle' });
  await client.waitForTimeout(1800);
  const settings = await client.locator('body').innerText();
  if (/WHO CAN SEE YOUR SESSIONS/.test(settings)) ok('settings says who can see their sessions');
  else bad('settings says who can see their sessions', settings.slice(0, 300));
  // The coach's own name, asked of the API rather than written down here. A
  // literal name made this check pass only against the database it was written
  // against, and fail the first time the seed named the account differently.
  const coachName = await coach.evaluate(async (api) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const me = await fetch(`${api}/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    return me.name;
  }, API);

  if (settings.includes(coachName)) ok(`the coach is named there (${coachName})`);
  else bad('the coach is named there', `looked for ${coachName} in: ${settings.slice(0, 200)}`);

  await client.getByRole('button', { name: 'End coaching' }).first().click();
  await client.waitForTimeout(400);
  await client.locator('button', { hasText: /^End coaching with/ }).click();
  await client.waitForTimeout(1800);
  if (/Nobody\. Your journal is yours alone/.test(await client.locator('body').innerText()))
    ok('ending it takes effect on the client’s own screen');
  else bad('ending it takes effect', (await client.locator('body').innerText()).slice(0, 300));

  // And the coach loses access at once.
  await coach.reload({ waitUntil: 'networkidle' });
  await coach.waitForTimeout(1800);
  const afterEnd = await coach.locator('a[href^="/coach/"]').count();
  if (afterEnd === beforeAccept)
    ok(`the coach loses the client at once (${String(afterAccept)} → ${String(afterEnd)})`);
  else bad('the coach loses the client at once', `${String(afterAccept)} → ${String(afterEnd)}`);
  await client.close();
}
await coach.close();

await finish(() => browser.close());
