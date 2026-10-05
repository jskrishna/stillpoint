import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API, PASSWORD, WEB, launch } from './browser.mjs';
import { reporter } from './report.mjs';

/**
 * End-to-end check of the web app against the Laravel API.
 *
 * It is a script rather than a test suite because it needs two servers running.
 * CI brings them up and runs it; by hand that is:
 *
 *     cd apps/api && php artisan serve --port=8000 &
 *     pnpm run build && (cd apps/web && npx next start --port 3000) &
 *     node e2e/flow.mjs
 *
 * Run it after changing anything in the session flow, `apps/web/src/lib/api.ts`
 * or `apps/api/app/Domain`.
 *
 * Two sections are what it is really here for, and both are things only a real
 * browser against a real server can show:
 *
 * - **the safety stop** (section 7): crisis language typed into the page is
 *   stopped by the *server*, another turn on that session is refused, the
 *   helplines appear and no journal row is written. That is the promise the
 *   marketing site makes.
 * - **a reply lost on the way back** (section 3c): the turn reaches the server
 *   and the response is dropped, which is what a train tunnel does. The retry
 *   must not be recorded as the next step's answer.
 */

// Resolved through require: playwright is CommonJS, and the browser binary is
// the one the container already has rather than one this script downloads.

const email = `e2e+${Date.now()}@example.com`;
const { ok, bad, finish, watchForThrows } = reporter('the user journey');
watchForThrows();

const browser = await launch();
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

// The crisis numbers on this screen, which was the one screen in the app flow
// still hardcoded to `helplinesFor('IN')` — written when India was the only
// market, so after Canada became the first one it told a Canadian "If you are
// in danger, call 112 or Tele-MANAS 14416", two numbers that do not answer
// where they are. A wrong crisis number is worse than none, and this is said
// before anybody starts. It reads the account's own country now.
const gateText = await page.locator('body').innerText();
if (/911/.test(gateText) && /988/.test(gateText))
  ok('the consent gate gives this account\u2019s own crisis numbers');
else bad('the consent gate gives this account\u2019s own crisis numbers', gateText.slice(0, 400));
if (!/14416|Tele-MANAS/.test(gateText) && !/call 112|112 or/.test(gateText))
  ok('and not another market\u2019s');
else bad('and not another market\u2019s', gateText.slice(0, 400));

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
await page.getByRole('button', { name: 'Keep it silent' }).click();
await page.waitForURL('**/app', { timeout: 15000 });
ok('a silent session is chosen, and lands on home');
await page.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, {
  timeout: 15000,
});
if ((await text()).includes('Nothing yet')) ok('journal starts empty');
else bad('journal starts empty', await text());

// The guide can speak. Checked by replacing the browser's synthesiser before
// the page loads and recording what it was asked to say — audio cannot be heard
// from here, but what was handed to the engine can be.
console.log('\n2b. The guide speaks its question');

/** Replaces `speechSynthesis` with one that records, for the page's lifetime. */
const recordSpeech = (target) =>
  target.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => {
          window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch });
          u.onend?.();
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });

// A second account, in its own context, choosing to be spoken to.
const voicePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await recordSpeech(voicePage);

const speaker = `speaks+${String(Date.now())}@example.com`;
await voicePage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await voicePage.getByRole('button', { name: 'Create an account instead' }).click();
await voicePage.getByLabel('Name').fill('Spoken To');
await voicePage.getByLabel('Email').fill(speaker);
await voicePage.getByLabel('Password').fill('correct-horse-battery-staple');
await voicePage.getByRole('button', { name: 'Create my account' }).click();
await voicePage.waitForURL('**/welcome/consent', { timeout: 15000 });
const voiceBoxes = voicePage.locator('input[type=checkbox]');
await voiceBoxes.nth(0).check();
await voiceBoxes.nth(1).check();
await voicePage.getByRole('button', { name: /Continue|Saving/ }).click();
await voicePage.waitForURL('**/welcome/voice', { timeout: 15000 });
await voicePage.getByRole('button', { name: 'Let the guide speak' }).click();
await voicePage.waitForURL('**/app', { timeout: 15000 });

await voicePage.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await voicePage.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
await voicePage.waitForTimeout(1200);

const said = await voicePage.evaluate(() => window.__spoken);
const question = 'You’re upset, and that’s okay. What happened?';

if (said.length > 0) ok(`the guide spoke (${String(said.length)} utterance)`);
else bad('the guide spoke', 'nothing was handed to the engine');
if (said[0]?.text === question) ok('it spoke the step’s own question');
else bad('it spoke the step’s own question', String(said[0]?.text));
if (said[0]?.lang === 'en-CA' && said[0].rate < 1 && said[0].pitch < 1)
  ok('calm and Canadian English, not a screen reader’s default');
else bad('calm and Canadian English', JSON.stringify(said[0]));

// And it never reads the user's own words back out.
await voicePage.locator('textarea, input[type=text]').first().fill('My manager dismissed my work');
await voicePage
  .locator('button', { hasText: /^(Continue|Next)/ })
  .first()
  .click();
await voicePage.waitForTimeout(1500);
const afterAnswer = await voicePage.evaluate(() => window.__spoken);
if (!afterAnswer.some((u) => u.text.includes('My manager dismissed my work')))
  ok('it never reads the user’s own words back');
else bad('it never reads the user’s own words back', JSON.stringify(afterAnswer));
await voicePage.close();

// The silent account — this script's own — asks the engine for nothing. The
// recorder goes on the existing page, which chose "Keep it silent" above.
await recordSpeech(page);
await page.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
if ((await page.evaluate(() => window.__spoken ?? [])).length === 0)
  ok('a silent session asks the engine for nothing');
else bad('a silent session asks the engine for nothing');

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
// The question the guide asks at each step, collected so the loop can insist
// there was one. The guide went silent after step 1 for a while — the server
// answered an advancing turn with an empty `say` — and this check is what was
// missing: the loop walked all six steps and only ever read the counter, so
// five blank questions looked exactly like the known missing-copy gap.
const asked = [];

for (let step = 1; step <= 6; step += 1) {
  const body = await text();
  const label = (body.match(/Step (\d) of (\d)/) ?? []).slice(1).join('/');
  if (step === 1 && label !== '1/6') bad('session starts at step 1 of 6', label);
  if (step === 1) ok(`session starts at step ${label}`);

  // Matched on the class rather than on the text: two of the six questions
  // have words after the question mark ("Take your time."), so a `?$` filter
  // silently missed them and made this check look broken when it was not.
  const question = page.locator('[class*="question"]').first();
  if ((await question.count()) > 0) {
    const asked_ = (await question.innerText()).trim();
    if (asked_ !== '') asked.push(asked_);
  }
  if (/no question yet/.test(body)) {
    bad(`step ${step} asks a question`, 'the screen says the step has no question yet');
  }

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

  // Advancing swaps the question out in place, which a sighted user sees and a
  // screen reader is told nothing about. Focus moves to the new question now,
  // so it is read out once — rather than a live region, which would say it
  // twice over the guide's own speech when the account is in voice mode.
  // Checked at the first advance only; one is the whole mechanism.
  if (step === 1) {
    const moved = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      text: (document.activeElement?.textContent ?? '').trim().slice(0, 50),
    }));
    if (moved.tag === 'P' && moved.text !== '')
      ok('advancing moves focus to the new question, so it is announced');
    else bad('advancing moves focus to the new question', JSON.stringify(moved));
  }
}

if (asked.length === 6) ok('the guide asked a question at every one of the six steps');
else
  bad(
    'the guide asked a question at every one of the six steps',
    `${String(asked.length)}: ${asked.join(' | ')}`,
  );

if (new Set(asked).size === asked.length) ok('and a different one each time');
else bad('and a different one each time', asked.join(' | '));

const after = await text();
if (/Did you feel calmer|calmer/i.test(after)) ok('the session reaches the summary');
else bad('the session reaches the summary', after.slice(0, 300));

