#!/usr/bin/env node
/**
 * The deployment's own topology: nginx in front of PHP-FPM, with MySQL behind.
 *
 * **Why this exists.** The `docker` CI job builds the three images, brings the
 * stack up and runs `deploy/smoke.mjs` through nginx and PHP-FPM against the
 * MySQL the compose file starts. Nothing here could do any of that — the
 * Docker CLI is present with no daemon behind it — so `deploy/nginx.conf` and
 * `deploy/php.ini` were two files nothing in this container had ever executed,
 * and CI has been on a billing hold.
 *
 * It turns out most of it is reachable: `apt-get install nginx php8.3-fpm`
 * works here, the same way `mariadb-server` did (see `check-mysql.mjs`). What
 * this runs is the real `deploy/nginx.conf` with **three** lines substituted —
 * `listen`, `root`, `fastcgi_pass`, all three of which name the container's
 * filesystem or the compose service — and the real `deploy/php.ini` settings
 * handed to FPM. Everything else, `client_max_body_size` included, is the
 * deployment's own configuration.
 *
 * The substitution count is **asserted**, because a copy that silently stops
 * matching the real file would exercise something else entirely while looking
 * identical — the same reason `check-mysql.mjs` generates its phpunit config
 * rather than keeping one.
 *
 * **What it measures that nothing else can:**
 *
 * - `X-Powered-By` absent **with a real SAPI present**. `CLAUDE.md` says the
 *   ninth case of `ApiOriginIsLockedDownTest` "stays green in PHPUnit because
 *   there is no SAPI there to add it", so that one case has only ever been
 *   carried by an HTTP check. This is that check.
 * - **Each security header exactly once.** `deploy/nginx.conf` warns that
 *   putting them back at the edge would send each twice, because nginx's
 *   `add_header` appends. Counting them is the only way to see it.
 * - **`client_max_body_size`**, which `CLAUDE.md` calls "the one limit on a
 *   turn the application cannot see ... where no test reaches". Measured: a
 *   5MB body reaches the application and a 13MB body is refused 413 by nginx,
 *   before Laravel and so before the risk screen — which is the documented
 *   trade at this size and the reason not to lower it.
 * - And `deploy/smoke.mjs` end to end through the whole thing: register,
 *   consent, a session, a turn, and a crisis utterance that must stop the
 *   session and return helplines.
 *
 * **What it still does not cover**, and these are not small: the three images
 * are not built, `docker-compose.yml` is not exercised, the scheduler service
 * is not run, and TLS terminates nowhere. A green run here means the
 * deployment's *configuration* serves a session, not that the deployment does.
 *
 *   pnpm run check:edge
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const API = `${ROOT}/apps/api`;

const PORT = process.env.EDGE_PORT ?? '8081';
const FPM_PORT = process.env.EDGE_FPM_PORT ?? '9000';
const DATABASE = process.env.EDGE_DATABASE ?? 'stillpoint_edge';
const USER = process.env.MYSQL_USER ?? 'stillpoint';
const PASSWORD = process.env.MYSQL_PASSWORD ?? 'stillpoint';

const dim = (s) => `\u001b[2m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;
const say = (s) => {
  console.log(`${dim('[edge]')} ${s}`);
};

let failures = 0;
const ok = (what, detail = '') => {
  console.log(`  ${green('ok')}   ${what}${detail === '' ? '' : ` — ${detail}`}`);
};
const bad = (what, detail = '') => {
  failures += 1;
  console.log(`  ${red('BAD')}  ${what}${detail === '' ? '' : ` — ${detail}`}`);
};

const has = (c) => spawnSync('sh', ['-c', `command -v ${c}`], { stdio: 'ignore' }).status === 0;

if (!has('nginx') || !has('php-fpm8.3')) {
  console.error(
    red('nginx and PHP-FPM are not both here.') +
      '\n\n  apt-get update && apt-get install -y --no-install-recommends nginx php8.3-fpm\n\n' +
      'The update is not optional on this container — without it a package 404s\n' +
      'on a stale index, which is what made `check-mysql.mjs` say the same thing.',
  );
  process.exit(1);
}

/*
 * The run directory is **not** in the scratchpad, and that is a measured
 * decision rather than tidiness.
 *
 * nginx workers run as `www-data` (see `/etc/nginx/nginx.conf`), and a body
 * larger than `client_body_buffer_size` is spooled to a temp file by the
 * worker. With those paths under this session's scratchpad, whose ancestors
 * are `drwx------` root, the worker could not traverse to them: nginx answered
 * **500** for every body over about 16KB, and the error was visible only in a
 * server-level `error_log /dev/stderr` that a daemonised nginx throws away. It
 * read exactly like a deployment that breaks on large requests. It was this
 * sandbox.
 */
