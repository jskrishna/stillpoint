import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/**
 * axe-core over the phone's screens, in both palettes.
 *
 * **Nothing had ever audited this surface.** `e2e/a11y.mjs` covers the web's
 * twenty routes in both palettes and the phone's eleven screens were not in
 * it, because they cannot be reached by URL: the export is served by a plain
 * file server with no client-side routing, so a direct URL gets the file
 * server's 404 or expo-router's "Unmatched Route", and both of those pass an
 * audit having measured nothing. This script is already the only thing that
 * walks the app, so the audit belongs here.
 *
 * It found two things, both on the screens that matter most. The crisis
 * pause's helpline buttons hardcoded `'#FFFFFF'` where `apps/web` uses
 * `accent-ink`, so in the dark palette the helpline's name, its detail and
 * **the number itself** were 2.83:1 and 2.58:1 — on the screen whose only job
 * is to get somebody to dial one. And every radio and checkbox in the app
 * rendered with no checked state at all, the consent gate and the
 * coach-sharing group included.
 *
 * `document-title` is the one rule turned off, and the reason is that it is
 * not about the app: the export serves one `index.html` whose `<title>` Expo
 * fills from a screen's `options.title`, and there are no titles here because
 * `headerShown` is false on every stack — a phone has no document to title.
 * Turning it off here says that; leaving it on would have meant a known
 * violation on every screen, which is the state in which nobody reads the
 * next one.
 */
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

/**
 * Which screen file each audit was of, so the count stops counting itself.
 *
 * `CLAUDE.md` has said "ten of eleven" twice, corrected both times by listing
 * the files rather than believing the sentence — and the eleventh was missing
 * both times. A number in prose cannot check itself, so the second argument is
 * the screen's own path under `apps/mobile/src/app` and the summary compares
 * what was collected against what is on disk.
 *
 * `null` is for a state rather than a screen: the crisis pause is not a route,
 * it only exists after the server has ended a session for safety, so it has no
 * file of its own and must not count as covering `session.tsx`.
 *
 * @type {Set<string>}
 */
const audited = new Set();

const audit = async (screen, file = null) => {
  if (file !== null) audited.add(file);

  // Every screen, not only the gate: an `ActivityIndicator` renders
  // `role="progressbar"`, and one with neither a name nor `aria-hidden` is an
  // `aria-progressbar-name` violation wherever it appears. axe reports it as
  // part of the run below; this names the element so the failure says which
  // one, and it is the guard for the next spinner added anywhere.
  const bare = await page.evaluate(
    () =>
      [...document.querySelectorAll('[role="progressbar"]')].filter(
        (el) =>
          el.getAttribute('aria-label') === null &&
          el.getAttribute('aria-labelledby') === null &&
          el.getAttribute('aria-hidden') === null,
      ).length,
  );
  if (bare > 0) bad(`${screen} has no unnamed progress indicator`, `${String(bare)} of them`);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    // The palette comes from `useColorScheme`, so the screen re-renders.
    await page.waitForTimeout(600);
    await page.addScriptTag({ content: AXE });
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
        // See the note above for why one is off and why `target-size` is on.
        rules: { 'target-size': { enabled: true }, 'document-title': { enabled: false } },
      }),
    );
    const nodes = result.violations.reduce((n, v) => n + v.nodes.length, 0);
    if (nodes === 0) ok(`${screen} passes axe in ${scheme}`);
    else
      bad(
        `${screen} passes axe in ${scheme}`,
        result.violations
          .map(
            (v) =>
              `${v.id} (${v.impact}) x${String(v.nodes.length)}: ${
                v.nodes[0]?.any.map((a) => a.message).join(' ; ') ?? ''
              }`,
          )
          .join(' | '),
      );
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(400);
};

const browser = await launch();
// A phone's viewport, because the layout is the thing a browser can check and
// a notch is the thing it cannot.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/*
 * What the app hands to the speech engine, recorded instead of spoken.
 *
 * `expo-speech` reaches `speechSynthesis` in this export, so this is the only
 * place the phone's "does the guide speak" can be seen without a phone. It is
 * for the silent-session assertion in section 3, and section 2 presses a
 * voice's preview first so that assertion has a control: a recorder that
 * recorded nothing would otherwise read as silence.
 */
await page.addInitScript(() => {
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speak: (u) => {
        window.__spoken.push(u.text);
        u.onend?.();
      },
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      getVoices: () => [],
    },
  });
});

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
await audit('welcome', 'welcome/index.tsx');