/*
 * The rating says which answer was chosen, which it did not.
 *
 * Measured through Chromium's accessibility tree, before and after pressing
 * "A little": three buttons, `pressed` absent on all three in both snapshots.
 * The chosen rating was a background colour and nothing else, so somebody on a
 * screen reader answered the one question this screen asks and was told
 * nothing about their own answer.
 *
 * It was a drift rather than a decision nobody made, which is what made it
 * findable: the feeling chips at step 3 carry `aria-pressed`, and the phone's
 * rating carries `accessibilityState={{ selected }}` — so the two surfaces
 * agreed about the chips and disagreed here, with the web holding the wrong
 * half.
 *
 * Asserted on `aria-pressed` on all three rather than only on the one pressed:
 * the bug was the attribute being absent, and a check on the chosen button
 * alone would pass against a version that marked every button pressed.
 */
const ratingState = () =>
  page.evaluate(() =>
    ['Yes', 'A little', 'No'].map((label) => {
      const b = [...document.querySelectorAll('button')].find(
        (x) => (x.textContent ?? '').trim() === label,
      );
      return `${label}=${b?.getAttribute('aria-pressed') ?? 'absent'}`;
    }),
  );

const beforeRating = await ratingState();
const little = page.getByRole('button', { name: 'A little' });
if ((await little.count()) > 0) {
  await little.click();
  await page.waitForTimeout(500);
  const afterRating = await ratingState();
  const want = ['Yes=false', 'A little=true', 'No=false'];
  if (
    beforeRating.join(' ') === 'Yes=false A little=false No=false' &&
    afterRating.join(' ') === want.join(' ')
  )
    ok('the calmer rating says which answer was chosen');
  else
    bad(
      'the calmer rating says which answer was chosen',
      `before: ${beforeRating.join(' ')} / after: ${afterRating.join(' ')}`,
    );
} else {
  bad('the calmer rating says which answer was chosen', 'no rating buttons on the summary');
}

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

// Closing a tab used to lose a session for good: it stayed open on the server,
// nothing could reach it again, and a free plan had already spent one of three
// full sessions on it.
console.log('\n3b. Carrying on where you left off');

const leftOff = await browser.newPage({ viewport: { width: 390, height: 844 } });
const resumer = `resume+${String(Date.now())}@example.com`;
await leftOff.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await leftOff.getByRole('button', { name: 'Create an account instead' }).click();
await leftOff.getByLabel('Name').fill('Came Back');
await leftOff.getByLabel('Email').fill(resumer);
await leftOff.getByLabel('Password').fill('correct-horse-battery-staple');
await leftOff.getByRole('button', { name: 'Create my account' }).click();
await leftOff.waitForURL('**/welcome/consent', { timeout: 15000 });
const resumeBoxes = leftOff.locator('input[type=checkbox]');
await resumeBoxes.nth(0).check();
await resumeBoxes.nth(1).check();
await leftOff.getByRole('button', { name: /Continue|Saving/ }).click();
await leftOff.waitForURL('**/welcome/voice', { timeout: 15000 });
await leftOff.getByRole('button', { name: 'Keep it silent' }).click();
await leftOff.waitForURL('**/app', { timeout: 15000 });

// Start one, answer a step, then walk away.
await leftOff.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await leftOff.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
await leftOff.locator('textarea, input[type=text]').first().fill('I was spoken over in a meeting');
await leftOff
  .locator('button', { hasText: /^Continue/ })
  .first()
  .click();
await leftOff.waitForTimeout(1200);

await leftOff.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await leftOff.waitForTimeout(1800);
const athome = await leftOff.locator('body').innerText();

if (/Carry on where you left off/.test(athome)) ok('home offers to carry on');
else bad('home offers to carry on', athome.slice(0, 300));
if (/You were on step 2 of 6/.test(athome)) ok('and says which step it was on');
else bad('and says which step it was on', athome.slice(0, 300));
if (/uses another full session/.test(athome)) ok('and says what starting fresh costs');
else bad('and says what starting fresh costs');

// And when the screen could not find out, it must not answer as though
// nothing were open. `POST /sessions` ends whatever is, as `user_stopped`, so
// the branch with no offer to resume and no warning is the one that closes a
// session somebody was part-way through and spends one of three to do it — and
// a dropped `GET /sessions/current` set `open` to null, which is this screen's
// word for "nothing is open", and landed exactly there. On mobile data that is
// not an edge case. The phone app had the same line and the same bug.
await leftOff.route('**/sessions/current', (route) => route.abort());
await leftOff.goto(`${WEB}/app`, { waitUntil: 'domcontentloaded' });
const askedAnyway = await leftOff
  .waitForFunction(
    () => /Could not check whether you left a session open/.test(document.body.innerText),
    null,
    { timeout: 15000 },
  )
  .then(
    () => true,
    () => false,
  );
const blindHome = await leftOff.locator('body').innerText();
await leftOff.unroute('**/sessions/current');

if (askedAnyway) ok('a home screen that could not ask says so');
else bad('a home screen that could not ask says so', blindHome.slice(0, 400));
if (/uses another full session/.test(blindHome)) ok('and still says what starting would cost');
else bad('and still says what starting would cost', blindHome.slice(0, 400));
// Never withheld. Somebody who is upset is not told to come back because the
// network was poor; what changes is that the cost is stated.
if (/Start talking/.test(blindHome)) ok('and still lets them start');
else bad('and still lets them start', blindHome.slice(0, 400));

// Back to a screen that can ask, for the rest of this section.
await leftOff.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await leftOff.waitForFunction(
  () => document.body.innerText.includes('Carry on where you left off'),
  null,
  { timeout: 15000 },
);

const spentBefore = await leftOff.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const me = await fetch('http://localhost:8000/api/me', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return me.fullSessionsLeft;
});

await leftOff.getByRole('link', { name: /Carry on where you left off/ }).click();
await leftOff.waitForURL('**/session?resume=1', { timeout: 15000 });
await leftOff.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
await leftOff.waitForTimeout(800);
const resumed = await leftOff.locator('body').innerText();

if (/Step 2 of 6/.test(resumed)) ok('resuming carries on from the step it was on');
else bad('resuming carries on from the step it was on', resumed.slice(0, 300));
if (/WHERE YOU GOT TO/.test(resumed) && /spoken over in a meeting/.test(resumed))
  ok('and it shows what was already told to it');
else bad('and it shows what was already told to it', resumed.slice(0, 400));

const spentAfter = await leftOff.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const me = await fetch('http://localhost:8000/api/me', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return me.fullSessionsLeft;
});
if (spentAfter === spentBefore)
  ok(`resuming costs no second allowance (still ${String(spentAfter)})`);
else bad('resuming costs no second allowance', `${String(spentBefore)} → ${String(spentAfter)}`);

// Starting something new ends the one that was open, rather than leaving two.
await leftOff.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await leftOff.waitForTimeout(1500);
await leftOff.getByRole('link', { name: /Or start something new/ }).click();
await leftOff.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
await leftOff.waitForTimeout(800);
if (/Step 1 of 6/.test(await leftOff.locator('body').innerText()))
  ok('starting something new starts at step 1');
else bad('starting something new starts at step 1');

const onlyOne = await leftOff.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  const current = await fetch('http://localhost:8000/api/sessions/current', { headers }).then((r) =>
    r.json(),
  );
  const me = await fetch('http://localhost:8000/api/me', { headers }).then((r) => r.json());
  return { step: current?.step?.ordinal, left: me.fullSessionsLeft };
});
if (onlyOne.step === 1) ok('and it is the only one open');
else bad('and it is the only one open', JSON.stringify(onlyOne));
if (onlyOne.left === spentAfter - 1) ok(`and it did cost another (${String(onlyOne.left)} left)`);
else bad('and it did cost another', JSON.stringify(onlyOne));

await leftOff.close();

