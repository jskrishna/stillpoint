/**
 * Everything CI runs, from a tree with nothing built in it.
 *
 *     pnpm run verify:clean            # delete, reinstall, run every gate
 *     pnpm run verify:clean --keep     # keep node_modules, delete build output
 *     pnpm run verify:clean --js       # skip the PHP half
 *
 * `CLAUDE.md` has asked for this by hand since early on — delete
 * `node_modules`, every package's `dist` and `apps/web/.next`, reinstall with
 * `--frozen-lockfile`, then run the gates in CI's order — and says in the same
 * breath that **a leftover `dist/` has twice made a broken commit look green
 * locally**. Twice is not bad luck. A six-step ritual ending in a 1.3GB delete
 * is a ritual people skip, which is exactly why `e2e/run.mjs` exists too.
 *
 * What it is actually for: `apps/web` resolves `@stillpoint/*` through
 * `node_modules` to their **built** output, the way an outside consumer would.
 * So a package export that was deleted, renamed or never emitted still
 * resolves locally against the `dist/` from before the change, and lint,
 * typecheck and the web build all pass over a tree that would not build on a
 * fresh clone. `tsBuildInfoFile` points inside `dist/`, so deleting `dist/`
 * without its `.tsbuildinfo` makes `tsc --build` report success and emit
 * nothing — which is the other half of the same trap, and the reason this
 * deletes whole directories rather than trying to be clever.
 *
 * It is **not** part of `check` and must not become part of it: `check` is the
 * one you run while working, many times an hour. This is the one before a push.
 *
 * `apps/api/vendor` is left alone unless `--composer` is passed, and the
 * asymmetry is deliberate rather than an oversight: PHP here has no build
 * step, so nothing is emitted that a later change can contradict — the failure
 * this script exists for has no PHP equivalent. Deleting it costs a minute of
 * Composer for no signal.
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const api = join(root, 'apps/api');

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const keepModules = flags.has('--keep');
const skipPhp = flags.has('--js');
const alsoComposer = flags.has('--composer');

const log = (line) => {
  console.log(`\x1b[2m[verify]\x1b[0m ${line}`);
};

/** Runs something to completion, inheriting stdio, and resolves its code. */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: root, ...options });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Build output, and nothing that is not build output.
 *
 * Spelled out rather than globbed for anything, because this function deletes
 * directories and a wrong glob here is somebody's work.
 */
const BUILD_OUTPUT = [
  'packages/protocol/dist',
  'packages/design-tokens/dist',
  'packages/client/dist',
  'apps/web/.next',
  'apps/web/.next-standalone',
  'apps/mobile/dist',
  'apps/desktop/dist',
  'apps/desktop/web',
  'coverage',
];

const MODULES = [
  'node_modules',
  'packages/protocol/node_modules',
  'packages/design-tokens/node_modules',
  'packages/client/node_modules',
  'apps/web/node_modules',
  'apps/mobile/node_modules',
  'apps/desktop/node_modules',
];

function remove(paths, what) {
  const gone = [];
  for (const p of paths) {
    const full = join(root, p);
    if (!existsSync(full)) continue;
    rmSync(full, { recursive: true, force: true });
    gone.push(p);
  }
  log(gone.length === 0 ? `no ${what} to remove` : `removed ${String(gone.length)} ${what}`);
}

async function main() {
  // Say what state is being verified. A clean verify of a dirty tree is a
  // perfectly reasonable thing to want, and silently implying otherwise is
  // worse than saying which it was.
  const dirty = await new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (c) => (out += String(c)));
    child.on('close', () => resolve(out.trim() !== ''));
  });
  log(
    dirty
      ? 'the working tree has uncommitted changes — verifying those'
      : 'verifying the committed tree',
  );

  remove(BUILD_OUTPUT, 'build directories');
  if (keepModules) {
    log('--keep: leaving node_modules alone, so an outdated install is not ruled out');
  } else {
    remove(MODULES, 'node_modules directories');
    log('installing from the lockfile');
    if ((await run('pnpm', ['install', '--frozen-lockfile'])) !== 0) {
      console.error('\n[verify] the install failed, so nothing after it would mean anything.');
      return 1;
    }
  }

  if (alsoComposer) {
    remove(['apps/api/vendor'], 'vendor directory');
    log('installing PHP dependencies');
    if ((await run('composer', ['install', '--no-interaction'], { cwd: api })) !== 0) {
      console.error('\n[verify] composer install failed.');
      return 1;
    }
  }

  // CI's order, and `check`'s: the packages are built first because `apps/web`
  // resolves them through `node_modules` to their built output.
  const gates = [
    { name: 'build:packages', command: 'pnpm', args: ['run', 'build:packages'] },
    { name: 'format:check', command: 'pnpm', args: ['run', 'format:check'] },
    { name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
    { name: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
    { name: 'test', command: 'pnpm', args: ['run', 'test'] },
    // Beyond `check`: the thing a fresh clone actually has to do. Every
    // workspace project, which is where a missing package export shows up.
    { name: 'build', command: 'pnpm', args: ['run', 'build'] },
  ];

  if (!skipPhp) {
    gates.push(
      { name: 'pint', command: './vendor/bin/pint', args: ['--test'], options: { cwd: api } },
      { name: 'phpunit', command: './vendor/bin/phpunit', args: [], options: { cwd: api } },
    );
  }

  // Every gate runs whatever any one of them does. A formatting slip and a
  // failing safety test are different news, and stopping at the first would
  // hide the second — the same reason `e2e/run.mjs` does not stop either.
  // `build:packages` is the exception: everything after it reads its output,
  // so a failure there makes the rest noise rather than news.
  const results = [];
  for (const gate of gates) {
    console.log(`\n\x1b[1m—— ${gate.name} ——\x1b[0m`);
    const code = await run(gate.command, gate.args, gate.options ?? {});
    results.push({ name: gate.name, code });
    if (gate.name === 'build:packages' && code !== 0) {
      console.error('\n[verify] the packages did not build, so the rest would only repeat it.');
      break;
    }
  }

  console.log('');
  for (const { name, code } of results) {
    const mark = code === 0 ? '\x1b[32mpass\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${mark}  ${name}`);
  }
  if (skipPhp) console.log('  \x1b[2mskip  pint, phpunit (--js)\x1b[0m');

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length > 0) {
    console.log(`\n${String(failed.length)} of ${String(results.length)} failed.`);
    return 1;
  }

  console.log(
    `\n${String(results.length)} of ${String(results.length)} passed, from nothing built.`,
  );
  // Say what this does and does not cover, because a green here is the thing
  // somebody is about to treat as permission to push.
  console.log('\n\x1b[2mNot covered: the end-to-end checks (pnpm run e2e, three servers) and');
  console.log('the Docker images, which only CI has a daemon for. MySQL is no longer on');
  console.log('that list: pnpm run check:mysql runs the migrations and the PHP suite');
  console.log('against a real MySQL-family server here, which this note said only CI');
  console.log('could do. It is MariaDB where CI is MySQL 8.4, so it is more than sqlite');
  console.log('tells you and less than CI does. So read the run this push starts \u2014');
  console.log('and read it, rather than its');
  console.log('colour: a job that fails in seconds with no logs did not run at all, and the');
  console.log('reason is in its annotations, not its output. Twenty-six consecutive runs');
  console.log('failed that way on a billing hold while everything here was green.\x1b[0m\n');
  return 0;
}

process.exit(await main());