/*
 * The autofill hint on the password field, in both of this screen's modes.
 *
 * React Native Web passes `autoComplete` straight through to the DOM, so the
 * attribute here is the same string the native platforms are handed — which
 * makes this the one place the value is visible without a phone.
 *
 * It said `password`, which React Native's own types list under "Android
 * only": `current-password` and `new-password` are the two that work
 * everywhere. So iOS dropped the hint and offered nothing from the keychain,
 * on the screen that asks for a password the product requires to be twelve
 * characters — the length people keep in a manager rather than in their head.
 * The same field in `apps/web` has said `current-password` all along, so the
 * two surfaces disagreed about one attribute.
 *
 * Asserted before the mode is toggled, because sign-in is the mode with the
 * wrong value in it; register mode's `new-password` was already right and is
 * checked below so a later edit cannot swap them.
 */
const hintOn = async (label) => page.getByLabel(label).first().getAttribute('autocomplete');

const signInHint = await hintOn('Password');
if (signInHint === 'current-password') ok(`signing in asks for ${signInHint}`);
else
  bad(
    'signing in asks for current-password',
    `the password field's autocomplete is ${JSON.stringify(signInHint)} — "password" is Android-only, so iOS offers nothing`,
  );

/*
 * ---------------------------------------------------------------------------
 * The forgotten-password screen, which nothing here reached.
 *
 * `LAUNCH.md` claims "every one of the phone's eleven screens is rendered by
 * one of them" — in the bullet that says that sentence "was false until
 * recently". It was false again: this script pressed through registration and
 * never touched `welcome/forgot.tsx`, so ten of eleven. Counted by listing the
 * files against what the script visits, which is how the same claim was caught
 * the first time.
 *
 * What it asserts is the rule rather than that the screen draws: the answer is
 * **the same** whether or not the address has an account. The server decides
 * that — `forgotPassword()` throws the broker's result away — and this is the
 * surface half, compared across an address that has an account and one that
 * does not, because a sentence that differs is a way to ask whether somebody
 * uses this product.
 *
 * The link itself is the web's to spend, and `flow.mjs` section 9 walks it out
 * of the log. There is no deep link into the app for a reset token on purpose.
 */
console.log('\n1b. Asking for a reset link says the same thing either way');

await press('I’ve forgotten my password');
await page.waitForTimeout(1200);

if ((await body()).includes('Set a new password')) ok('the forgotten-password screen opens');
else bad('the forgotten-password screen opens', (await body()).slice(0, 300));

await audit('the forgotten-password screen', 'welcome/forgot.tsx');

/**
 * Asks for a link and returns what the screen says back.
 *
 * `:visible` because expo-router keeps the screen underneath mounted — the
 * welcome screen's own Email field is still in the DOM, which made a plain
 * `getByLabel('Email')` a strict-mode violation on two elements. Measured
 * rather than guessed at: the stacked one is 0x0 and the pushed one is 350x48,
 * so visibility is what tells them apart, where `.first()` would have picked
 * the hidden one.
 */
const askFor = async (address) => {
  await page.locator('input[aria-label="Email"]:visible').fill(address);
  await press('Send me a link');
  await page.waitForTimeout(1500);
  const said = await body();
  const anchor = said.indexOf('If that address');

  // Not a silent fallback, and the first version was one. It did
  // `said.slice(said.indexOf(...))`, so with the sentence gone `indexOf`
  // returned -1 and `slice(-1)` handed back the body's **last character** —
  // the same one character for both addresses, which compared equal. Measured:
  // a screen edited to print the address itself turned the "told a link is on
  // its way" case red and left "told exactly the same" green, passing
  // vacuously on exactly the leak it exists to catch. The sentinel names the
  // address, so two of them can never match.
  if (anchor === -1) return `no sentence found for ${address}: ${said.slice(0, 200)}`;

  return said.slice(anchor);
};

// An address with no account. `example.invalid` is reserved, so this can never
// be somebody's real one.
const strangerSaid = await askFor(`nobody+${String(Date.now())}@example.invalid`);

if (/If that address has an account/.test(strangerSaid))
  ok('an address with no account is told a link is on its way');
else bad('an address with no account is told a link is on its way', strangerSaid.slice(0, 300));