// ------------------------------------------------- 3b2. where the focus goes
//
// `aria-disabled`, not `disabled`, on Continue — the rule this repository
// already applied to the console's Publish and "Mark as reviewed" and to the
// journal's "Load older", and not to the screen the same section calls the
// sharpest case. A `disabled` button leaves the tab order, so the press that
// disables it has nowhere to leave the focus.
//
// Measured before the fix: pressing Continue made `document.activeElement`
// `<body>` while the turn was out, and on a **failed** turn it stayed there —
// there is no advance to put it back, so somebody on a keyboard or a screen
// reader is returned to the top of the document with an error on screen.
//
// The label already changes to "Sending…", so the announcement is the
// button's own name. What this asserts is that the name changes under the
// focus rather than the focus vanishing.
console.log('\n3b2. A press does not throw the focus away');

const focusPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const focusEmail = `focus+${String(Date.now())}@example.com`;
await focusPage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await focusPage.getByRole('button', { name: 'Create an account instead' }).click();
await focusPage.getByLabel('Name').fill('Keyboard');
await focusPage.getByLabel('Email').fill(focusEmail);
await focusPage.getByLabel('Password').fill(PASSWORD);
await focusPage.getByRole('button', { name: 'Create my account' }).click();
await focusPage.waitForURL('**/welcome/consent', { timeout: 20000 });
const focusBoxes = focusPage.locator('input[type=checkbox]');
await focusBoxes.nth(0).check();
await focusBoxes.nth(1).check();
await focusPage.getByRole('button', { name: /Continue|Saving/ }).click();
await focusPage.waitForURL('**/welcome/voice', { timeout: 20000 });

await focusPage.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await focusPage.waitForTimeout(2500);

// Where focus is, by what it is rather than by a selector: the button's text
// changes to "Sending…" under it, which is the point.
const focusedOn = () =>
  focusPage.evaluate(() => {
    const el = document.activeElement;
    if (el === null) return 'null';
    return `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 20)}`;
  });

await focusPage.locator('textarea').first().fill('Something happened and it stayed with me');

// Held open, so the in-flight state can be looked at rather than guessed.
let heldTurn = null;
await focusPage.route('**/turns', (route) => {
  heldTurn = route;
});

const continueButton = focusPage.locator('button', { hasText: /^Continue$/ }).first();
await continueButton.focus();
await continueButton.click();
await focusPage.waitForTimeout(1200);

const during = await focusedOn();
if (/^button:/.test(during)) ok(`the focus stays on the button while the turn is out (${during})`);
else bad('the focus stays on the button while the turn is out', during);

// And the half that does not heal itself. A turn that advances moves focus to
// the new question; a turn that fails has nowhere to move it, so if the press
// threw it away it is gone.
if (heldTurn !== null) await heldTurn.abort().catch(() => undefined);
await focusPage.unroute('**/turns');
await focusPage.waitForTimeout(2500);

const afterFailure = await focusedOn();
if (/^button:/.test(afterFailure)) ok(`and after the turn fails (${afterFailure})`);
else bad('and after the turn fails', afterFailure);

const saidSo = await focusPage.locator('body').innerText();
if (/not been sent|Could not reach|try again/i.test(saidSo)) ok('with the failure on screen');
else bad('with the failure on screen', saidSo.slice(0, 300));

// The answer is still in the box to retry, which is the other half of a failed
// turn and is what makes keeping the focus worth anything.
const stillInTheBox = await focusPage.locator('textarea').first().inputValue();
if (stillInTheBox.includes('stayed with me')) ok('and what was typed still there to retry');
else bad('and what was typed still there to retry', JSON.stringify(stillInTheBox));

await focusPage.close();

// A reply dropped on the way back used to cost the user a whole step: the
// client re-sent the same words, nothing in the request said which question
// they answered, and they were recorded against the *next* step — whose
// question was then never answered by anybody. On mobile data that is not an
// edge case, so it is worth proving in a real browser and not only in a unit
// test.
console.log('\n3c. A reply lost on the way back');

const lossy = await browser.newPage({ viewport: { width: 390, height: 844 } });
const unlucky = `lossy+${String(Date.now())}@example.com`;
await lossy.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await lossy.getByRole('button', { name: 'Create an account instead' }).click();
await lossy.getByLabel('Name').fill('Bad Signal');
await lossy.getByLabel('Email').fill(unlucky);
await lossy.getByLabel('Password').fill('correct-horse-battery-staple');
await lossy.getByRole('button', { name: 'Create my account' }).click();
await lossy.waitForURL('**/welcome/consent', { timeout: 15000 });
const lossyBoxes = lossy.locator('input[type=checkbox]');
await lossyBoxes.nth(0).check();
await lossyBoxes.nth(1).check();
await lossy.getByRole('button', { name: /Continue|Saving/ }).click();
await lossy.waitForURL('**/welcome/voice', { timeout: 15000 });
await lossy.getByRole('button', { name: 'Keep it silent' }).click();
await lossy.waitForURL('**/app', { timeout: 15000 });

await lossy.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await lossy.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});

// Let the first turn reach the server and then drop the reply, which is what a
// train tunnel does. `route.fetch()` performs the request for real; the abort
// that follows is the only thing the page ever learns about it.
const SAID = 'My manager dismissed my work in front of the team';
let swallowed = false;
await lossy.route('**/turns', async (route) => {
  if (swallowed) {
    await route.continue();
    return;
  }
  swallowed = true;
  await route.fetch();
  await route.abort('connectionaborted');
});

await lossy.locator('textarea, input[type=text]').first().fill(SAID);
await lossy
  .locator('button', { hasText: /^(Continue|Sending)/ })
  .first()
  .click();
await lossy.waitForTimeout(1800);

const lost = await lossy.locator('body').innerText();
if (swallowed) ok('the turn reached the server and the reply was dropped');
else bad('the turn reached the server and the reply was dropped');
// The screen cannot know the turn landed, so it is still on step 1 — which is
// precisely the state that used to send the same words in as step 2's answer.
if (/Step 1 of 6/.test(lost)) ok('the screen is still on step 1, as it must be');
else bad('the screen is still on step 1, as it must be', lost.slice(0, 300));

const stillTyped = await lossy.locator('textarea, input[type=text]').first().inputValue();
if (stillTyped === SAID) ok('and what was typed is still in the box to try again');
else bad('and what was typed is still in the box to try again', stillTyped);

// The retry. Same words, same step, and this time the reply arrives.
await lossy
  .locator('button', { hasText: /^(Continue|Sending)/ })
  .first()
  .click();
await lossy.waitForTimeout(2000);

const recovered = await lossy.locator('body').innerText();
if (/Step 2 of 6/.test(recovered)) ok('the retry resyncs the screen to step 2');
else bad('the retry resyncs the screen to step 2', recovered.slice(0, 400));

const boxAfter = await lossy.locator('textarea, input[type=text]').first().inputValue();
if (boxAfter === '') ok('and the box is cleared, since those words are not step 2’s answer');
else bad('and the box is cleared, since those words are not step 2’s answer', boxAfter);

const once = await lossy.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const current = await fetch('http://localhost:8000/api/sessions/current', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return { step: current?.step?.ordinal, whatHappened: current?.data?.whatHappened };
});
if (once.step === 2) ok('the server advanced exactly one step for one answer');
else bad('the server advanced exactly one step for one answer', JSON.stringify(once));
if (once.whatHappened === SAID) ok('and recorded those words once, against step 1');
else bad('and recorded those words once, against step 1', JSON.stringify(once));

await lossy.unroute('**/turns');
await lossy.close();

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

