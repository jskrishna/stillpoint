import { WEB, launch } from './browser.mjs';
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
  for (let i = 0; i < n; i += 1) {
    const started = await fetch('http://localhost:8000/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'quick' }),
    });
    if (!started.ok) return { error: `starting a session: ${String(started.status)}` };
    const session = await started.json();

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
await page.locator('select').nth(2).selectOption('never');
await page.waitForTimeout(1000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const sharing = await page.locator('select').nth(2).inputValue();
if (sharing === 'never') ok('a changed preference survives a reload');
else bad('a changed preference survives a reload', sharing);

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

  const session = await fetch('http://localhost:8000/api/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'quick' }),
  }).then((r) => r.json());

  const turn = (utterance) =>
    fetch(`http://localhost:8000/api/sessions/${session.id}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ utterance }),
    });

  // Spend it: ordinary answers until the server starts refusing.
  let refusals = 0;
  for (let i = 0; i < 40; i += 1) {
    const r = await turn('no');
    if (r.status === 429) refusals += 1;
    if (r.status === 409) break;
    if (refusals >= 2) break;
  }
  if (refusals === 0) return { error: 'the budget was never spent' };

  // And now the one request that must not be refused.
  const crisis = await turn('I want to kill myself');
  const body = await crisis.json();

  return {
    refusals,
    status: crisis.status,
    ended: body.ended,
    endReason: body.endReason,
    numbers: (body.safety?.helplines ?? []).map((h) => h.number),
  };
});

if (spent.error !== undefined) {
  bad('the budget can be spent', spent.error);
} else {
  ok(`ordinary answers are refused once the budget is spent (${String(spent.refusals)} refusals)`);
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

await page.locator('textarea, input[type=text]').first().fill('I want to kill myself');
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

await finish(() => browser.close());