// And the demo account, which does have one. Back to the form first: the
// screen replaces itself with the confirmation, so there is no field to refill.
await press('Back to sign in');
await page.waitForTimeout(1200);
await press('I’ve forgotten my password');
await page.waitForTimeout(1200);

const ownerSaid = await askFor('you@stillpoint.test');

if (ownerSaid === strangerSaid) ok('and an address that has one is told exactly the same');
else
  bad(
    'and an address that has one is told exactly the same',
    `stranger: ${strangerSaid.slice(0, 120)} / owner: ${ownerSaid.slice(0, 120)}`,
  );

// The journal sentence, which is the reason a reset is safe to offer at all:
// the `encrypted` casts use `APP_KEY`, not anything derived from the password.
if (/journal is not affected/.test(ownerSaid)) ok('and that their journal survives it');
else bad('and that their journal survives it', ownerSaid.slice(0, 300));

/*
 * Back in through the app's own entry point, the way section 5b does and for
 * the same reason: expo-router leaves every screen it has shown mounted, so
 * after two pushes there were **three** Email fields in the DOM and the next
 * `press('Create an account instead')` clicked a stale one — the hint read
 * `current-password`, meaning the screen was still in sign-in mode, and then
 * the registration fill resolved to three elements. A reload is one screen
 * again, which is cheaper than teaching every locator about the stack.
 */
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

if ((await body()).includes('Welcome to Stillpoint')) ok('and back at sign in afterwards');
else bad('and back at sign in afterwards', (await body()).slice(0, 300));

/*
 * And a button mid-flight, which nothing here had ever looked at.
 *
 * `Button` swaps its label for an `ActivityIndicator` while a request is out,
 * and that renders `role="progressbar"` — unnamed, so an
 * `aria-progressbar-name` violation on the app's primary control, invisible to
 * every audit because an audit catches a screen at rest. The `Pressable` keeps
 * its own `accessibilityLabel` and `busy` state, so the announcement is there
 * and the indicator is decoration: it is `aria-hidden` now.
 *
 * Measured by holding the sign-in request open, which is the only way to see
 * this state at all.
 */
await page.route('**/auth/login', (route) => new Promise(() => route));
// The credentials do not matter: the route is blocked, so this never reaches
// the server. What is being looked at is the button's rendered state.
await page.locator('input[aria-label="Email"]:visible').fill('busy@example.com');
await page.locator('input[type="password"]:visible').fill(PASSWORD);
await press('Sign in');
await page.waitForTimeout(1200);

const busyButton = await page.evaluate(() => {
  const spinners = [...document.querySelectorAll('[role="progressbar"]')];
  const buttons = [...document.querySelectorAll('[role="button"]')].map((el) => ({
    label: el.getAttribute('aria-label'),
    busy: el.getAttribute('aria-busy'),
    disabled: el.getAttribute('aria-disabled'),
    text: (el.textContent ?? '').trim().slice(0, 30),
  }));
  return {
    spinners: spinners.length,
    bare: spinners.filter(
      (el) => el.getAttribute('aria-label') === null && el.getAttribute('aria-hidden') === null,
    ).length,
    buttons,
  };
});

await page.unroute('**/auth/login');

if (busyButton.spinners > 0) ok('the button shows a spinner while the request is out');
else bad('the button shows a spinner while the request is out', JSON.stringify(busyButton));
if (busyButton.bare === 0) ok('and it is hidden from the accessibility tree');
else bad('and it is hidden from the accessibility tree', `${String(busyButton.bare)} unnamed`);
// The half that was already right, asserted so the fix above cannot be
// "fixed" by naming the spinner and dropping the button's own label.
const pressedButton = busyButton.buttons.find((b) => b.busy === 'true');
if (pressedButton !== undefined) ok('and says it is busy, which it did not');
else
  bad('and says it is busy', `no aria-busy on any button: ${JSON.stringify(busyButton.buttons)}`);
// The half that was already right, asserted so the fix cannot become "name the
// spinner and drop the button's own label". Its visible text is empty while
// busy — the label is swapped for the indicator — so `aria-label` is the only
// thing identifying it.
if (pressedButton?.label !== null && pressedButton?.label !== undefined)
  ok(`and keeps its name while its text is gone (${String(pressedButton.label)})`);
else bad('and keeps its name while its text is gone', JSON.stringify(busyButton.buttons));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// ---------------------------------------------------------------------------
await press('Create an account instead');

