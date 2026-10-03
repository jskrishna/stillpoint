/**
 * Refreshes the self-hosted webfonts.
 *
 * Run by hand, not by the build:
 *
 *     node apps/web/scripts/fetch-fonts.mjs
 *
 * The files it writes are committed. That is the whole point — the web app used
 * to link Google's CDN, which meant every visitor's IP and user-agent reached a
 * third party on every page of a product about being upset. The phone app has
 * always bundled its fonts; this makes the web match it.
 *
 * Doing it here rather than through `next/font/google` keeps the build off the
 * network as well: a build that needs fonts.googleapis.com is a build that can
 * fail for a reason nothing in this repository controls.
 *
 * Both families are OFL, and the licences sit beside the files.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const OUT = new URL('../public/fonts/', import.meta.url).pathname;

// Variable faces, the whole weight range the product uses, plus Newsreader's
// italic — which `<em>` would otherwise have the browser fake.
const QUERY =
  'family=Hanken+Grotesk:wght@400..700' +
  '&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600' +
  '&display=swap';

const css = execSync(
  `curl -sS -A ${JSON.stringify(UA)} ${JSON.stringify(`https://fonts.googleapis.com/css2?${QUERY}`)}`,
).toString();

// Only latin and latin-ext. Neither family carries Devanagari, so the other
// subsets would be bytes nobody's browser ever asks for.
const blocks = css.split('/*').slice(1);
const wanted = [];
for (const block of blocks) {
  const subset = block.slice(0, block.indexOf('*/')).trim();
  if (subset !== 'latin' && subset !== 'latin-ext') continue;

  const family = /font-family: '([^']+)'/.exec(block)?.[1];
  const style = /font-style: (\w+)/.exec(block)?.[1] ?? 'normal';
  const weight = /font-weight: ([^;]+)/.exec(block)?.[1].trim();
  const range = /unicode-range: ([^;]+)/.exec(block)?.[1].trim();
  const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
  if (!family || !url) continue;

  const name = `${family.toLowerCase().replace(/\s+/g, '-')}-${style}-${subset}.woff2`;
  execSync(
    `curl -sS -A ${JSON.stringify(UA)} ${JSON.stringify(url)} -o ${JSON.stringify(`${OUT}/${name}`)}`,
  );
  wanted.push({ family, style, weight, range, name });
}

const face = (f) => `@font-face {
  font-family: '${f.family}';
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${f.name}') format('woff2');
  unicode-range: ${f.range};
}`;

writeFileSync(`${OUT}/fonts.css`, `${wanted.map(face).join('\n\n')}\n`);
console.log(wanted.map((f) => `${f.name}  ${f.style} ${f.weight}`).join('\n'));
