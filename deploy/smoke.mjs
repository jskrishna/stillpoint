/**
 * Does a deployment actually serve a session?
 *
 *     node deploy/smoke.mjs                              # the local stack
 *     node deploy/smoke.mjs https://api.example.com/api  # a real API
 *     node deploy/smoke.mjs https://api.example.com/api https://example.com
 *
 * The second argument is where the web app is served. Give it and the checks
 * below also answer the question this script could not: **would a browser be
 * allowed to use this deployment at all.** Left out, the local default is
 * tried and skipped with a note if nothing is there, because the whole point
 * of this script is that it runs when you have only a URL.
 *
 * The `docker` job proves the three images build, that the stack comes up,
 * that the migrations run against the MySQL the compose file starts, and that
 * the API answers 401 through nginx and PHP-FPM. None of that is a session.
 * This is the difference between "this will start" and "somebody can use it":
 * register, consent, start, answer, and — the one that matters — say something
 * that must stop the session and get a crisis number back.
 *
 * It is plain HTTP with no browser, so it runs anywhere `node` does, including
 * against the real deployment from a laptop. `e2e/` is the browser half and
 * needs three servers; this needs a URL.
 *
 * **It makes an account and then erases it.** The account is named so nobody
 * mistakes it for a person, and the last step deletes it through the same
 * guarded route a user would — so a pass leaves a deployment exactly as it
 * found it, apart from one safety flag, which is the one thing erasure is
 * meant to take and does. If it fails part-way the account survives, and the
 * output says which address to go and remove.
 *
 * What it deliberately does **not** do is create an admin or a coach. Neither
 * can be made through the API — `role` is not fillable on purpose — so a smoke
 * test that needed one would need a shell on the server, and this is the check
 * you run when you have only a URL.
 */