const registerHint = await hintOn('Password');
if (registerHint === 'new-password') ok(`registering asks for ${registerHint}`);
else bad('registering asks for new-password', `it is ${JSON.stringify(registerHint)}`);

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

await audit('the consent gate', 'welcome/consent.tsx');
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

await audit('voice setup', 'welcome/voice.tsx');

// A preview speaks, whatever is chosen next. Pressed here as the control for
// the silence asserted in section 3, and then the record is emptied.
await page.getByRole('radio').first().click();
await page.waitForTimeout(600);
const previewed = await page.evaluate(() => window.__spoken.length);
if (previewed > 0) ok('a voice can be heard before choosing');
else bad('a voice can be heard before choosing', 'nothing was handed to the speech engine');
await page.evaluate(() => {
  window.__spoken = [];
});

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

// "Keep it silent" was chosen above, and the phone read its questions aloud
// anyway. Its session screen went quiet only for a *voice* setting of `off`,
// which the server does not accept, and never looked at the talk mode this
// button sets. Asserted on what was handed to the speech engine, which
// `expo-speech` reaches through `speechSynthesis` in this export.
const spokenInSilence = await page.evaluate(() => window.__spoken ?? null);
if (Array.isArray(spokenInSilence) && spokenInSilence.length === 0)
  ok('a session chosen as silent says nothing aloud');
else bad('a session chosen as silent says nothing aloud', JSON.stringify(spokenInSilence));

await audit('the session', 'session.tsx');

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

await audit('the journal', '(tabs)/journal.tsx');

// ---------------------------------------------------------------------------
console.log('\n4b. The entry itself, which nothing here used to open');

// `journal/[id].tsx` was one of two screens on the phone that nothing
// rendered: this script is the only thing that executes `apps/mobile` at all,
// and it pressed the Journal tab and stopped there. `expo export` proves the
// module bundles and renders statically with no data; it says nothing about
// the screen with a real entry on it. Insights was the other, in 4c below.
const card = page.getByRole('button').filter({ hasText: 'manager' }).first();
if ((await card.count()) === 0) {
  bad('the entry opens from the list', (await body()).slice(0, 400));
} else {
  await card.click();
  await page.waitForTimeout(2500);
  const entry = await body();

  if (/← Journal/.test(entry)) ok('the entry opens from the list');
  else bad('the entry opens from the list', entry.slice(0, 400));

  await audit('the journal entry', 'journal/[id].tsx');

  // The session's own answers, which is what this screen is for. The belief is
  // the one that cannot come from anywhere else.
  if (entry.includes('I am not good enough')) ok('it shows back what was said');
  else bad('it shows back what was said', entry.slice(0, 600));

  // And the rating, which was "A little" a few lines up. This is the surface
  // that had the sentence: the web's entry screen read
  // `calmerRating === 'yes' ? ' · FELT CALMER' : ''`, so the same answer said
  // nothing there. Both read `CALMER_JOURNAL_LABEL` now, and this is the half
  // that proves the phone still does — a shared map with one call site left
  // behind is the situation it was added to end.
  if (/A little calmer/.test(entry)) ok('it names the rating that was given');
  else bad('it names the rating that was given', entry.slice(0, 600));
  if (!/Felt calmer/.test(entry)) ok('and not the unhedged one');
  else bad('and not the unhedged one', entry.slice(0, 600));

  // The note. Unique per run, because filling the same text twice is not an
  // edit — the Save button is only offered while the field differs from the
  // entry — so a second run against one database would have nothing to save.
  const note = `a note typed on the phone (${String(Date.now())})`;
  const field = page.locator('textarea').first();
  if ((await field.count()) === 0) {
    bad('the note can be typed');
  } else {
    await field.fill(note);
    await page.waitForTimeout(400);
    await press('Save the note');
    await page.waitForTimeout(2000);

    // The Save button disappearing is the confirmation, and it only
    // disappears once the saved entry comes back matching the field — so it
    // is the round-trip, not an optimistic render. What cannot be checked
    // here is the spoken announcement beside it: there is no screen reader,
    // which is `apps/mobile/README.md`'s list with the `tel:` links.
    const gone = (await page.getByRole('button', { name: 'Save the note' }).count()) === 0;
    if (gone) ok('the note saves, and the Save button goes with it');
    else bad('the note saves, and the Save button goes with it', (await body()).slice(-400));

    // Away and back rather than a reload: the export is served by a plain file
    // server, so reloading a client-side route asks it for a file that is not
    // there. Re-mounting the screen re-fetches the entry, which is what this
    // is checking.
    await press('← Journal');
    await page.waitForTimeout(1500);
    await page.getByRole('button').filter({ hasText: 'manager' }).first().click();
    await page.waitForTimeout(2500);
    const kept = await page.locator('textarea').first().inputValue();
    if (kept === note) ok('and it is still there when the screen is opened again');
    else bad('and it is still there when the screen is opened again', kept);
  }

  // The coach-sharing setting decides whether this control is offered at all,
  // and the server refuses it with a 409 naming the setting — so a screen that
  // offered it anyway would be offering something that cannot work. With the
  // default setting it is offered.
  const offered = await body();
  if (/Share with my coach/.test(offered) && !/Sharing is off in settings/.test(offered))
    ok('sharing is offered under the default setting');
  else bad('sharing is offered under the default setting', offered.slice(-500));

  // And with "Never share" chosen it says so rather than offering it. Set
  // through the API and set back, so section 5b below still meets the account
  // it expects.
  const set = async (value) =>
    page.evaluate(
      async ([base, coachSharing]) => {
        const token = window.localStorage.getItem('stillpoint.token.v1');
        const r = await fetch(`${base}/me`, {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ coachSharing }),
        });
        return r.status;
      },
      [process.env.API_URL ?? 'http://localhost:8000/api', value],
    );

  if ((await set('never')) !== 200) {
    bad('“Never share” can be chosen, to have something to refuse');
  } else {
    // Away and back, for the reason above: the screen reads the setting when
    // it mounts.
    await press('← Journal');
    await page.waitForTimeout(1500);
    await page.getByRole('button').filter({ hasText: 'manager' }).first().click();
    await page.waitForTimeout(2500);
    const locked = await body();
    if (/Sharing is off in settings/.test(locked))
      ok('with “Never share” chosen the screen says so instead of offering it');
    else
      bad(
        'with “Never share” chosen the screen says so instead of offering it',
        locked.slice(-500),
      );

    // Back to the default, so section 5b meets the account it expects.
    await set('ask_each_time');
  }

  // Back out through the screen's own link. The entry is not inside the tabs
  // layout, so there is no tab bar on it to press — which is what `← Journal`
  // is for.
  await press('← Journal');
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------------------
console.log('\n4c. Insights, the other screen nothing used to render');