// The journal is paged. Checked at the API level with a small page size
// rather than by seeding twenty sessions: the turns endpoint is throttled to
// 30 a minute on purpose, and 20 sessions is 120 turns. The screen's "Load
// older" uses the same cursor as the admin queue's "Load more", which
// `e2e/admin.mjs` exercises against a queue that really does hold 60 flags.
const EXTRA = 3;
console.log(`\n4b. Paging (${String(EXTRA)} more sessions, page size 2)`);
const paging = await page.evaluate(async (n) => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Quick sessions, finished the way a person would: the journal row is the
  // server's to write, not this script's.
  const seeded = [];
  for (let i = 0; i < n; i += 1) {
    const started = await fetch('http://localhost:8000/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'quick' }),
    });
    if (!started.ok) return { error: `starting a session: ${String(started.status)}` };
    const session = await started.json();
    seeded.push(session.id);

    for (const utterance of [
      `Seeded session ${String(i)} happened like this`,
      'I can see how I took it',
      'angry',
      'A memory from when I was nine',
      'I am not good enough',
      'I let that belief go',
    ]) {
      const turn = await fetch(`http://localhost:8000/api/sessions/${session.id}/turns`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ utterance }),
      });
      if (turn.status === 409) break;
      if (!turn.ok) return { error: `taking a turn: ${String(turn.status)}` };
    }
  }

  const read = async (query) => {
    const r = await fetch(`http://localhost:8000/api/journal?${query}`, { headers });
    if (!r.ok) return { error: `reading the journal: ${String(r.status)}` };
    return r.json();
  };

  const first = await read('limit=2');
  if (first.error !== undefined) return first;
  const second = await read(`limit=2&cursor=${String(first.nextCursor)}`);
  if (second.error !== undefined) return second;
  const bounded = await read('limit=nonsense');
  if (bounded.error !== undefined) return bounded;

  return {
    seeded,
    total: first.total,
    firstPage: first.items.length,
    secondPage: second.items.length,
    overlap: first.items.filter((a) => second.items.some((b) => b.id === a.id)).length,
    defaultedPage: bounded.items.length,
  };
}, EXTRA);

if (paging.error !== undefined) {
  bad('the journal pages', paging.error);
} else {
  if (paging.total > 2) ok(`the journal holds more than one page (${String(paging.total)})`);
  else bad('the journal holds more than one page', JSON.stringify(paging));
  if (paging.firstPage === 2 && paging.secondPage === 2) ok('each page is the size asked for');
  else bad('each page is the size asked for', JSON.stringify(paging));
  if (paging.overlap === 0) ok('two pages share no entry');
  else bad('two pages share no entry', `${String(paging.overlap)} shared`);
  // A nonsense limit falls back to the default rather than to one row.
  if (paging.defaultedPage > 2) ok('a nonsense page size falls back to the default');
  else bad('a nonsense page size falls back to the default', String(paging.defaultedPage));
}

// ------------------------------------------------- 4b2. which sessions were quick
//
// The journal is the only record of what the weekly allowance was spent on:
// Free gets three full sessions a week and unlimited quick ones, and when they
// run out the screen says "No full sessions left this week". This screen is
// where somebody would go to see which three. The phone's journal labelled a
// quick session on both the list and the entry; the web's labelled neither, on
// either. The designs label a quick one and leave a full one as the ordinary
// case, which is why this asserts both directions rather than only the label.
//
// By this point the account holds exactly one full session — section 3's, run
// through the screens — and the quick ones this section just seeded, so the
// oldest row is the full one and every other row is quick.
console.log('\n4b2. The journal says which sessions were quick');

await page.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const captions = await page.locator('a[href^="/app/journal/"]').allInnerTexts();
const labelled = captions.filter((c) => /·\s*Quick/.test(c)).length;

if (captions.length < 2)
  bad('the journal has both kinds of session on screen', String(captions.length));
else if (labelled === captions.length - 1)
  ok(
    `every quick session is labelled, and the full one is not (${String(labelled)} of ${String(captions.length)})`,
  );
else
  bad(
    'every quick session is labelled, and the full one is not',
    `${String(labelled)} of ${String(captions.length)} labelled`,
  );

// The oldest row is section 3's full session. Asserted by position rather than
// by counting again, so a label applied to every kind goes red here too.
const oldest = captions.at(-1) ?? '';
if (!/·\s*Quick/.test(oldest)) ok('the full session carries no kind label');
else bad('the full session carries no kind label', oldest);

// And the entry screen, which had the same omission.
const quickRow = page.locator('a[href^="/app/journal/"]').first();
await quickRow.click();
await page.waitForTimeout(1500);
const quickEntry = await text();
if (/QUICK SESSION/.test(quickEntry)) ok('the entry screen names a quick session');
else bad('the entry screen names a quick session', quickEntry.slice(0, 300));

// And the rating it was given. The entry screen read
// `calmerRating === 'yes' ? ' · FELT CALMER' : ''`, so a session rated "a
// little" said nothing at all here while the phone's entry screen said "A
// little calmer" about the same row — a rating somebody gave, visible on one
// surface and not the other. The three answers are offered side by side on the
// summary screen a moment earlier.
//
// Rated through the API on a session section 4b already seeded, rather than by
// finishing another: a new journal row would shift the counts this section and
// section 7b assert on.
const rated =
  paging.seeded === undefined || paging.seeded.length === 0
    ? { error: 'no seeded session to rate' }
    : await page.evaluate(async (id) => {
        const token = window.localStorage.getItem('stillpoint.token.v1');
        const r = await fetch(`http://localhost:8000/api/sessions/${id}/rating`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rating: 'a_little' }),
        });
        if (!r.ok) return { error: `rating: ${String(r.status)}` };
        const journal = await fetch('http://localhost:8000/api/journal?limit=20', {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        }).then((x) => x.json());
        const entry = journal.items.find((e) => e.calmerRating === 'a_little');
        return entry === undefined
          ? { error: 'no entry came back rated a_little' }
          : { id: entry.id };
      }, paging.seeded.at(-1));

if (rated.error !== undefined) {
  bad('a session can be rated “a little”', rated.error);
} else {
  await page.goto(`${WEB}/app/journal/${String(rated.id)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const hedged = await text();
  if (/A LITTLE CALMER/.test(hedged)) ok('the entry screen says a session helped a little');
  else bad('the entry screen says a session helped a little', hedged.slice(0, 300));
  // Not the other sentence: "a little" is its own answer, and showing the
  // unhedged one would be putting words in somebody's mouth about their own
  // session.
  if (!/· FELT CALMER/.test(hedged)) ok('and does not call it calmer outright');
  else bad('and does not call it calmer outright', hedged.slice(0, 300));
}

// The pricing page promises "3 full sessions a week" on Free, and that quick
// sessions are unlimited. A promise the server does not keep is the same
// problem in either direction.
console.log('\n4c. The plan allowance');

const allowance = await page.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const start = (kind) =>
    fetch('http://localhost:8000/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind }),
    });

  // Earlier sections have already started several full sessions this week, so
  // the fourth onwards must be refused.
  //
  // Each one is answered, because an untouched session is handed back rather
  // than replaced: starting repeatedly without saying anything is one attempt
  // and costs one session, which is the whole point of that rule. Spending the
  // allowance means having used the sessions.
  let refused = null;
  for (let i = 0; i < 6 && refused === null; i += 1) {
    const r = await start('full');
    if (r.status === 402) {
      refused = await r.json();
      break;
    }
    if (!r.ok) return { error: `starting a full session: ${String(r.status)}` };
    const session = await r.json();
    await fetch(`http://localhost:8000/api/sessions/${session.id}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        utterance: 'Something happened at work that I keep turning over',
        step: session.step?.id ?? null,
      }),
    });
  }

  // And a quick one, with the full allowance spent.
  const quick = await start('quick');
  const me = await fetch('http://localhost:8000/api/me', { headers }).then((r) => r.json());

  return {
    refused,
    quickStatus: quick.status,
    quickKind: quick.ok ? (await quick.json()).kind : null,
    left: me.fullSessionsLeft,
    perWeek: me.fullSessionsPerWeek,
  };
});

if (allowance.refused !== null)
  ok(`a fourth full session is refused (402, limit ${String(allowance.refused.limit)})`);
else bad('a fourth full session is refused', JSON.stringify(allowance));
if (allowance.refused?.quickStillAllowed === true)
  ok('the refusal says a quick session is still available');
