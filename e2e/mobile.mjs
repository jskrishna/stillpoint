import { launch } from './browser.mjs';
import { reporter } from './report.mjs';

/**
 * The mobile app, actually running.
 *
 * Until this existed, nothing in `apps/mobile` had ever been executed. CI
 * typechecked it and `expo export` bundled and statically rendered every
 * route, which proves a broken import and nothing about behaviour: a screen
 * that renders and then fails the moment it talks to the API passes that
 * build.
 *
 * So this drives the Expo **web export** in a real browser against a real
 * API — register, consent, voice setup, a full six-step session, the journal,
 * and the safety stop. The screens, the reducer, the API client binding and
 * the navigation are the same files a phone runs.
 *
 * ## What it still does not prove
 *
 * Everything native, which is the list in `apps/mobile/README.md`: the keychain
 * (`expo-secure-store` is `localStorage` here), text-to-speech, `tel:` links,
 * the share sheet, the splash screen, safe-area insets on a notched device,
 * and being backgrounded mid-session. **The first run on hardware is still a
 * test pass that has not happened.** This narrows that list; it does not empty
 * it.
 *
 * ## Running it
 *
 *     cd apps/api && php artisan serve --port=8000 &
 *     pnpm --filter @stillpoint/mobile run build
 *     cd apps/mobile/dist && python3 -m http.server 4000 --bind 127.0.0.1 &
 *     node e2e/mobile.mjs
 *
 * Port 4000 is not arbitrary: the API's `CORS_ALLOWED_ORIGINS` already lists
 * it as "a static export's port". `MOBILE_URL` overrides.
 */

const APP = process.env.MOBILE_URL ?? 'http://127.0.0.1:4000';
const PASSWORD = 'a-long-enough-password';

const { ok, bad, finish, watchForThrows } = reporter('the mobile app');
watchForThrows();

const browser = await launch();
// A phone's viewport, because the layout is the thing a browser can check and
// a notch is the thing it cannot.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/**
 * Anything the app threw.
 *
 * React Native Web swallows a render error into a console message rather than
 * a failed assertion, so a screen can look fine and be broken. Collected here
 * and asserted at the end.
 */
const thrown = [];
page.on('pageerror', (e) => thrown.push(String(e).slice(0, 200)));

/**
 * Anywhere this app talked to that is not Stillpoint.
 *
 * The same rule `e2e/privacy.mjs` holds the web app to, and here for the same
 * reason: it caught a real leak once — the web's fonts were linked from
 * Google's CDN, so every page load of a product about being upset reached a
 * third party. The phone app bundles its fonts, and this is what keeps that
 * true of the export as well as of the claim.
 */
const elsewhere = new Map();
page.on('request', (request) => {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  const { hostname, origin } = new URL(url);
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return;
  elsewhere.set(origin, (elsewhere.get(origin) ?? 0) + 1);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  // A failed request is not a broken screen. The app reports an API refusal
  // itself and the assertions above cover the ones that matter — including the
  // 409 this script deliberately provokes by posting a turn to a stopped
  // session. What is left is the kind of message that means the code broke.
  if (/Warning:|favicon|Failed to load resource/.test(text)) return;
  thrown.push(text.slice(0, 200));
});

/**
 * The id of the session the app last posted a turn to.
 *
 * Needed because `/sessions/current` deliberately does not answer for an ended
 * one — an ended session is never offered to be resumed, a safety stop least of
 * all — so the only way to ask the server what it recorded is by id.
 */
let lastSessionId = null;
page.on('request', (request) => {
  const match = /\/sessions\/([^/]+)\/turns$/.exec(request.url());
  if (match) lastSessionId = match[1];
});

const body = () => page.locator('body').innerText();
/** The step header reads "STEP 4 OF 6 · REMEMBER". */
const atStep = async (n) => new RegExp(`step ${String(n)} of 6`, 'i').test(await body());
const press = async (name) => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(900);
};

// ---------------------------------------------------------------------------
console.log('\n1. Register and consent');

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

if ((await body()).includes('Welcome to Stillpoint')) ok('the app boots');
else bad('the app boots', (await body()).slice(0, 300));

await press('Create an account instead');
const email = `mobile+${String(Date.now())}@example.com`;
await page.getByLabel('Name').fill('Mobile Tester');
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill(PASSWORD);
await press('Create my account');
await page.waitForTimeout(1800);