await page.getByRole('tab', { name: 'Noticing' }).click();

// Waited for, and anchored on something only this screen has. The first
// attempt asserted `/Noticing/` and passed while the journal was still on
// screen — "Noticing" is the tab's own label, so it is on every tab. It is the
// same false positive `e2e/admin.mjs` warns about where it looks for the trail
// row of its own account rather than an arrow anywhere on the page.
const arrived = await page
  .waitForFunction(() => /felt calmer|Nothing to show yet/.test(document.body.innerText), null, {
    timeout: 20000,
  })
  .then(
    () => true,
    () => false,
  );
const noticing = await body();

if (arrived && !/Could not load this/.test(noticing)) ok('the insights screen loads');
else bad('the insights screen loads', noticing.slice(0, 500));

await audit('what the app noticed', '(tabs)/insights.tsx');

// The feelings picked at step 3, counted. One session is not a ranking —
// twelve feelings each counted once is a ranking of nothing — but the two
// that were chosen are the ones that must be here and the ten that were not
// must not be.
// Case-insensitive: the heading is uppercased in CSS and `innerText` returns
// what is rendered, so "Feelings you chose most" reads back as
// "FEELINGS YOU CHOSE MOST".
if (/feelings you chose most/i.test(noticing) && /Angry/.test(noticing) && /Hurt/.test(noticing))
  ok('it counts the feelings that were chosen');
else bad('it counts the feelings that were chosen', noticing.slice(-700));

if (!/Ashamed|Lonely|Numb/.test(noticing)) ok('and not the ones that were not');
else bad('and not the ones that were not', noticing.slice(-700));

// The recurring belief needs two sessions and this account has one, so the
// right answer here is its absence rather than a belief named from a single
// mention. Asserted, because a threshold nothing checks is a threshold that
// can quietly become one.
if (!/Belief that comes back/.test(noticing))
  ok('one session names no recurring belief (the threshold is two)');
else bad('one session names no recurring belief', noticing.slice(-700));

// ---------------------------------------------------------------------------
console.log('\n4d. The home screen, which was pressed and never looked at');