else bad('the refusal says a quick session is still available');
if (allowance.quickStatus === 201 && allowance.quickKind === 'quick')
  ok('a quick session starts with the full allowance spent');
else bad('a quick session starts with the full allowance spent', JSON.stringify(allowance));
if (allowance.left === 0 && allowance.perWeek === 3) ok('the profile says none are left of three');
else bad('the profile says none are left of three', JSON.stringify(allowance));

// And the screen offers the quick session rather than a dead end.
await page.goto(`${WEB}/session`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const dead = await page.locator('body').innerText();
if (/this week’s full sessions/i.test(dead)) ok('the session screen explains, rather than failing');
else bad('the session screen explains', dead.slice(0, 300));
if ((await page.getByRole('link', { name: 'Start a quick session' }).count()) > 0)
  ok('and offers a quick session');
else bad('and offers a quick session');

await page.goto(`${WEB}/session?kind=quick`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});
if (/Step 1 of 6/.test(await page.locator('body').innerText())) ok('and that quick session runs');
else bad('and that quick session runs', (await page.locator('body').innerText()).slice(0, 300));

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

/*
 * The crisis numbers, which this screen did not have.
 *
 * The phone's settings screen has rendered `helplinesFor(profile.country)`
 * under "If you need someone now" all along and the web's rendered nothing, so
 * a person looking for a number outside a session had nowhere on this surface
 * to find one. And `apps/desktop`'s Help menu has an item with that exact
 * label which navigates **here** — so on the desktop, "If you need someone
 * now" landed on a page of voice preferences and two delete buttons.
 *
 * Asserted with the country's own numbers and against the other market's, the
 * way the consent gate is, because the failure this guards is not an absent
 * section but a section with somebody else's numbers in it.
 */
if (/9-8-8|988/.test(set) && /\b911\b/.test(set))
  ok('and the crisis numbers, with this account’s own country');
else bad('and the crisis numbers, with this account’s own country', set.slice(-600));
if (!/14416|Tele-MANAS/.test(set)) ok('and not another market’s');
else bad('and not another market’s', set.slice(-600));

// A `tel:` link rather than text, which is the whole point of the shared
// `HelplineLink`: the desktop shell passes `tel:` to the OS on purpose, and a
// number nobody can press is a number on a poster.
const dialable = await page.locator('a[href^="tel:"]').count();
if (dialable >= 2) ok(`and each one is dialable (${String(dialable)} tel: links)`);
else bad('and each one is dialable', `${String(dialable)} tel: links`);
await page.locator('select').nth(2).selectOption('never');
await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const sharing = await page.locator('select').nth(2).inputValue();
if (sharing === 'never') ok('a changed preference survives a reload');
else bad('a changed preference survives a reload', sharing);

// And the preference does something, which it did not. All three choices were
// stored, validated and printed back, and no code in either language read the
// column: "Share every session" shared nothing and "Never share" blocked
// nothing, because the per-entry toggle took whatever it was sent.
await page.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => document.querySelector('a[href^="/app/journal/"]') !== null,
  null,
  {
    timeout: 15000,
  },
);
await page.locator('a[href^="/app/journal/"]').first().click();
const locked = await page
  .waitForFunction(() => /Sharing is off in settings/.test(document.body.innerText), null, {
    timeout: 15000,
  })
  .then(
    () => true,
    () => false,
  );
const entryText = await text();

if (locked) ok('with sharing off, the entry says so');
else bad('with sharing off, the entry says so', entryText.slice(-400));
if (!/Share with coach/.test(entryText)) ok('and offers no button the server would refuse');
else bad('and offers no button the server would refuse', entryText.slice(-400));

// The server is what holds it, not the screen: a sharing rule a client can
// skip by calling the API directly is not a rule.
const refused = await page.evaluate(async (api) => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const page1 = await fetch(`${api}/journal?limit=1`, { headers }).then((r) => r.json());
  const id = page1.items?.[0]?.id;
  const on = await fetch(`${api}/journal/${String(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sharedWithCoach: true }),
  });
  const after = await fetch(`${api}/journal/${String(id)}`, { headers }).then((r) => r.json());
  return {
    status: on.status,
    message: (await on.json()).message ?? '',
    shared: after.sharedWithCoach,
  };
}, API);

if (refused.status === 409) ok('and the server refuses it too (409)');
else bad('and the server refuses it too', JSON.stringify(refused));
if (refused.shared === false) ok('and the entry stayed unshared');
else bad('and the entry stayed unshared', JSON.stringify(refused));
if (/Never share/.test(refused.message)) ok('and says which setting did it');
else bad('and says which setting did it', refused.message);

// Back to asking, so the rest of this script sees the ordinary screen.
await page.goto(`${WEB}/app/settings`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('select').length >= 3, null, {
  timeout: 15000,
});
await page.locator('select').nth(2).selectOption('ask_each_time');
await page.waitForTimeout(1000);

// The budget must never gate the screen. Checked by spending it and then
// saying something that must stop the session: a rate limit in front of this
// route would refuse the request before anything looked at what it said, and
// then the helplines never appear.
console.log('\n6b. A spent budget does not silence the screen');
const spent = await page.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const open = async () =>
    fetch('http://localhost:8000/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'quick' }),
    }).then((r) => r.json());

  const turn = (id, utterance) =>
    fetch(`http://localhost:8000/api/sessions/${id}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ utterance }),
    });

  /*
   * Spend it, across as many sessions as that takes.
   *
   * This used to open one quick session and send up to forty thin answers into
   * it, and it **passed on leftovers**: the budget is 30 a minute keyed on the
   * account, and one session's turns are bounded — after a step's guide turns
   * are used the session moves on, and once it is finished every further turn
   * is a 409, not a 429. So whether the budget ran out inside one session
   * depended entirely on how much of it earlier sections of this script had
   * already spent in the same minute.
   *
   * It went red the day a new section was added above, which added about
   * twenty-five seconds of wall clock and let that window roll over: a full
   * budget of 30, a session that cannot spend 30, zero refusals, and a check
   * reporting "the budget was never spent" about a budget that was working.
   * Passing for a reason other than the one it names is the failure this whole
   * file keeps finding.
   *
   * So a 409 opens another quick session rather than ending the loop. Quick
   * sessions are unlimited by design, so this costs the account nothing, and
   * `POST /sessions` ending whatever was open is exactly what is wanted here.
   */
  let id = (await open()).id;
  let refusals = 0;
  let sent = 0;
  let sessions = 1;

  while (sent < 80 && refusals < 2) {
    const r = await turn(id, 'no');
    sent += 1;
    if (r.status === 429) {
      refusals += 1;
      continue;
    }
    if (r.status === 409) {
      id = (await open()).id;
      sessions += 1;
    }
  }

  if (refusals === 0)
    return {
      error: `the budget was never spent: ${String(sent)} turns across ${String(sessions)} sessions`,
    };

  // And now the one request that must not be refused. The 429s above do not
  // end a session, so this goes into the one that is still open.
  const crisis = await turn(id, 'I want to kill myself');
  const body = await crisis.json();

  return {
    refusals,
    sent,
    sessions,
    status: crisis.status,
    ended: body.ended,
    endReason: body.endReason,
    numbers: (body.safety?.helplines ?? []).map((h) => h.number),
  };
});

if (spent.error !== undefined) {
  bad('the budget can be spent', spent.error);
} else {
  ok(
    `ordinary answers are refused once the budget is spent (${String(spent.refusals)} refusals after ${String(spent.sent)} turns across ${String(spent.sessions)} sessions)`,
  );
  if (spent.status === 200) ok('the crisis utterance is not refused');
  else bad('the crisis utterance is not refused', String(spent.status));
  if (spent.ended === true && spent.endReason === 'safety_stop')
    ok('it still stops the session for safety');
  else bad('it still stops the session for safety', JSON.stringify(spent));
  if (spent.numbers.includes('988') && spent.numbers.includes('911'))
    ok('the helplines are still given');
  else bad('the helplines are still given', spent.numbers.join(', '));
}