if ((await body()).includes('Before we start')) ok('registering lands on the consent gate');
else bad('registering lands on the consent gate', (await body()).slice(0, 300));

// The gate has to hold, not just be mentioned. Here it is the control that is
// disabled rather than a message after a click — stricter than the web's, and
// the assertion has to match the screen rather than the other way round.
const gate = page.getByRole('button', { name: 'Continue' }).first();
if (await gate.isDisabled()) ok('Continue is disabled before consent');
else bad('Continue is disabled before consent', (await body()).slice(0, 400));
if ((await body()).includes('Please agree to both')) ok('and it says why');
else bad('and it says why', (await body()).slice(0, 400));

// The crisis numbers on this screen, which was the one screen in the app flow
// still hardcoded to `helplinesFor('IN')` — written when India was the only
// market, so after Canada became the first one it told a Canadian "If you are
// in danger, call 112 or Tele-MANAS 14416", two numbers that do not answer
// where they are. A wrong crisis number is worse than none, and this is said
// before anybody starts. It reads the account's own country now.
const gateText = await body();
if (/911/.test(gateText) && /988/.test(gateText))
  ok('the consent gate gives this account\u2019s own crisis numbers');
else bad('the consent gate gives this account\u2019s own crisis numbers', gateText.slice(0, 400));
if (!/14416|Tele-MANAS/.test(gateText) && !/call 112|112 or/.test(gateText))
  ok('and not another market\u2019s');
else bad('and not another market\u2019s', gateText.slice(0, 400));

await page.getByText('I understand and I can stop any time.').click();
await page.getByText('I am 18 or older.').click();
await page.waitForTimeout(300);
await press('Continue');
await page.waitForTimeout(1800);

if ((await body()).includes('Set up your voice')) ok('consent is accepted');
else bad('consent is accepted', (await body()).slice(0, 400));

// ---------------------------------------------------------------------------
console.log('\n2. Voice setup says what is and is not built');

const voice = await body();
if (/Hearing you is not built yet|Speaking is not ready/.test(voice))
  ok('it does not imply the listener works');
else bad('it does not imply the listener works', voice.slice(0, 400));
if (voice.includes('Your voice is never saved')) ok('it makes the promise the designs make');
else bad('it makes the promise the designs make');

await press('Keep it silent');
await page.waitForTimeout(2200);

const home = await body();
if (/Something bothering you/.test(home)) ok('a silent session is chosen, and lands on home');
else bad('a silent session is chosen, and lands on home', home.slice(0, 400));
if (/3 of 3 full sessions left/.test(home)) ok("home states the plan's allowance");
else bad("home states the plan's allowance", home.slice(0, 400));

// ---------------------------------------------------------------------------
console.log('\n3. A full six-step session');

await press('Start talking');
await page.waitForTimeout(2500);

if (await atStep(1)) ok('the session starts at step 1 of 6');
else bad('the session starts at step 1 of 6', (await body()).slice(0, 400));

const answer = async (text) => {
  const field = page.locator('textarea, input[type=text]').first();
  await field.fill(text);
  await page.waitForTimeout(200);
  const send = page.getByRole('button', { name: /Send|Continue|Next/ }).first();
  await send.click();
  await page.waitForTimeout(1800);
};

await answer('My manager dismissed my work in front of the whole team');
if (await atStep(2)) ok('step 1 advanced');
else bad('step 1 advanced', (await body()).slice(0, 400));

await answer('I can see how I took it that way');
await page.waitForTimeout(600);

// Step 3 is a selection, not prose: twelve feelings, choose up to three.
const feelings = await body();
if (/Choose up to 3|up to three/i.test(feelings)) ok('step 3 asks for a selection, not a sentence');
else bad('step 3 asks for a selection, not a sentence', feelings.slice(0, 500));

for (const feeling of ['Angry', 'Hurt']) {
  const chip = page.getByRole('button', { name: feeling }).first();
  if ((await chip.count()) > 0) await chip.click();
}
await page.waitForTimeout(400);
await page
  .getByRole('button', { name: /Send|Continue|Next/ })
  .first()
  .click();
await page.waitForTimeout(1800);

if (await atStep(4)) ok('step 3: picked feelings and advanced');
else bad('step 3: picked feelings and advanced', (await body()).slice(0, 500));