/*
 * The eleventh screen.
 *
 * This tab was pressed below — only to start a session from it — and never
 * audited, so the one screen a person opens the app onto had never been
 * through axe. It holds "Start talking", the offer to carry on an open
 * session, what the weekly allowance has left, and a preview of the journal,
 * which is more decision than any other screen in the app asks for.
 *
 * `CLAUDE.md` has said "ten of eleven" twice and been corrected both times by
 * listing the files instead of believing the sentence. The summary at the
 * bottom of this script now does that comparison, which is why this is the
 * last time that number has to be written down by hand.
 */
await page.getByRole('tab', { name: 'Today' }).click();
await page.waitForTimeout(2500);

const today = await body();
if (/Start talking|Or a quick session/.test(today)) ok('the home screen loads');
else bad('the home screen loads', today.slice(0, 500));

await audit('the home screen', '(tabs)/index.tsx');

/*
 * And the screen before all of them: `index.tsx`, the gate.
 *
 * It is the first thing the app draws and it has never been rendered by
 * anything here, because it redirects — no token means welcome, a token
 * without the required consent means consent, otherwise the app. With a token
 * it asks the server first, so the state somebody on a slow connection
 * actually sits on is `Waiting`, and that is what this audits: `GET /me` held
 * open, the app reloaded, the gate stuck where a bad connection leaves it.
 *
 * Not contrived, then — it is the one state of this screen a person can be in
 * long enough to read. Checked with the route released again afterwards, since
 * everything below needs the API.
 */
await page.route('**/api/me', (route) => new Promise(() => route));
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const waiting = await body();
if (!/Start talking|Welcome to Stillpoint/.test(waiting)) ok('the gate waits for the server');
else bad('the gate waits for the server', waiting.slice(0, 300));

// The half axe cannot ask about: whether the words arriving are announced.
// React Native for web renders `accessibilityLiveRegion` as `aria-live`, which
// is the same attribute `mobile.mjs` already reads on the crisis block — and
// `aria-hidden` on the indicator is what stops the same words being read twice.
const waitingTree = await page.evaluate(() => ({
  polite: document.querySelectorAll('[aria-live="polite"]').length,
  unnamedBars: [...document.querySelectorAll('[role="progressbar"]')].filter(
    (el) => el.getAttribute('aria-label') === null && el.getAttribute('aria-hidden') === null,
  ).length,
}));

if (waitingTree.polite > 0) ok('and says so in a polite live region');
else bad('and says so in a polite live region', 'no aria-live="polite" on the gate');
if (waitingTree.unnamedBars === 0) ok('with no progress indicator left unnamed in the tree');
else
  bad(
    'with no progress indicator left unnamed in the tree',
    `${String(waitingTree.unnamedBars)} role="progressbar" with neither a name nor aria-hidden`,
  );

await audit('the gate', 'index.tsx');

await page.unroute('**/api/me');
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('tab', { name: 'Today' }).click();
await page.waitForTimeout(2000);

// ---------------------------------------------------------------------------
console.log('\n5. The safety stop is the server’s here too');

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

await audit('the crisis pause', null);

// ---------------------------------------------------------------------------
console.log('\n5a. “Get help” shows a number and stops the session');

// The button is on every step and nothing here had pressed it. It sent the
// sentence "I need help, I do not feel safe" as an ordinary turn, which the
// screen grades `none`: no number, no stop, and the request was recorded as
// the step's answer. `e2e/flow.mjs` has the web's half of this.
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await press('Or a quick session');
await page.waitForTimeout(2500);

const callButtons = () => page.locator('[role="button"][aria-label^="Call "]').count();

// With the request dying first: the numbers must not depend on it arriving.
await page.route('**/help', (route) => route.abort());
await press('Get help');
await page
  .waitForFunction(
    () => document.querySelectorAll('[role="button"][aria-label^="Call "]').length >= 3,
    null,
    { timeout: 15000 },
  )
  .catch(() => undefined);
const helpOffline = await body();
await page.unroute('**/help');

if ((await callButtons()) >= 3) ok('the numbers appear when the request never arrives');
else bad('the numbers appear when the request never arrives', helpOffline.slice(0, 500));
if (/988/.test(helpOffline) && /\b911\b/.test(helpOffline) && !/14416|\b112\b/.test(helpOffline))
  ok('and they are this account’s own, not another market’s');