// ------------------------------------------------- 7. the safety stop
console.log('\n7. The safety stop is the server’s, not the browser’s');

// A quick session, because the earlier sections have spent this account's full
// allowance for the week. The kind makes no difference to what is being checked
// here: the screen runs before the guide whatever kind of session it is.

// Counted before, not assumed: earlier sections of this script leave journal
// rows of their own, and what is being checked is that the stop adds none.
await page.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rowsBeforeStop = await page.locator('a[href^="/app/journal/"]').count();
await page.goto(`${WEB}/session?kind=quick`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Starting…'), null, {
  timeout: 15000,
});

const requests = [];
page.on('request', (r) => {
  if (r.url().includes('/api/')) requests.push(`${r.method()} ${r.url().replace(/^.*\/api/, '')}`);
});

// First, the same words with the request dying on the way out — a tunnel,
// which section 3c already shows is not an edge case on mobile data. The
// server never hears this one, so it cannot stop anything, raise a flag or
// send a helpline: what the screen used to do was print "Could not reach
// Stillpoint. Check your connection and try again." to somebody who had just
// said they were going to kill themselves, and nothing else.
//
// What it does now is offer a number from the local phrase screen. This is not
// the stop and must never become it — the session stays open, no flag exists,
// and the retry below is what reaches the server and does all three.
await page.route('**/turns', (route) => route.abort());
await page.locator('textarea, input[type=text]').first().fill('I want to kill myself');
await page
  .locator('button', { hasText: /^(Continue|Next)/ })
  .first()
  .click();
const offered = await page
  .waitForFunction(() => /That answer has not been sent/.test(document.body.innerText), null, {
    timeout: 15000,
  })
  .then(
    () => true,
    () => false,
  );
const unsent = await text();
await page.unroute('**/turns');

if (offered) ok('an answer that never left still gets a crisis number');
else bad('an answer that never left still gets a crisis number', unsent.slice(0, 500));
if (/988/.test(unsent) && /\b911\b/.test(unsent)) ok('and it is this account\u2019s own numbers');
else bad('and it is this account\u2019s own numbers', unsent.slice(0, 500));
// Not the stop. The server has not heard, so there is nothing to be terminal
// about, and the words are still there to send.
if (/Step \d of 6/.test(unsent)) ok('and the session is not treated as stopped');
else bad('and the session is not treated as stopped', unsent.slice(0, 500));

// And somebody is actually told about it.
//
// A number on the screen is only an offer to whoever can see the screen. This
// whole screen used to be in no live region at all — measured, not inferred:
// the error paragraph had no `role`, the crisis block had none, and every
// other screen in the product already marks its error as an alert. So a person
// using a screen reader typed that they wanted to kill themselves, the POST
// died, three phone numbers appeared, and they were told none of it.
//
// Asserted on the ARIA, because that is what is assertable here: there is no
// screen reader in this container, so what this proves is that the numbers are
// in an assertive live region and the failure sentence is an alert — the
// mechanics that decide whether anything is announced, rather than the
// announcement itself.
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
  const tel = document.querySelector('a[href^="tel:"]');
  const sentence = [...document.querySelectorAll('p')].find((el) =>
    /not been sent/.test(el.textContent ?? ''),
  );
  return {
    number: tel !== null && inAlert(tel),
    sentence: sentence !== undefined && inAlert(sentence),
  };
});
if (announced.number) ok('and the number is in a live region, so it is announced');
else bad('and the number is in a live region', 'the crisis numbers are in no live region');
if (announced.sentence) ok('and so is the sentence that says the answer did not send');
else bad('and so is the sentence that says the answer did not send');

// The wording itself, which had drifted from what this file's own comment
// quoted and from what the phone says. "Something went wrong. Please try
// again." tells somebody nothing they can act on; the request not arriving is
// exactly the thing "check your connection" is for, and `apps/mobile`'s
// `describe.ts` already said so — so the two surfaces disagreed about one
// failure, which is the one thing that file's note promises they do not.
if (/Could not reach Stillpoint/.test(unsent)) ok('and the failure says what to try');
else bad('and the failure says what to try', unsent.slice(0, 300));

// Now let it through, and the server does the real thing.
await page
  .locator('button', { hasText: /^(Continue|Next)/ })
  .first()
  .click();
await page.waitForTimeout(2000);

const stopped = await text();
// Canada's numbers, because a new account is assumed to be in Canada — the
// first market. India's are still shown to an account whose country is `IN`;
// `CanadianHelplinesTest` covers both, and this asserts what the person who
// just registered actually sees.
if (/988/.test(stopped)) ok('the crisis screen shows the 988 crisis line');
else bad('the crisis screen shows the 988 crisis line', stopped.slice(0, 400));
if (/APPELLE|1-866-277-3553/.test(stopped))
  ok('and Québec’s line, which answers instead of 988 there');
else bad('and Québec’s line', stopped.slice(0, 400));
if (/\b911\b/.test(stopped)) ok('and the emergency number, 911 here rather than 112');
else bad('and the emergency number, 911 here rather than 112', stopped.slice(0, 400));
if (!/Step \d of 6/.test(stopped)) ok('the session is over, no step is shown');
else bad('the session is over, no step is shown');

// The pause replaced the whole screen, including the button that was pressed
// to reach it — so focus fell to `<body>` and nothing said the screen had
// changed. Measured before the fix, on the one screen in this product where
// that matters most: the person had just said they were not safe, the three
// numbers that answer that were on screen, and focus was at the top of the
// document with no announcement. Taking focus is what says so, and it reads
// the title out as it lands.
/*
 * axe over the pause, in both palettes — the one screen state `a11y.mjs`
 * cannot reach.
 *
 * That script audits every route in both palettes and the pause was not among
 * them, because it is not a route: `/session` renders the six steps, and the
 * pause only exists after the server has ended a session for safety. So the
 * screen with the crisis numbers on it had never been audited on either
 * surface, and it was failing on both. Measured here: the helpline's detail
 * line was **4.39:1** on `positive`, from an `opacity: 0.9` that blends
 * `accent-ink` white down to `#eaf2ef`. The phone's copy of the same
 * component was worse and `e2e/mobile.mjs` has that half.
 *
 * It runs here rather than being folded into `a11y.mjs` because reaching this
 * screen means typing crisis language into the page and letting the server
 * stop the session, which is this script's section 7 and nothing else's.
 */
{
  const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.waitForTimeout(300);
    await page.addScriptTag({ content: AXE });
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
        },
        rules: { 'target-size': { enabled: true } },
      }),
    );
    const nodes = result.violations.reduce((n, v) => n + v.nodes.length, 0);
    if (nodes === 0) ok(`the pause passes axe in ${theme}`);
    else
      bad(
        `the pause passes axe in ${theme}`,
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
  // Back to the palette the rest of the section measures in.
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
}

const paused = await page.evaluate(() => ({
  tag: document.activeElement?.tagName ?? null,
  text: (document.activeElement?.textContent ?? '').trim().slice(0, 60),
}));
if (paused.tag === 'H1' && paused.text !== '')
  ok(`the pause takes focus, so it is announced (“${paused.text}”)`);
else bad('the pause takes focus, so it is announced', JSON.stringify(paused));
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
const rowsAfterStop = await page.locator('a[href^="/app/journal/"]').count();
if (rowsAfterStop === rowsBeforeStop)
  ok(`the safety-stopped session left no journal entry (still ${String(rowsAfterStop)})`);
else
  bad(
    'the safety-stopped session left no journal entry',
    `${String(rowsBeforeStop)} → ${String(rowsAfterStop)}`,
  );

// Erasing the account. Last, because it ends the account this script has been
// using — which is also the honest place to check it from.
console.log('\n7b. Deleting the account');