await answer('Being talked over at school when I was nine');
await answer('I am not good enough');
await answer('I let that belief go');
await page.waitForTimeout(1200);

const end = await body();
if (/Session complete/i.test(end)) ok('the session reaches its summary');
else bad('the session reaches its summary', end.slice(0, 500));
if (/I am not good enough/.test(end)) ok('the summary shows back what was said');
else bad('the summary shows back what was said', end.slice(0, 600));

// Rating, then saving, is what writes the journal row.
await press('A little');
await press('Save and finish');
await page.waitForTimeout(2500);

// ---------------------------------------------------------------------------
console.log('\n4. The journal holds it');

// The tab bar renders as real tabs, which is also what a screen reader gets.
await page.getByRole('tab', { name: 'Journal' }).click();
await page.waitForTimeout(2500);

const journal = await body();
if (journal.includes('manager') || /1 session|Today/.test(journal))
  ok('the finished session is in the journal');
else bad('the finished session is in the journal', journal.slice(0, 500));

// ---------------------------------------------------------------------------
console.log('\n5. The safety stop is the server’s here too');

await page.getByRole('tab', { name: 'Today' }).click();
await page.waitForTimeout(2000);
await press('Or a quick session');
await page.waitForTimeout(2500);

// First with the request dying on the way out, which on mobile data is the
// normal case rather than the rare one. The server never hears this, so it
// cannot stop anything, raise a flag or send a helpline — and what the screen
// used to show was "Could not reach Stillpoint. Check your connection and try
// again." to somebody who had just said they were going to kill themselves.
//
// It offers a number from the local phrase screen now. Not the stop: the
// session stays open, no flag exists, and the retry below is what reaches the
// server and does all three.
await page.route('**/turns', (route) => route.abort());
await answer('I want to kill myself');
const offered = await page
  .waitForFunction(() => /That answer has not been sent/.test(document.body.innerText), null, {
    timeout: 15000,
  })
  .then(
    () => true,
    () => false,
  );
const unsent = await body();
await page.unroute('**/turns');

if (offered) ok('an answer that never left still gets a crisis number');
else bad('an answer that never left still gets a crisis number', unsent.slice(0, 600));
if (/988/.test(unsent) && /\b911\b/.test(unsent)) ok('and it is this account\u2019s own numbers');
else bad('and it is this account\u2019s own numbers', unsent.slice(0, 600));
if (/step [1-6] of 6/i.test(unsent)) ok('and the session is not treated as stopped');
else bad('and the session is not treated as stopped', unsent.slice(0, 600));

// And somebody is told about it.
//
// The error on this screen has been an alert since it was written and these
// numbers were not, which is the gap the web had too: a person using a screen
// reader typed that they wanted to kill themselves, the POST died, and the
// numbers that answer that appeared with nothing announcing them. React Native
// for web renders `accessibilityRole` and `accessibilityLiveRegion` as `role`
// and `aria-live`, so the markup is checkable here even though no screen
// reader is — and `AccessibilityInfo.announceForAccessibility`, the half that
// carries the pause on a device, is not. `apps/mobile/README.md` lists it with
// the other things only a phone can prove.
const announced = await page.evaluate(() => {
  const inAlert = (el) => {
    for (let n = el; n !== null; n = n.parentElement) {
      const role = n.getAttribute?.('role');
      const live = n.getAttribute?.('aria-live');
      if (
        role === 'alert' ||
        role === 'status' ||
        (live !== null && live !== undefined && live !== '')
      )
        return true;
    }
    return false;
  };
  // Anchored on the sentence, not on a `tel:` link: `HelplineButton` here is a
  // `Pressable` calling `Linking.openURL`, so a phone can place the call and
  // the web export has no `href` to find. Looking for one was this check's own
  // bug before it was this one. The sentence and the numbers are in the same
  // block, so the block being live covers both.
  const sentence = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && /^That answer has not been sent/.test(el.textContent ?? ''),
  );
  if (sentence === undefined) return 'the sentence is not on the screen';
  return inAlert(sentence) ? true : 'the crisis block is in no live region';
});
if (announced === true) ok('and the numbers are in a live region, so they are announced');
else bad('and the numbers are in a live region', String(announced));

// Now let it through, and the server does the real thing.
await answer('I want to kill myself');
await page.waitForTimeout(1500);

