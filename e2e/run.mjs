/**
 * The whole end-to-end suite, in one command.
 *
 *     pnpm run e2e              # build what is missing, then all six scripts
 *     pnpm run e2e flow admin   # just those two
 *     pnpm run e2e --no-build   # servers and scripts only, nothing rebuilt
 *     pnpm run e2e --keep       # leave the servers up afterwards
 *
 * Six manual steps across three servers is why this suite got skipped, and
 * skipping it is expensive: it is the only thing that executes `apps/mobile`
 * at all, and the only thing that runs the safety stop against a real server
 * in a real browser. `e2e/README.md` has what each script covers and what it
 * does not.
 *
 * It is **not** what CI runs. CI brings its own servers up against a MySQL
 * service and runs each script as its own step, so a failure in the coach's
 * sharing rule and a failure in the safety stop are different lines in the
 * log rather than one red job. This is the local convenience; the workflow is
 * the contract.
 *
 * Two things it does that the README told you to do by hand, because both have
 * cost a confusing afternoon:
 *
 *  - **`CACHE_STORE=file`.** The authenticated routes carry `throttle:120,1`,
 *    which writes a counter to the cache on every request. With the cache in a
 *    sqlite database — the development default — those writes compete for the
 *    write lock with the data under test. Measured at 8 server workers, 33 of
 *    60 concurrent reads of `/admin/role-changes` came back 500 `database is
 *    locked`. It reads as a flaky console and it is configuration.
 *  - **It reseeds.** `DemoSeeder` makes the admin and the coach, which cannot
 *    be made through the API on purpose, and it publishes the draft step copy
 *    so the guide has something to say. A database left part-way through an
 *    earlier run is how a check once passed here and failed in CI.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** In the order they should run: cheapest signal first, slowest last. */
const SCRIPTS = ['flow', 'admin', 'coach', 'privacy', 'mobile', 'a11y'];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wanted = args.filter((a) => !a.startsWith('--'));
const scripts = wanted.length > 0 ? wanted : SCRIPTS;

const unknown = scripts.filter((s) => !SCRIPTS.includes(s));
if (unknown.length > 0) {
  console.error(`unknown script: ${unknown.join(', ')}\nknown: ${SCRIPTS.join(', ')}`);
  process.exit(2);
}

const log = (line) => {
  console.log(`\x1b[2m[e2e]\x1b[0m ${line}`);
};

/** Runs something to completion, inheriting stdio, and resolves its code. */
function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', cwd: root, ...options });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Starts something and leaves it running. */
function start(name, command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  const tail = [];
  const keep = (chunk) => {
    tail.push(String(chunk));
    // Enough to show why something did not come up, not the whole log.
    if (tail.length > 40) tail.shift();
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  child.on('error', keep);
  return { name, child, tail };
}

async function answers(url, expected) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return expected.includes(response.status);
  } catch {
    return false;
  }
}

/** Polls until every server answers, or gives up and says which did not. */
async function waitForServers(servers, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  const pending = new Map(servers.map((s) => [s.name, s]));

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [name, server] of [...pending]) {
      if (await answers(server.url, server.expect)) {
        log(`${name} is up`);
        pending.delete(name);
      }
      // A server that has exited is never coming up, so say so now rather
      // than after two minutes of polling a port nothing is listening on.
      if (server.process.child.exitCode !== null) {
        console.error(`\n[e2e] ${name} exited with ${String(server.process.child.exitCode)}:`);
        console.error(server.process.tail.join(''));
        return false;
      }
    }
    if (pending.size > 0) await new Promise((r) => setTimeout(r, 1000));
  }

  if (pending.size === 0) return true;
  for (const [name, server] of pending) {
    console.error(`\n[e2e] ${name} never answered on ${server.url}:`);
    console.error(server.process.tail.join(''));
  }
  return false;
}

const api = join(root, 'apps/api');
const env = {
  ...process.env,
  // See the note at the top. Not negotiable on sqlite.
  CACHE_STORE: 'file',
  // Several workers, because PHP's built-in server answers one connection at a
  // time and a browser holds several open on keep-alive.
  PHP_CLI_SERVER_WORKERS: '8',
};

async function build() {
  log('building packages');
  if ((await run('pnpm', ['run', 'build:packages'])) !== 0) return false;

  const webBuilt = existsSync(join(root, 'apps/web/.next/BUILD_ID'));
  if (!webBuilt || !flags.has('--no-build')) {
    log('building the web app');
    if ((await run('pnpm', ['--filter', '@stillpoint/web', 'run', 'build'])) !== 0) return false;
  }

  const mobileBuilt = existsSync(join(root, 'apps/mobile/dist/index.html'));
  const needsMobile = scripts.includes('mobile');
  if (needsMobile && (!mobileBuilt || !flags.has('--no-build'))) {
    log('building the mobile app’s web export');
    if ((await run('pnpm', ['--filter', '@stillpoint/mobile', 'run', 'build'])) !== 0) return false;
  }

  return true;
}

async function seed() {
  log('migrating and seeding the demo accounts');
  const code = await run(
    'php',
    ['artisan', 'migrate:fresh', '--seed', '--seeder=DemoSeeder', '--force'],
    { cwd: api, env },
  );
  return code === 0;
}

const started = [];

function shutDown() {
  for (const { name, child } of started) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      log(`stopped ${name}`);
    }
  }
}

process.on('SIGINT', () => {
  shutDown();
  process.exit(130);
});

async function main() {
  if (!flags.has('--no-build')) {
    if (!(await build())) return 1;
    if (!(await seed())) return 1;
  } else {
    log('--no-build: using whatever is already built and seeded');
  }

  const apiServer = start('the API', 'php', ['artisan', 'serve', '--port=8000', '--no-reload'], {
    cwd: api,
    env,
  });
  started.push(apiServer);

  const web = start('the web app', 'pnpm', [
    '--filter',
    '@stillpoint/web',
    'exec',
    'next',
    'start',
    '--port',
    '3000',
  ]);
  started.push(web);

  const servers = [
    { name: 'the API', url: 'http://127.0.0.1:8000/api/me', expect: [401], process: apiServer },
    { name: 'the web app', url: 'http://127.0.0.1:3000/welcome', expect: [200], process: web },
  ];

  if (scripts.includes('mobile')) {
    const mobile = start('the mobile export', 'python3', [
      '-m',
      'http.server',
      '4000',
      '--bind',
      '127.0.0.1',
      '--directory',
      join(root, 'apps/mobile/dist'),
    ]);
    started.push(mobile);
    servers.push({
      name: 'the mobile export',
      url: 'http://127.0.0.1:4000/',
      expect: [200],
      process: mobile,
    });
  }

  if (!(await waitForServers(servers))) {
    shutDown();
    return 1;
  }

  // Every script runs whatever any one of them does: a failure in the safety
  // stop and a failure in the coach's sharing rule are different news, and
  // stopping at the first would hide the second.
  const results = [];
  for (const name of scripts) {
    console.log(`\n\x1b[1m—— ${name}.mjs ——\x1b[0m`);
    const code = await run('node', [join(here, `${name}.mjs`)]);
    results.push({ name, code });
  }

  if (flags.has('--keep')) log('--keep: leaving the servers up');
  else shutDown();

  console.log('');
  for (const { name, code } of results) {
    const mark = code === 0 ? '\x1b[32mpass\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${mark}  ${name}.mjs`);
  }

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length === 0) {
    console.log(`\n${String(results.length)} of ${String(results.length)} passed.`);
    return 0;
  }
  console.log(`\n${String(failed.length)} of ${String(results.length)} failed.`);
  return 1;
}

process.exit(await main());