await page.goto(`${WEB}/app/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

const journalBefore = await page.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const r = await fetch('http://localhost:8000/api/journal?limit=1', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  return r.ok ? (await r.json()).total : -1;
});
if (journalBefore > 0) ok(`the account has ${String(journalBefore)} entries to lose`);
else bad('the account has entries to lose', String(journalBefore));

/*
 * "Delete my journal", double-tapped.
 *
 * Here because it consumes the journal, and the count above is what it is
 * measured against. The handler is a loop — one delete per entry, each
 * authorised on its own — and it guarded on the entry count, which does not
 * change until every request has come back. So two overlapping loops both
 * walked the same list: measured against a seeded account with eight entries,
 * three taps sent ten deletes, the extra two answering 404, and the screen
 * then read "Some entries were not deleted." about a journal that had been
 * deleted entirely — on the screen whose own copy promises "It is removed for
 * good".
 *
 * The 404 was the second half of it. Laravel's model-binding message is "No
 * query results for model [App\Models\JournalEntry] 01m43t…", `APP_DEBUG` does
 * not change it, and `describe()` prefers the API's own words — rightly, which
 * is why the fix is that the API stops saying that rather than that the
 * surface stops listening.
 */
const journalDeletes = [];
const countJournalDeletes = (request) => {
  if (request.method() === 'DELETE' && /\/journal\/[^/]+$/.test(request.url()))
    journalDeletes.push(request.url());
};
page.on('request', countJournalDeletes);

await page.getByRole('button', { name: 'Delete my journal' }).click();
await page.waitForTimeout(400);
// A handle, not a locator: the label becomes "Deleting…" while the loop runs,
// so a role+name locator stops resolving after the first tap and the second
// would never be sent — the check would pass having measured nothing.
const wipe = await page.locator('button', { hasText: /^Delete everything$/ }).elementHandle();
await wipe.click();
await wipe.click({ force: true });
await wipe.click({ force: true });
await page.waitForTimeout(4000);
page.off('request', countJournalDeletes);

if (journalDeletes.length === journalBefore)
  ok(`a double-tapped journal delete sends one request per entry (${String(journalBefore)})`);
else
  bad(
    'a double-tapped journal delete sends one request per entry',
    `${String(journalBefore)} entries, ${String(journalDeletes.length)} deletes`,
  );

/*
 * The two assertions below are guards rather than demonstrations, and the
 * difference is worth knowing before trusting them.
 *
 * Measured with both halves of the fix reverted: the count assertion above
 * goes red (6 entries, 8 deletes) and these two stayed **green**. The
 * duplicate delete's 404 did set the failure line, and then the surviving
 * loop's success path cleared it — so whether the false sentence is on screen
 * when this reads it depends on which loop finishes last. That makes the
 * count the assertion to trust here, and these two cheap insurance against a
 * future where the race lands the other way.
 *
 * The 404's wording is pinned where it can be pinned:
 * `apps/api/tests/Feature/NotFoundSaysNothingTest.php`, with `app.debug` off.
 */
const afterWipe = await page.locator('body').innerText();
if (!/Some entries were not deleted/.test(afterWipe))
  ok('and it is not told that some entries survived');
else bad('and it is not told that some entries survived', afterWipe.slice(0, 300));
if (!/No query results for model/.test(afterWipe))
  ok('and no screen shows Laravel naming a model it could not find');
else bad('and no screen shows Laravel naming a model it could not find', afterWipe.slice(0, 300));

const savedToken = await page.evaluate(() => window.localStorage.getItem('stillpoint.token.v1'));

await page.getByRole('button', { name: 'Delete my account' }).click();
await page.waitForTimeout(400);

// The confirmation is not a single tap: a password and the typed word, both
// required by the server rather than by this screen.
const confirmButton = page.locator('button', { hasText: /^Delete everything$/ });
if (await confirmButton.isDisabled()) ok('the delete button is inert until both are given');
else bad('the delete button is inert until both are given');

await page.getByLabel('Your password').fill('correct-horse-battery-staple');
await page.getByLabel(/Type DELETE to confirm/).fill('yes please');
await page.waitForTimeout(300);
if (await confirmButton.isDisabled()) ok('and a wrong confirmation does not enable it');
else bad('and a wrong confirmation does not enable it');

// The server refuses it too, whatever the screen allows.
const serverRefusal = await page.evaluate(async () => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const r = await fetch('http://localhost:8000/api/me', {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password: 'wrong-password', confirm: 'DELETE' }),
  });
  return r.status;
});
if (serverRefusal === 422) ok('the server refuses a wrong password (422)');
else bad('the server refuses a wrong password', String(serverRefusal));

await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
await page.waitForTimeout(300);
await confirmButton.click();
await page.waitForURL('**/welcome', { timeout: 15000 });
ok('deleting lands back at the start');

// The token is dead, and so is everything it reached.
const afterErasure = await page.evaluate(async (token) => {
  const headers = { Accept: 'application/json', Authorization: `Bearer ${String(token)}` };
  const me = await fetch('http://localhost:8000/api/me', { headers });
  const journal = await fetch('http://localhost:8000/api/journal', { headers });
  return {
    me: me.status,
    journal: journal.status,
    stored: window.localStorage.getItem('stillpoint.token.v1'),
  };
}, savedToken);

if (afterErasure.me === 401) ok('the token no longer works');
else bad('the token no longer works', String(afterErasure.me));
if (afterErasure.journal === 401) ok('and neither does it reach the journal');
else bad('and neither does it reach the journal', String(afterErasure.journal));
if (afterErasure.stored === null) ok('and the browser is signed out');
else bad('and the browser is signed out');

// ------------------------------------------------- 8. sign out
console.log('\n8. Signed out');
// The deletion above already signed this browser out, which is the stronger
// version of the same check: the app must be unreachable without a token,
// whether it was handed back or revoked underneath it.
await page.goto(`${WEB}/app`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
if (page.url().includes('/welcome')) ok('the app is unreachable without a token');
else bad('the app is unreachable without a token', page.url());

// ------------------------------------------------- 9. a forgotten password
console.log('\n9. A forgotten password is not a lost journal');

/*
 * The one path back into an account, and nothing drove it.
 *
 * `PasswordResetApiTest` covers the API thoroughly — thirteen cases,
 * including that the journal survives. What nothing covered was the two
 * screens and the seam between them and the API: the link the notification
 * mints carries the address as `?email=`, and the reset screen reads that
 * parameter and shows "This link is incomplete" without it. A mismatch there
 * would lock out everybody who forgot a password, and the API tests would all
 * still be green.
 *
 * It also proves the only path that exists today. `MAIL_MAILER=log` — no mail
 * provider has been chosen (`LAUNCH.md` item 2) — so the link is written to
 * `storage/logs/laravel.log` and a person gets back into their account by
 * somebody reading it out of a log file. This does exactly that, which is the
 * check for "is that link actually usable": Laravel's log mailer writes a
 * rendered message, and a token wrapped across two lines would be a link
 * nobody could follow.
 *
 * Its own account, because the one above has been erased by this point.
 */
const forgetful = `forgot+${String(Date.now())}@example.com`;
const resetPage = await browser.newPage({ viewport: { width: 390, height: 844 } });

await resetPage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await resetPage.getByRole('button', { name: 'Create an account instead' }).click();
await resetPage.getByLabel('Name').fill('Forgot It');
await resetPage.getByLabel('Email').fill(forgetful);
await resetPage.getByLabel('Password').fill(PASSWORD);
await resetPage.getByRole('button', { name: 'Create my account' }).click();
await resetPage.waitForURL('**/welcome/consent', { timeout: 15000 });
const resetBoxes = resetPage.locator('input[type=checkbox]');
await resetBoxes.nth(0).check();
await resetBoxes.nth(1).check();
await resetPage.getByRole('button', { name: /Continue|Saving/ }).click();
await resetPage.waitForURL('**/welcome/voice', { timeout: 15000 });

// Something in the journal to still be there afterwards. Through the API,
// because the session flow is section 3's job and not this one's.
const wrote = await resetPage.evaluate(async (api) => {
  const token = window.localStorage.getItem('stillpoint.token.v1');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${String(token)}`,
  };
  const started = await fetch(`${api}/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'quick' }),
  });
  if (!started.ok) return { why: `starting: ${String(started.status)}` };
  const session = await started.json();
  for (const utterance of [
    'The thing I will want to read back later',
    'I can see my part in it',
    'hurt',
    'A morning when I was nine',
    'I am not taken seriously',
    'I am letting that go',
  ]) {
    const turn = await fetch(`${api}/sessions/${String(session.id)}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ utterance }),
    });
    if (turn.status === 409) break;
    if (!turn.ok) return { why: `a turn: ${String(turn.status)}` };
  }
  const journal = await fetch(`${api}/journal`, { headers }).then((r) => r.json());
  return { token, total: journal.total ?? 0 };
}, API);

