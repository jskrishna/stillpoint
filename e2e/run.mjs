/**
 * The whole end-to-end suite, in one command.
 *
 *     pnpm run e2e              # build what is missing, then all six scripts
 *     pnpm run e2e flow admin   # just those two
 *     pnpm run e2e --no-build   # servers and scripts only, nothing rebuilt
 *     pnpm run e2e --keep       # leave the servers up afterwards
 *
 * And the same machinery with no checks, for showing somebody the product:
 *
 *     pnpm run demo             # seeded stack up, accounts printed, stays up
 *
 * That one exists because the first item in `LAUNCH.md` is a clinician reading
 * the risk screen, and to ask anybody that you have to be able to put the
 * product in front of them. It was six manual steps and knowing four logins.
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
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** In the order they should run: cheapest signal first, slowest last. */
const SCRIPTS = ['flow', 'admin', 'coach', 'privacy', 'mobile', 'desktop', 'a11y'];

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

/**
 * This machine's address on the local network, or null if it has none.
 *
 * `--lan` is for the one thing a phone cannot do, which is reach your
 * laptop's loopback. Measured before this existed: `php artisan serve
 * --port=8000 --no-reload` — what the line below starts — listens on
 * `127.0.0.1:8000` only, so loopback answered 401 and the same request to
 * this machine's own LAN address was **refused**. Meanwhile
 * `apps/mobile/.env.example` says to "serve the API on all interfaces", so
 * the two documents disagreed about the only path to a device test, and the
 * command the README gives was the one that could not get you there.
 */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }

  return null;
}

const lan = flags.has('--lan') ? lanAddress() : null;

if (flags.has('--lan') && lan === null) {
  // Loudly, because the alternative is `--lan` quietly behaving like an
  // ordinary run: every server on loopback, the phone refused, and nothing
  // in the output saying which of the two you got. That is the silent-skip
  // failure this suite has had twice.
  console.error('[e2e] --lan found no network address on this machine.');
  console.error('      Every interface is loopback or down, so there is no');
  console.error('      address a phone could reach. Check the network, or drop');
  console.error('      --lan to run on localhost.');
  process.exit(1);
}

const env = {
  ...process.env,
  // See the note at the top. Not negotiable on sqlite.
  CACHE_STORE: 'file',
  // Several workers, because PHP's built-in server answers one connection at a
  // time and a browser holds several open on keep-alive.
  PHP_CLI_SERVER_WORKERS: '8',
  /*
   * Under `--lan`, three values stop being localhost.
   *
   * `NEXT_PUBLIC_API_URL` is baked into the web bundle at **build** time —
   * the browser is what calls the API — so a `.next` built for localhost
   * serves a phone browser a bundle that calls a host it cannot reach.
   * That is why `--lan` rebuilds the web app rather than trusting what is
   * there, and why it is passed to the build and not only to the server.
   *
   * `CORS_ALLOWED_ORIGINS` has to name the LAN origin too, or the phone's
   * browser is refused by the rule that list exists for. The native app is
   * unaffected — it sends no `Origin` and is never subject to CORS — which
   * is exactly the asymmetry `deploy/smoke.mjs` is given an origin to catch.
   *
   * `APP_FRONTEND_URL` is where a password-reset link points, and a link to
   * localhost is one nobody can follow from a phone.
   */
  ...(lan === null
    ? {}
    : {
        NEXT_PUBLIC_API_URL: `http://${lan}:8000/api`,
        CORS_ALLOWED_ORIGINS: `http://${lan}:3000,http://localhost:3000,http://127.0.0.1:3000`,
        APP_FRONTEND_URL: `http://${lan}:3000`,
      }),
};

