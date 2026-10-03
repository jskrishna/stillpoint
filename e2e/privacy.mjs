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