if (wrote.total >= 1) ok(`the account has something to lose (${String(wrote.total)} entry)`);
else bad('the account has something to lose', JSON.stringify(wrote));

// Signed out, which is the state somebody who has forgotten their password is
// in. Cleared rather than pressed, because the sign-out button is section 8's.
await resetPage.evaluate(() => {
  window.localStorage.clear();
});

// ---- the answer must not say whether the address has an account ----------
//
// `forgotPassword()` throws the broker's result away on purpose: it
// distinguishes "sent" from "no such user", and this product's user list is
// people who went looking for help with being upset. Asserted through the
// screen, which is where the leak would be visible.
const askFor = async (address) => {
  await resetPage.goto(`${WEB}/welcome/forgot`, { waitUntil: 'networkidle' });
  await resetPage.getByLabel('Email').fill(address);
  await resetPage.getByRole('button', { name: /Email me a link|One moment/ }).click();
  await resetPage
    .waitForFunction(() => /Check your inbox|could not/i.test(document.body.innerText), null, {
      timeout: 15000,
    })
    .catch(() => undefined);
  // The address is in the sentence, so it is taken out before comparing: what
  // must match is everything else.
  return (await resetPage.locator('body').innerText())
    .replace(/\s+/g, ' ')
    .split(address)
    .join('<the address>')
    .trim();
};

const unknown = await askFor(`nobody+${String(Date.now())}@example.com`);

// How far the log had been written before this account asked, so the link can
// be found by *when* it was written rather than by what is in it. Keying on
// the address would make a link with no `?email=` unfindable, and then
// dropping that parameter — the seam this section is here for — would fail as
// "no link for this address" instead of naming the parameter.
const log = fileURLToPath(new URL('../apps/api/storage/logs/laravel.log', import.meta.url));
const already = existsSync(log) ? statSync(log).size : 0;

const known = await askFor(forgetful);

if (known === unknown && /Check your inbox/.test(known))
  ok('the answer is the same whether or not the address has an account');
else
  bad(
    'the answer is the same whether or not the address has an account',
    `known: ${known.slice(0, 180)} / unknown: ${unknown.slice(0, 180)}`,
  );

// ---- the link, out of the log, the way a person gets one today ------------
const written = existsSync(log) ? readFileSync(log, 'utf8').slice(already) : '';
const links = [...written.matchAll(/https?:\/\/\S*?\/welcome\/reset\/\S+/g)].map((m) =>
  m[0].replace(/[)\]"'<>].*$/, ''),
);
const link = links.at(-1);

if (link === undefined) {
  bad(
    'the link is in the log, whole',
    existsSync(log) ? 'nothing was written when this account asked' : 'no laravel.log at all',
  );
} else {
  ok(`the link is in the log, whole (…${link.slice(-24)})`);

  const parsed = new URL(link);
  // It must point at the web app, not the API: the token is spent on a web
  // screen. `APP_FRONTEND_URL` is what decides, and a wrong one here is a
  // reset nobody can complete.
  if (parsed.origin === new URL(WEB).origin) ok(`and at the web app (${parsed.origin})`);
  else bad('and at the web app', `${parsed.origin}, where the web app is ${new URL(WEB).origin}`);

  // The parameter the screen reads. Without it the screen says "This link is
  // incomplete" and the account is unreachable.
  if (parsed.searchParams.get('email') === forgetful)
    ok('and carries the address the screen needs');
  else bad('and carries the address the screen needs', String(parsed.searchParams.get('email')));

  const fresh = `${PASSWORD}-reset`;
  await resetPage.goto(link, { waitUntil: 'networkidle' });
  await resetPage.waitForTimeout(1200);

  const onReset = await resetPage.locator('body').innerText();
  if (/Choose a new password/.test(onReset)) ok('the screen takes the link');
  else bad('the screen takes the link', onReset.slice(0, 300));

  await resetPage.getByLabel('New password').fill(fresh);
  await resetPage.getByLabel('And again').fill(fresh);
  await resetPage.getByRole('button', { name: /Change my password|One moment/ }).click();
  await resetPage.waitForTimeout(3000);

  // It does **not** sign them in, and that is the rule rather than a rough
  // edge: a reset is what you do when you think somebody else has your
  // account, so it revokes every token including this browser's. The screen
  // says so, and asserting it is how that stays true.
  const changed = await resetPage.locator('body').innerText();
  if (/password is changed/i.test(changed)) ok('the password changes');
  else bad('the password changes', changed.slice(0, 300));
  if (/signed out, including this browser/i.test(changed))
    ok('and it says the browser was signed out too, which it was');
  else bad('and it says the browser was signed out too', changed.slice(0, 300));

  // So the new password has to be used. Through the sign-in screen, because
  // that is the trip somebody actually makes.
  await resetPage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await resetPage.getByLabel('Email').fill(forgetful);
  await resetPage.getByLabel('Password').fill(fresh);
  await resetPage.getByRole('button', { name: /^Sign in$/ }).click();
  await resetPage.waitForTimeout(3000);

  // On the token, not the URL: signing in carries on through the welcome flow —
  // voice setup comes after consent — so landing on `/welcome/voice` *is* being
  // signed in, and a URL check reads it as not being.
  const backIn = await resetPage.evaluate(() => window.localStorage.getItem('stillpoint.token.v1'));
  if (typeof backIn === 'string' && backIn !== '')
    ok(`the new password gets them back in (at ${new URL(resetPage.url()).pathname})`);
  else
    bad(
      'the new password gets them back in',
      (await resetPage.locator('body').innerText()).slice(0, 300),
    );

  // The whole point of the section, and the reason a reset is safe to offer at
  // all: the `encrypted` casts use the application's `APP_KEY`, not anything
  // derived from the password. Key the encryption to the password and this
  // route becomes a shredder.
  await resetPage.goto(`${WEB}/app/journal`, { waitUntil: 'networkidle' });
  await resetPage.waitForTimeout(2000);
  const after = await resetPage.locator('body').innerText();
  if (after.includes('read back later')) ok('and the journal is still readable, word for word');
  else bad('and the journal is still readable, word for word', after.slice(0, 400));

  // A reset is what you do when you think somebody else has your account, so
  // it revokes every token — this browser's old one included — and the old
  // password stops working.
  const afterwards = await resetPage.evaluate(
    async ([api, address, old, now, stale]) => {
      const tryPassword = async (password) => {
        const r = await fetch(`${api}/auth/login`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: address, password }),
        });
        return r.status;
      };
      const withStale = await fetch(`${api}/me`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${String(stale)}` },
      });
      return { old: await tryPassword(old), now: await tryPassword(now), stale: withStale.status };
    },
    [API, forgetful, PASSWORD, fresh, wrote.token],
  );

  if (afterwards.old === 422) ok('the old password no longer works (422)');
  else bad('the old password no longer works', String(afterwards.old));
  if (afterwards.now === 200) ok('and the new one does');
  else bad('and the new one does', String(afterwards.now));
  if (afterwards.stale === 401) ok('and the token from before the reset is revoked (401)');
  else bad('and the token from before the reset is revoked', String(afterwards.stale));
}

await finish(() => browser.close());