else bad('and they are this account’s own, not another market’s', helpOffline.slice(0, 500));
if (/step [1-6] of 6/i.test(helpOffline)) ok('and the session is not treated as stopped by that');
else bad('and the session is not treated as stopped by that', helpOffline.slice(0, 500));

// Now let it through: the server ends the session and the pause takes over.
await press('Get help');
await page
  .waitForFunction(() => !/step [1-6] of 6/i.test(document.body.innerText), null, {
    timeout: 15000,
  })
  .catch(() => undefined);

const helpStopped = await body();
if (!/step [1-6] of 6/i.test(helpStopped) && (await callButtons()) >= 3)
  ok('with the request through, the pause takes over');
else bad('with the request through, the pause takes over', helpStopped.slice(0, 500));

const helpServer = await page.evaluate(async (base) => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const open = await fetch(`${base}/sessions/current`, { headers }).then((r) => r.json());
  const journal = await fetch(`${base}/journal`, { headers }).then((r) => r.json());
  return { open, entries: journal.total };
}, process.env.API_URL ?? 'http://localhost:8000/api');

// Nothing is left open, so the session the button was pressed in has ended,
// and it wrote no journal row: a session ended by a press of "Leave" would
// have, which is how this tells a safety stop from an ordinary one.
//
// "Nothing open" arrives as an object with no id: the route answers a JSON
// null, which Laravel writes as `{}`, and the client is what reads that as
// null. Asked with a bare `fetch` here, so read the same way.
if (helpServer.open === null || helpServer.open.id === undefined)
  ok('the server ended the session');
else bad('the server ended the session', JSON.stringify(helpServer.open).slice(0, 300));
if (helpServer.entries === 1) ok('and it left no journal row (still 1)');
else bad('and it left no journal row', String(helpServer.entries));

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

/*
 * The crisis numbers here are dialable, which they were not.
 *
 * This screen rendered them as plain `Text` while the safety pause one screen
 * over had a `HelplineButton` all along — and this is the only place in the
 * app somebody finds a number *outside* a session, which is most of the time.
 * A number you cannot tap is one you have to retype. The web had the identical
 * asymmetry for the identical reason: the component lived inside the session
 * screen's own file, so settings could not have used it.
 *
 * What this can assert is the control and its accessible name: React Native
 * Web renders `accessibilityRole="button"` as `role="button"` and
 * `accessibilityLabel` as `aria-label`, so the export shows what the native
 * platforms are handed. What it **cannot** assert is that a call is placed —
 * `Linking.openURL('tel:…')` hands the dialler to the system, and that is on
 * `apps/mobile/README.md`'s list with the keychain and text-to-speech. Say
 * that rather than implying the export proved it.
 */