const base = (process.argv[2] ?? 'http://localhost:8000/api').replace(/\/$/, '');
/** Where the web app is served. See the note at the top about the default. */
const webGiven = process.argv[3] !== undefined || process.env.WEB_URL !== undefined;
const web = (process.argv[3] ?? process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const stamp = Date.now();
const email = `smoke-test-delete-me+${String(stamp)}@example.invalid`;
const password = 'smoke-test-not-a-real-password';

let failures = 0;
let token = null;

const ok = (what, detail = '') => {
  console.log(`  \x1b[32mok\x1b[0m   ${what}${detail === '' ? '' : ` — ${detail}`}`);
};
const bad = (what, detail = '') => {
  failures++;
  console.log(`  \x1b[31mBAD\x1b[0m  ${what}${detail === '' ? '' : ` — ${detail}`}`);
};
const note = (what) => {
  console.log(`  \x1b[33m··\x1b[0m   ${what}`);
};

async function call(method, path, body, { anonymous = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous && token !== null) headers['Authorization'] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { status: 0, body: {}, error: String(e) };
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text === '' ? {} : JSON.parse(text);
  } catch {
    // A deployment that answers HTML to an `Accept: application/json` request
    // is a misconfigured one, and the first 200 characters say which.
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

console.log(`\nStillpoint — does ${base} serve a session?\n`);

// -------------------------------------------------------------- 1. it is there
console.log('1. The API is answering, and authentication is on');

const guest = await call('GET', '/me', undefined, { anonymous: true });
if (guest.status === 401) ok('an unauthenticated request is refused (401)');
else if (guest.status === 0) bad('the API answered at all', guest.error ?? 'no response');
else bad('an unauthenticated request is refused', `got ${String(guest.status)}`);

if (guest.status === 0) {
  console.log('\nNothing else can be checked without an API. Stopping.\n');
  process.exit(1);
}

// ------------------------------------- 2. a browser would be allowed to use it
console.log('\n2. A browser would be allowed to use it');

/**
 * The failure this script could not see, and the one most likely on a first
 * deployment.
 *
 * Everything else here is plain `fetch` with no `Origin` header, which is not
 * a browser and is therefore never subject to CORS or to a content policy. So
 * a stack can build, start, answer 401 from the API and 200 from the web app,
 * serve a whole session to `node` — and show a signed-out person a screen where
 * every request is blocked. Measured: with `CORS_ALLOWED_ORIGINS` naming a
 * different deployment entirely, all four of those still passed.
 *
 * Two ways that happens, and they are the two things fixed at build or boot
 * rather than at request time:
 *
 *  - **`NEXT_PUBLIC_API_URL` is baked into the web image**, because the browser
 *    is what calls the API. An image pointed at a different API cannot be
 *    repointed; it has to be rebuilt. `apps/web/next.config.ts` builds the
 *    policy's `connect-src` from that same variable, so the served
 *    `Content-Security-Policy` header is an authoritative statement of which
 *    API this app was built to call — no bundle to parse.
 *  - **`CORS_ALLOWED_ORIGINS` is a list and never `*`**, so the API has to name
 *    the web app's origin. A preflight is exactly what a browser asks, and the
 *    answer is a header.
 */
const apiOrigin = new URL(base).origin;
const webOrigin = new URL(web).origin;

const page = await fetch(`${web}/welcome`, { signal: AbortSignal.timeout(20000) }).catch(
  () => null,
);

if (page === null || !page.ok) {
  const why = page === null ? 'nothing answered' : `got ${String(page.status)}`;
  if (webGiven) bad(`the web app answers at ${web}`, why);
  else note(`no web app at ${web} (${why}) — pass its URL to check this.`);
} else {
  ok('the web app is served', web);

  // Which API the app was built to call, from the policy that is built from
  // the same variable. `'self'` is the right answer when the API is behind the
  // same origin, which a reverse proxy in front of both would do.
  const csp = page.headers.get('content-security-policy') ?? '';
  const connect = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('connect-src'));

  if (connect === undefined) {
    bad('the web app sends a content policy naming its API', csp === '' ? 'no policy at all' : csp);
  } else {
    const allows = connect.split(/\s+/).slice(1);
    const sameOrigin = apiOrigin === webOrigin && allows.includes("'self'");

    if (allows.includes(apiOrigin) || sameOrigin) {
      ok('and it was built to call this API', apiOrigin);
    } else {
      // The page will load and every request from it will be blocked. This is
      // the one that cannot be fixed by configuration: rebuild the image.
      bad(
        'and it was built to call this API',
        `built for ${allows.join(' ')} — not ${apiOrigin}. Rebuild the web image with NEXT_PUBLIC_API_URL=${base}`,
      );
    }
  }

  // And the other direction: a preflight, which is what a browser sends first.
  const preflight = await fetch(`${base}/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: webOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);

  const allowed = preflight?.headers.get('access-control-allow-origin') ?? null;
  if (allowed === webOrigin) {
    ok('and the API lets that origin call it', allowed);
  } else {
    bad(
      'and the API lets that origin call it',
      `allows ${JSON.stringify(allowed)} — add ${webOrigin} to CORS_ALLOWED_ORIGINS`,
    );
  }
}

// ------------------------------------------------------------ 3. a real account
console.log('\n3. Somebody can make an account and consent');

const registered = await call(
  'POST',
  '/auth/register',
  { name: 'Smoke Test — delete me', email, password },
  { anonymous: true },
);
if (registered.status === 201 && typeof registered.body.token === 'string') {
  token = registered.body.token;
  ok('registration works');
} else {
  bad(
    'registration works',
    `got ${String(registered.status)} ${JSON.stringify(registered.body).slice(0, 200)}`,
  );
  console.log('\nNothing else can be checked without an account. Stopping.\n');
  process.exit(1);
}

const profile = await call('GET', '/me');
if (profile.status === 200) ok('the token works', `country ${String(profile.body.country)}`);
else bad('the token works', `got ${String(profile.status)}`);

// The consent gate is the server's, so a session must be refused before it.
const tooSoon = await call('POST', '/sessions', { kind: 'full' });
if (tooSoon.status === 403) ok('a session is refused before consent (403)');
else bad('a session is refused before consent', `got ${String(tooSoon.status)}`);

const consented = await call('POST', '/me/consent', { accepted: ['understands', 'adult'] });
if (consented.status >= 200 && consented.status < 300) ok('consent is accepted');
else
  bad(
    'consent is accepted',
    `got ${String(consented.status)} ${JSON.stringify(consented.body).slice(0, 160)}`,
  );

// ------------------------------------------------------------- 4. a session runs
console.log('\n4. A session starts, and the guide has something to say');

const started = await call('POST', '/sessions', { kind: 'full' });
if (started.status === 201) ok('a session starts');
else
  bad(
    'a session starts',
    `got ${String(started.status)} ${JSON.stringify(started.body).slice(0, 200)}`,
  );

const sessionId = started.body.id;
const firstQuestion = typeof started.body.say === 'string' ? started.body.say : '';
if (firstQuestion.trim() !== '') ok('step 1 has a question', `"${firstQuestion.slice(0, 60)}…"`);
else bad('step 1 has a question', 'the guide said nothing at step 1');

if (typeof sessionId === 'string') {
  const turn = await call('POST', `/sessions/${sessionId}/turns`, {
    utterance: 'A colleague talked over me in a meeting and I have been stewing on it.',
    step: started.body.step?.id ?? null,
  });

  if (turn.status >= 200 && turn.status < 300) ok('a turn is accepted');
  else
    bad(
      'a turn is accepted',
      `got ${String(turn.status)} ${JSON.stringify(turn.body).slice(0, 200)}`,
    );

  const ordinal = turn.body.step?.ordinal ?? null;
  if (ordinal === 2) ok('and it advanced to step 2');
  else bad('and it advanced to step 2', `step is ${JSON.stringify(ordinal)}`);

  const secondQuestion = typeof turn.body.say === 'string' ? turn.body.say : '';
  if (secondQuestion.trim() !== '') {
    ok('step 2 has a question too', `"${secondQuestion.slice(0, 60)}…"`);
  } else {
    // Not a failure of the deployment — a thing left to do on it. Only step 1,
    // step 4 and step 5's question are specified in the designs, and the rest
    // live in a draft protocol version that an admin reads and publishes at
    // `/admin/protocol`. Production publishes nothing by itself, on purpose.
    note('step 2 has no question yet — no protocol version is published.');
    note('   Publish one at /admin/protocol, or the guide stops talking after');
    note('   step 1. `php artisan stillpoint:draft-step-copy` writes the draft.');
  }
}

// ---------------------------------------------------------- 5. the safety stop
console.log('\n5. The safety stop — the one that has to work');

const risky = await call('POST', '/sessions', { kind: 'quick' });
const riskyId = risky.body.id;

// Counted here, not before the start and not assumed to be zero. Starting this
// session is what ends the one above, as `user_stopped`, and that one *is*
// journalled — so a count taken any earlier is one row short and fails for the
// wrong reason. Both wrong versions were written before this one.
const before = await call('GET', '/journal');
const rowsBefore = Array.isArray(before.body.items) ? before.body.items.length : -1;

if (typeof riskyId !== 'string') {
  bad('a session to say it in', `got ${String(risky.status)}`);
} else {
  const stop = await call('POST', `/sessions/${riskyId}/turns`, {
    utterance: 'I want to kill myself',
    step: risky.body.step?.id ?? null,
  });

  if (stop.status >= 200 && stop.status < 300) ok('the turn was answered');
  else bad('the turn was answered', `got ${String(stop.status)}`);

  if (stop.body.endReason === 'safety_stop') ok('the server ended the session as a safety stop');
  else
    bad(
      'the server ended the session as a safety stop',
      `endReason ${JSON.stringify(stop.body.endReason)}`,
    );

  const numbers = (stop.body.safety?.helplines ?? []).map((h) => String(h.number));
  if (numbers.length > 0) ok('and sent helplines', numbers.join(', '));
  else bad('and sent helplines', 'the pause screen would have nothing to call');

  // Never the risk level, the category or the matched phrase: a user mid-crisis
  // has no use for "you tripped the self-harm rule", and a client that knows
  // the rule can be built to dodge it.
  const leaked = JSON.stringify(stop.body);
  if (!/"(level|category|matched)"/.test(leaked)) ok('and told the client nothing about the rule');
  else bad('and told the client nothing about the rule', 'the response names the rule');

  // An ended session is terminal. There is no resume path around a safety stop.
  const again = await call('POST', `/sessions/${riskyId}/turns`, { utterance: 'are you there' });
  if (again.status === 409) ok('another turn on it is refused (409)');
  else bad('another turn on it is refused', `got ${String(again.status)}`);

  const journal = await call('GET', '/journal');
  const rowsAfter = Array.isArray(journal.body.items) ? journal.body.items.length : -1;
  if (rowsAfter === rowsBefore) ok('and it wrote no journal row', `still ${String(rowsAfter)}`);
  else bad('and it wrote no journal row', `${String(rowsBefore)} → ${String(rowsAfter)}`);
}

// ------------------------------------------------------------ 6. clean up after
console.log('\n6. And it takes the account away again');

const erased = await call('DELETE', '/me', { password, confirm: 'DELETE' });
if (erased.status >= 200 && erased.status < 300) {
  ok('the smoke-test account is erased');
} else {
  bad('the smoke-test account is erased', `got ${String(erased.status)}`);
  console.log(`\n  Left behind: ${email} — remove it from /admin/users.`);
}

console.log('');
if (failures === 0) {
  console.log('\x1b[32mThis deployment serves a session, and stops one.\x1b[0m\n');
  process.exit(0);
}
console.log(`\x1b[31m${String(failures)} check(s) failed.\x1b[0m\n`);
process.exit(1);