const run = mkdtempSync(join(tmpdir(), 'stillpoint-edge-'));
for (const d of ['body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) mkdirSync(join(run, d));
spawnSync('chmod', ['-R', '777', run]);

const stop = () => {
  spawnSync('nginx', ['-s', 'quit', '-p', run, '-c', join(run, 'nginx.conf')], { stdio: 'ignore' });
  const pid = join(run, 'fpm.pid');
  if (existsSync(pid)) spawnSync('sh', ['-c', `kill $(cat ${pid}) 2>/dev/null`]);
};
process.on('exit', stop);

// ---------------------------------------------------------------- the config
const real = readFileSync(`${ROOT}/deploy/nginx.conf`, 'utf8');
let server = real
  .replace('listen 80;', `listen ${PORT};`)
  .replace('root /var/www/html/public;', `root ${API}/public;`)
  .replace('fastcgi_pass api:9000;', `fastcgi_pass 127.0.0.1:${FPM_PORT};`);

const substituted = real.split('\n').filter((l, i) => l !== server.split('\n')[i]).length;
if (substituted !== 3) {
  console.error(
    red(
      `Expected to substitute 3 lines of deploy/nginx.conf, substituted ${String(substituted)}.`,
    ) +
      '\nThat file changed shape. Fix the three replacements above rather than\n' +
      'letting this run against a config that is no longer the deployment’s.',
  );
  process.exit(1);
}
/*
 * The body limit is **read out of the config** rather than written here twice.
 *
 * This used to guard on the literal `12m` and exit if it was missing, and
 * trying to break it found two faults: tightening the number made the script
 * *refuse to run* rather than measure the tightened limit, so the measurement
 * below was never proved able to fail; and a hardcoded 12 is a second copy of
 * a number that belongs to the deployment.
 *
 * So the probe sizes follow whatever the config says, and the number itself is
 * a separate assertion with its own reason — the one `CLAUDE.md` cares about:
 * "Tightening it to something that sounds tidy is how it would become one
 * again."
 */
const limitMatch = /client_max_body_size\s+(\d+)m;/.exec(server);
if (limitMatch?.[1] === undefined) {
  console.error(
    red('The generated config has no client_max_body_size, which is half of what this checks.'),
  );
  process.exit(1);
}
const limitMb = Number(limitMatch[1]);

writeFileSync(
  join(run, 'nginx.conf'),
  `# Generated from deploy/nginx.conf by scripts/check-edge.mjs — three lines\n` +
    `# substituted (listen, root, fastcgi_pass). Everything else is the real file.\n` +
    `worker_processes 1;\npid ${join(run, 'nginx.pid')};\nevents { worker_connections 64; }\n` +
    `http {\n  include /etc/nginx/mime.types;\n  access_log off;\n` +
    `  client_body_temp_path ${join(run, 'body')};\n  proxy_temp_path ${join(run, 'proxy')};\n` +
    `  fastcgi_temp_path ${join(run, 'fastcgi')};\n  uwsgi_temp_path ${join(run, 'uwsgi')};\n` +
    `  scgi_temp_path ${join(run, 'scgi')};\n${server}\n}\n`,
);
// `include fastcgi_params` in the real file resolves against the config's own
// directory, so the file is linked in rather than that line being rewritten.
spawnSync('ln', ['-sf', '/etc/nginx/fastcgi_params', join(run, 'fastcgi_params')]);

// ------------------------------------------------------------------- php-fpm
const ini = readFileSync(`${ROOT}/deploy/php.ini`, 'utf8')
  .split('\n')
  .filter((l) => /^(expose_php|memory_limit|post_max_size|upload_max_filesize|zend\.)/.test(l))
  .join('\n');
if (!ini.includes('expose_php=Off')) {
  console.error(
    red('deploy/php.ini no longer sets expose_php=Off, which is one of the things this checks.'),
  );
  process.exit(1);
}
writeFileSync(join(run, 'php.ini'), `${ini}\n`);

writeFileSync(
  join(run, 'fpm.conf'),
  `[global]\npid = ${join(run, 'fpm.pid')}\nerror_log = ${join(run, 'fpm.log')}\ndaemonize = yes\n\n` +
    `[app]\nuser = www-data\ngroup = www-data\nlisten = 127.0.0.1:${FPM_PORT}\n` +
    `pm = static\npm.max_children = 4\nclear_env = no\n` +
    `env[DB_CONNECTION] = mysql\nenv[DB_HOST] = 127.0.0.1\nenv[DB_PORT] = 3306\n` +
    `env[DB_DATABASE] = ${DATABASE}\nenv[DB_USERNAME] = ${USER}\nenv[DB_PASSWORD] = ${PASSWORD}\n` +
    `env[CACHE_STORE] = file\n`,
);

// ------------------------------------------------------------------ database
say(`preparing ${DATABASE}`);
const adminArgs = process.env.MYSQL_HOST === undefined ? [] : ['-h', process.env.MYSQL_HOST];
try {
  execFileSync('mysql', [
    ...adminArgs,
    '-e',
    `CREATE DATABASE IF NOT EXISTS \`${DATABASE}\` CHARACTER SET utf8mb4;` +
      `CREATE USER IF NOT EXISTS '${USER}'@'localhost' IDENTIFIED BY '${PASSWORD}';` +
      `GRANT ALL ON \`${DATABASE}\`.* TO '${USER}'@'localhost';FLUSH PRIVILEGES;`,
  ]);
} catch {
  console.error(red('No MySQL answering. `pnpm run check:mysql` starts one and explains how.'));
  process.exit(1);
}

const env = {
  ...process.env,
  DB_CONNECTION: 'mysql',
  DB_HOST: '127.0.0.1',
  DB_DATABASE: DATABASE,
  DB_USERNAME: USER,
  DB_PASSWORD: PASSWORD,
  DB_URL: '',
};
if (
  spawnSync('php', ['artisan', 'migrate:fresh', '--seed', '--seeder=DemoSeeder', '--force'], {
    cwd: API,
    env,
    stdio: 'ignore',
  }).status !== 0
) {
  console.error(red('Could not migrate and seed the edge database.'));
  process.exit(1);
}

// PHP-FPM runs as www-data and Laravel writes its cache and logs.
spawnSync('chmod', ['-R', 'a+rwX', `${API}/storage`, `${API}/bootstrap/cache`]);

// -------------------------------------------------------------------- the run
say('starting php-fpm and nginx with the deployment’s own configuration');
if (
  spawnSync('php-fpm8.3', ['--fpm-config', join(run, 'fpm.conf'), '-c', join(run, 'php.ini')], {
    stdio: 'ignore',
  }).status !== 0
) {
  console.error(red(`php-fpm would not start. ${join(run, 'fpm.log')}`));
  process.exit(1);
}
if (
  spawnSync('nginx', ['-p', run, '-c', join(run, 'nginx.conf')], { stdio: 'inherit' }).status !== 0
) {
  console.error(red('nginx would not start.'));
  process.exit(1);
}
spawnSync('sh', ['-c', 'sleep 2']);

const url = `http://127.0.0.1:${PORT}`;
const head = (path = '/up') =>
  execFileSync('curl', ['-s', '-i', `${url}${path}`], { encoding: 'utf8' }).split('\r\n');

console.log('\n1. What the edge answers with');
let headers;
try {
  headers = head();
} catch {
  bad('the stack answers at all');
  process.exit(1);
}
const count = (name) => headers.filter((l) => l.toLowerCase().startsWith(`${name}:`)).length;

if (headers[0]?.includes('200') === true) ok('the health route answers', headers[0]);
else bad('the health route answers', headers[0] ?? 'nothing');

// Exactly once each, not merely present: `add_header` appends.
for (const h of [
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
]) {
  const n = count(h);
  if (n === 1) ok(`${h}, exactly once`);
  else
    bad(
      `${h}, exactly once`,
      `${String(n)} copies — nginx’s add_header appends rather than replaces`,
    );
}

// The case PHPUnit cannot carry, because there is no SAPI there to add it.
if (count('x-powered-by') === 0) ok('no X-Powered-By, with a real SAPI present');
else
  bad(
    'no X-Powered-By, with a real SAPI present',
    'expose_php and header_remove() are both meant to stop this',
  );

const serverHeader = headers.find((l) => l.toLowerCase().startsWith('server:')) ?? '';
if (/^server:\s*nginx$/i.test(serverHeader.trim()))
  ok('the edge names no version', serverHeader.trim());
else bad('the edge names no version', serverHeader.trim());

console.log('\n2. client_max_body_size, which no test reaches');
const status = (bytes) =>
  execFileSync(
    'sh',
    [
      '-c',
      `head -c ${String(bytes)} /dev/zero | tr '\\0' 'a' > ${join(run, 'body.bin')}; ` +
        `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' ` +
        `--data-binary @${join(run, 'body.bin')} ${url}/api/sessions/x/turns`,
    ],
    { encoding: 'utf8' },
  ).trim();

// Half the configured limit must reach the application, and a megabyte over
// it must not — both derived from the config, so this measures the limit that
// is set rather than one written down here as well.
const underMb = Math.max(1, Math.floor(limitMb / 2));
const under = status(underMb * 1_000_000);
if (under === '401')
  ok(`a ${String(underMb)}MB body reaches the application`, '401, not refused at the edge');
else
  bad(
    `a ${String(underMb)}MB body reaches the application`,
    `${under} — the edge is refusing bodies the config says it should pass`,
  );

const overMb = limitMb + 1;
const over = status(overMb * 1_000_000);
if (over === '413')
  ok(
    `a ${String(overMb)}MB body is refused by nginx`,
    '413, before Laravel and so before the risk screen',
  );
else
  bad(
    `a ${String(overMb)}MB body is refused by nginx`,
    `${over} — client_max_body_size is not where the config says`,
  );

/*
 * And the number has not been tightened. Its own assertion, because the two
 * above would pass just as well against a 1m limit — they follow the config —
 * and a tightened limit is the documented hazard: nginx refusing a body with
 * 413 is a refusal in front of the risk screen, one layer further out than
 * the `max:5000` that answered 422 to a 5,222-character disclosure.
 */
if (limitMb === 12)
  ok('the limit is still 12m', 'about 2,400 times the length that was the problem');
else
  bad(
    'the limit is still 12m',
    `${String(limitMb)}m — lowering this puts a refusal in front of the risk screen; ` +
      'raise it deliberately, with deploy/php.ini’s post_max_size',
  );

console.log('\n3. And it serves a session, and stops one');
const smoke = spawnSync('node', [`${ROOT}/deploy/smoke.mjs`, `${url}/api`], {
  stdio: 'inherit',
  env: { ...process.env, WEB_URL: '' },
});
if (smoke.status === 0) ok('deploy/smoke.mjs passed through nginx and PHP-FPM');
else bad('deploy/smoke.mjs passed through nginx and PHP-FPM', 'see its output above');

console.log(
  `\n${dim('What a green run here means')}\n` +
    `  does: the deployment's own nginx and php.ini serve a session and stop one,\n` +
    `  over HTTP, against MySQL, with the headers and the body limit measured.\n` +
    `  does not: the three images are not built, docker-compose.yml is not\n` +
    `  exercised, the scheduler service does not run, and TLS terminates nowhere.\n` +
    `  It is the configuration that is verified, not the deployment.`,
);

stop();
rmSync(run, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