const dialable = await page.evaluate(() =>
  [...document.querySelectorAll('[role="button"]')]
    .map((el) => el.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Call ')),
);
if (dialable.length === 3)
  ok(`the crisis numbers are pressable, not text (${String(dialable.length)})`);
else
  bad(
    'the crisis numbers are pressable, not text (3)',
    `found ${String(dialable.length)}: ${dialable.join(' | ') || 'none'}`,
  );
// Named, and this account's own market. A pressable that says "Call" and
// nothing else is a button a screen reader cannot tell from the next one.
if (dialable.some((l) => l.endsWith('on 988')) && dialable.some((l) => l.endsWith('on 911')))
  ok('and each names the line and the number, 988 and 911 rather than another market\u2019s');
else
  bad(
    'and each names the line and the number, 988 and 911 rather than another market\u2019s',
    dialable.join(' | ') || 'no labelled call button',
  );

/*
 * Two presses that settle something, and two that are a change of mind.
 *
 * Both measured here before they were fixed, and both invisible to three
 * separate clicks: a round trip between presses is a React flush, so a guard
 * reading its own `useState` refuses and the check passes whether or not the
 * guard could work. These dispatch inside **one** `evaluate`, which is what a
 * real double-tap is. `src/presses.ts` has the numbers.
 */
{
  const seen = [];
  const count = (request) => {
    const u = request.url();
    if (/\/api\/journal/.test(u)) seen.push('journal');
    if (/\/api\/me$/.test(u) && request.method() === 'PATCH') seen.push('patch');
  };
  page.on('request', count);

  // "Export everything": guarded `if (exporting) return`, which read the
  // `false` the handler was built with — three whole-journal reads. The cost
  // is not the round trips: `exportFile()` is one fixed path, overwritten, so
  // a second export can be writing the file while the first hands it to the
  // share sheet.
  const exportBtn = await page
    .getByRole('button', { name: /Export everything|Gathering it/ })
    .elementHandle({ timeout: 8000 })
    .catch(() => null);
  if (exportBtn === null) bad('the export button is on the settings screen', 'not found');
  else {
    await exportBtn.evaluate((el) => {
      el.click();
      el.click();
      el.click();
    });
    await page.waitForTimeout(2500);
    const reads = seen.filter((x) => x === 'journal').length;
    if (reads === 1) ok('three same-frame export presses read the journal once');
    else bad('three same-frame export presses read the journal once', `read it ${String(reads)}x`);
  }

  // The sharing setting is the other rule: each press is a newer intention, so
  // none is refused and the writes are ordered instead. Unordered, whichever
  // request *arrived* last decided what the server held — measured, somebody
  // who tapped "Share every session" and then "Never share" was left on
  // `always`, with the screen agreeing so there was nothing to notice.
  seen.length = 0;
  let held = 0;
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    held += 1;
    if (held === 1) await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.getByText('Share every session', { exact: false }).first().click();
  await page.waitForTimeout(120);
  await page.getByText('Never share', { exact: false }).first().click();
  await page.waitForTimeout(4500);
  await page.unroute('**/api/me');

  page.off('request', count);

  const chosen = await page.evaluate(() =>
    [...document.querySelectorAll('[role="radio"]')]
      .filter((el) => el.getAttribute('aria-checked') === 'true')
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
      .join(' ; '),
  );
  if (/Never share/.test(chosen)) ok('the screen ends on the sharing option tapped last');
  else bad('the screen ends on the sharing option tapped last', chosen);

  // And the server, which is the half a screen cannot show. Asked with this
  // app's own token, so it is the account's stored value rather than a render.
  const token = await page.evaluate(() => window.localStorage.getItem('stillpoint.token.v1'));
  const me = await fetch(`${process.env.API_URL ?? 'http://localhost:8000/api'}/me`, {
    headers: { Authorization: `Bearer ${String(token)}` },
  })
    .then((r) => r.json())
    .catch(() => null);
  if (me !== null && me.coachSharing === 'never')
    ok('and so does the server, on the setting that decides who may read a session');
  else
    bad(
      'and so does the server, on the setting that decides who may read a session',
      `coachSharing = ${String(me === null ? 'unreadable' : me.coachSharing)}`,
    );

  // Put it back, so a second run against the same database starts where this
  // one did — the reason the coach check's note is unique per run.
  await page.getByText('Ask each time', { exact: false }).first().click();
  await page.waitForTimeout(1500);
}

await audit('settings', '(tabs)/settings.tsx');

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

/*
 * Every screen, against the screens that exist.
 *
 * This script is the only thing that executes `apps/mobile` at all, so what it
 * does not visit is not verified anywhere — and the count of what it visits
 * has been written down in prose and been wrong twice, both times by one, both
 * times corrected by listing the files instead of believing the sentence. The
 * eleventh was the home screen: pressed, to start a session from it, and never
 * audited.
 *
 * So the files are the authority. `_layout.tsx` is not a screen — it is the
 * stack or tab shell around them — and the crisis pause is audited with no
 * file on purpose, because it is a state of `session.tsx` rather than a route
 * of its own and must not stand in for the six steps.
 */
const SCREENS = fileURLToPath(new URL('../apps/mobile/src/app', import.meta.url));

const screenFiles = readdirSync(SCREENS, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('_layout.tsx'));

const missed = screenFiles.filter((f) => !audited.has(f));

if (screenFiles.length < 8) {
  // A check whose input is empty stops checking in silence, which is the
  // failure this whole block is about.
  bad('found the screens to compare against', `${String(screenFiles.length)} files`);
} else if (missed.length === 0) {
  ok(`every screen was audited (${String(screenFiles.length)})`);
} else {
  bad(
    `every screen was audited — ${String(missed.length)} were not`,
    `${missed.join(', ')} — walk to it and call audit(label, file), or say here why it has no file`,
  );
}

// And the other direction: a file named at an audit that no longer exists
// would mean the set agrees with itself about a screen that is gone.
const stale = [...audited].filter((f) => !screenFiles.includes(f));
if (stale.length === 0) ok('and every screen it names still exists');
else bad('and every screen it names still exists', stale.join(', '));

await finish(() => browser.close());