const stopped = await body();
if (/988/.test(stopped)) ok('the crisis screen gives the 988 crisis line');
else bad('the crisis screen gives the 988 crisis line', stopped.slice(0, 600));
if (/\b911\b/.test(stopped)) ok('and the emergency number, 911 here rather than 112');
else bad('and the emergency number, 911 here rather than 112', stopped.slice(0, 600));
if (!/step [1-6] of 6/i.test(stopped)) ok('the session is over, no step is shown');
else bad('the session is over, no step is shown', stopped.slice(0, 600));

// The server is the one that decided. Asked directly, with this app's own
// token, so a screen that merely looks stopped cannot pass.
if (lastSessionId === null) bad('the utterance reached the server at all');
else ok(`the utterance went to the server (${lastSessionId})`);

const serverSays = await page.evaluate(
  async ([base, id]) => {
    const token = window.localStorage.getItem('stillpoint.token.v1');
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    const session = await fetch(`${base}/sessions/${id}`, { headers }).then((r) => r.json());
    const again = await fetch(`${base}/sessions/${id}/turns`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterance: 'are you still there' }),
    });
    const journal = await fetch(`${base}/journal`, { headers }).then((r) => r.json());
    return { session, again: again.status, entries: journal.total };
  },
  [process.env.API_URL ?? 'http://localhost:8000/api', lastSessionId],
);

if (serverSays.session.ended === true && serverSays.session.endReason === 'safety_stop')
  ok('the server recorded the stop, not the screen');
else bad('the server recorded the stop, not the screen', JSON.stringify(serverSays.session));
// An ended session is terminal. There is no resume path around a safety stop,
// and the server is what makes that true rather than the screen not offering.
if (serverSays.again === 409) ok('the server refuses another turn on it (409)');
else bad('the server refuses another turn on it (409)', String(serverSays.again));
if (serverSays.entries === 1) ok('the safety-stopped session left no journal row (still 1)');
else bad('the safety-stopped session left no journal row', String(serverSays.entries));

// ---------------------------------------------------------------------------
console.log('\n5b. Who can see your sessions, and when the app cannot tell');

// Back in through the app's own entry point first: the safety stop above
// leaves it on the session screen, which is outside the tab layout, so there
// is no tab bar to tap — and the static export is served by a plain file
// server, so `/settings` is a 404 rather than `settings.html`.
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('tab', { name: 'Settings' }).click();
await page.waitForTimeout(3000);

const settings = await body();
if (/Nobody\. A coach can only read a session/.test(settings))
  ok('with the request answering, the screen says nobody can');
else bad('with the request answering, the screen says nobody can', settings.slice(-500));

// This is the screen that answers "who can read my sessions", and it set the
// list to empty when the request failed — so it printed that reassuring
// sentence to somebody whose coach was reading two of their shared sessions,
// and took away the "Stop sharing" button with the list. Measured against the
// running app with the demo client, who is paired: with the request answering
// it listed Meera and offered to stop; with it failing it said nobody could
// see anything at all.
//
// A sharing rule the sharer cannot inspect is a promise about somebody else's
// behaviour. One that answers wrongly, in the reassuring direction, is worse
// than one that admits it does not know.
await page.route('**/me/coaches', (route) => route.abort());
await page.getByRole('tab', { name: 'Journal' }).click();
await page.waitForTimeout(1200);
await page.getByRole('tab', { name: 'Settings' }).click();
const admitted = await page
  .waitForFunction(
    () => /Could not check who can see your sessions/.test(document.body.innerText),
    null,
    { timeout: 15000 },
  )
  .then(
    () => true,
    () => false,
  );
const blindSettings = await body();
await page.unroute('**/me/coaches');

if (admitted) ok('with it failing, the screen says it could not check');
else bad('with it failing, the screen says it could not check', blindSettings.slice(-500));
if (!/Nobody\. A coach can only read a session/.test(blindSettings))
  ok('and does not say nobody can');
else bad('and does not say nobody can', 'it told them nobody can see their sessions');

// ---------------------------------------------------------------------------
console.log('\n6. Where the app went, and whether anything threw');

if (elsewhere.size === 0) ok('nothing left this origin');
else for (const [origin, count] of elsewhere) bad(`a request left for ${origin}`, String(count));

if (thrown.length === 0) ok('no screen threw while any of that happened');
else for (const t of thrown.slice(0, 5)) bad('a screen threw', t);

await finish(() => browser.close());