async function build() {
  log('building packages');
  if ((await run('pnpm', ['run', 'build:packages'])) !== 0) return false;

  const webBuilt = existsSync(join(root, 'apps/web/.next/BUILD_ID'));
  // `--lan` always rebuilds: `NEXT_PUBLIC_API_URL` is baked in, so a build
  // left over from a localhost run serves a phone a bundle calling a host it
  // cannot reach — and nothing about that build looks wrong. It is the stale
  // build directory this repository keeps being bitten by, with the staleness
  // in a string rather than in a missing file.
  if (!webBuilt || !flags.has('--no-build') || lan !== null) {
    log(lan === null ? 'building the web app' : `building the web app for ${lan}`);
    if ((await run('pnpm', ['--filter', '@stillpoint/web', 'run', 'build'], { env })) !== 0)
      return false;
  }

  const mobileBuilt = existsSync(join(root, 'apps/mobile/dist/index.html'));
  const needsMobile = scripts.includes('mobile') || flags.has('--demo');
  if (needsMobile && (!mobileBuilt || !flags.has('--no-build'))) {
    log('building the mobile app’s web export');
    if ((await run('pnpm', ['--filter', '@stillpoint/mobile', 'run', 'build'])) !== 0) return false;
  }

  // The desktop shell, which is its own build: `tsc` for the main process plus
  // the web app's **standalone** build bundled into `apps/desktop/web`. That
  // is a different build from the `.next` the web checks use — `next start` is
  // not supported alongside `output: 'standalone'` — so nothing above produces
  // it and `desktop.mjs` is the only thing that runs it.
  const desktopBuilt = existsSync(join(root, 'apps/desktop/web/server.js'));
  if (scripts.includes('desktop') && (!desktopBuilt || !flags.has('--no-build'))) {
    log('building the desktop shell');
    if ((await run('pnpm', ['--filter', '@stillpoint/desktop', 'run', 'build'])) !== 0)
      return false;
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
  if (code !== 0) return false;

  // Content for a demo, and **only** for a demo.
  //
  // `DemoSeeder` makes accounts and a pairing and says why it makes nothing
  // else: "a fixture that already contains what a test is about is a test that
  // passes whether or not the code works." That is right, and the checks below
  // never see this seeder.
  //
  // But `--demo` exists to put the product in front of a person — `LAUNCH.md`
  // item 1, a clinician reading the risk screen — and walked in a real browser
  // the seeded stack showed them an empty journal, empty insights, a console
  // overview of zeros, a coach's clients that were a row of em-dashes, and a
  // **safety queue saying "Nothing in the queue"**. That last one is the screen
  // item 1 names in as many words.
  if (!flags.has('--demo')) return true;

  log('seeding the demo’s own content (not used by any check)');
  return (
    (await run('php', ['artisan', 'db:seed', '--class=DemoContentSeeder', '--force'], {
      cwd: api,
      env,
    })) === 0
  );
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

  const apiServer = start(
    'the API',
    'php',
    ['artisan', 'serve', '--port=8000', '--no-reload', ...(lan === null ? [] : ['--host=0.0.0.0'])],
    { cwd: api, env },
  );
  started.push(apiServer);

  const web = start(
    'the web app',
    'pnpm',
    [
      '--filter',
      '@stillpoint/web',
      'exec',
      'next',
      'start',
      '--port',
      '3000',
      ...(lan === null ? [] : ['--hostname', '0.0.0.0']),
    ],
    { env },
  );
  started.push(web);

  const servers = [
    { name: 'the API', url: 'http://127.0.0.1:8000/api/me', expect: [401], process: apiServer },
    { name: 'the web app', url: 'http://127.0.0.1:3000/welcome', expect: [200], process: web },
  ];

  if (scripts.includes('mobile') || flags.has('--demo')) {
    const mobile = start('the mobile export', 'python3', [
      '-m',
      'http.server',
      '4000',
      '--bind',
      lan === null ? '127.0.0.1' : '0.0.0.0',
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

  if (flags.has('--demo')) {
    const password = process.env.SEED_PASSWORD ?? 'correct-horse-battery-staple';
    console.log('');
    console.log('  \x1b[1mStillpoint is up.\x1b[0m');
    console.log('');
    const host = lan ?? 'localhost';
    console.log(`    the app and the marketing site   http://${host}:3000`);
    console.log(`    the admin console                http://${host}:3000/admin`);
    console.log(`    the coach portal                 http://${host}:3000/coach`);
    console.log(`    the phone app, at phone width    http://${host}:4000`);
    console.log(`    the API                          http://${host}:8000/api`);
    console.log('');

    if (lan !== null) {
      /*
       * The real-device path, printed rather than documented, because the one
       * value that has to be right is this machine's address and only this
       * process knows it.
       *
       * Every dependency in `apps/mobile/package.json` is in Expo Go's own
       * bundled set, so there is no custom dev client and no EAS account in
       * the way — scanning the QR is the whole install. That is read off the
       * list rather than proved here: nothing in this container can run Expo
       * Go, which is the same sentence `apps/mobile/README.md` makes about
       * the keychain and `tel:` links.
       */
      console.log('  \x1b[1mOn a real phone\x1b[0m, on this same network:');
      console.log('');
      console.log(`    1. echo 'EXPO_PUBLIC_API_URL=http://${lan}:8000/api' > apps/mobile/.env`);
      console.log('    2. pnpm --filter @stillpoint/mobile run start');
      console.log('    3. scan the QR with Expo Go (iOS: the Camera app)');
      console.log('');
      console.log('  \x1b[2mThe phone app reads that URL at `expo start`, so step 1 has to');
      console.log('  come first. A phone browser can use the addresses above as they');
      console.log('  are — the web app was just rebuilt for this one.\x1b[0m');
      console.log('');
      console.log('  \x1b[2mAnd be plain about what --lan did: three dev servers and a demo');
      console.log('  database are now reachable by anything on this network, which is');
      console.log('  why it is a flag and not the default. Ctrl-C ends that.\x1b[0m');
      console.log('');
    } else {
      console.log('  \x1b[2mTo reach this from a real phone: pnpm run demo --lan\x1b[0m');
      console.log('');
    }
    console.log(`  Four accounts, all with the password \x1b[1m${password}\x1b[0m:`);
    console.log('');
    console.log('    you@stillpoint.test      an ordinary account, with a journal');
    console.log('    admin@stillpoint.test    the console, including the safety queue');
    console.log('    coach@stillpoint.test    the coach portal, with two clients');
    console.log('    client@stillpoint.test   a client of that coach');
    console.log('');
    if (flags.has('--no-build')) {
      // Say what was actually done. `--no-build` skips the reseed, so whether
      // the guide speaks at every step depends on whatever is in the database
      // already — and claiming otherwise is the kind of sentence this codebase
      // keeps finding and fixing. The same goes for the journal: without a
      // reseed, `you@stillpoint.test` has whatever it had, which may be
      // nothing at all.
      console.log('  \x1b[2m--no-build: nothing was reseeded, so the step copy and the');
      console.log('  journal are whatever this database already had. Drop the flag');
      console.log('  to reseed.\x1b[0m');
    } else {
      console.log('  The step copy is published, so the guide speaks at all six steps.');
      console.log('  A real deployment publishes nothing by itself — LAUNCH.md item 4.');
      console.log('');
      console.log('  Seeded to be worth looking at: a journal and insights for');
      console.log('  you@stillpoint.test, a shared history and a recurring belief for');
      console.log('  the coach’s client, and \x1b[1mone open flag in the safety queue\x1b[0m —');
      console.log('  which is the screen a reviewer actually reads.');
    }
    console.log('');
    console.log('  \x1b[2mCtrl-C to stop.\x1b[0m');
    console.log('');
    // Nothing to do but hold the servers open; Ctrl-C is handled above.
    await new Promise(() => {
      /* until interrupted */
    });
  }

  // Every script runs whatever any one of them does: a failure in the safety
  // stop and a failure in the coach's sharing rule are different news, and
  // stopping at the first would hide the second.
  const results = [];
  for (const name of scripts) {
    console.log(`\n\x1b[1m—— ${name}.mjs ——\x1b[0m`);
    // The desktop shell is an Electron app and needs a display. It brings its
    // own server on 8735 rather than using the three above, because that port
    // is the app's identity — see `apps/desktop/src/server.ts`.
    const code =
      name === 'desktop' && process.env.DISPLAY === undefined
        ? await run('xvfb-run', ['-a', 'node', join(here, `${name}.mjs`)])
        : await run('node', [join(here, `${name}.mjs`)]);
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
