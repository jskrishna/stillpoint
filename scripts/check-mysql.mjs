#!/usr/bin/env node
/**
 * The PHP suite and the migrations, against a real MySQL-compatible server.
 *
 * **Why this exists.** `apps/api`'s suite runs on in-memory sqlite, and this
 * repository has twice been bitten by something sqlite cannot tell you:
 * `text` is unbounded there and 65,535 *bytes* on MySQL, which made a session
 * answered in Hindi unstorable; and sqlite's `=` is case-sensitive where
 * MySQL's default collation is not, which is how one account could not sign in
 * and a second could be registered differing only in case. Both are written up
 * in `CLAUDE.md`. The standing instruction there is that **sqlite passing
 * proves nothing about MySQL until CI says so** — and CI is the only thing
 * that had a MySQL.
 *
 * It turns out the development container can have one. `CLAUDE.md` said "there
 * is no MySQL server in the development container, and apt cannot install
 * one", and the second half was simply false: `apt-get install mariadb-server`
 * works, after an `apt-get update` to refresh a stale index. So this is the
 * gap closed rather than described.
 *
 * **Be exact about what it proves.** MariaDB 10.11 is what apt offers here and
 * CI runs **MySQL 8.4**. They are not the same server: among other things
 * MariaDB stores `json` as `longtext` with a constraint where MySQL 8 has a
 * native type, and the default collations differ (`utf8mb4_unicode_ci` against
 * `utf8mb4_0900_ai_ci`) — both case-insensitive, which is the property the
 * email rule depends on, but not the same rules. So a green run here means
 * "the grammar, the column widths and the collation behaviour hold on a real
 * MySQL-family server", not "CI will be green". It is strictly more than
 * sqlite told you and strictly less than CI does.
 *
 * It is deliberately **not** part of `check` or `verify:clean`: it needs a
 * server, exactly as `e2e` needs three.
 *
 *   pnpm run check:mysql
 *
 * Env: MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, and
 * MYSQL_ADMIN (the client command used to create the database, default
 * `mysql`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, not `.pathname`: a pathname is percent-encoded, so a checkout
// under a directory with a space in its name resolved to a path that is not there.
const API = fileURLToPath(new URL('../apps/api/', import.meta.url));

const HOST = process.env.MYSQL_HOST ?? '127.0.0.1';
const PORT = process.env.MYSQL_PORT ?? '3306';
const DATABASE = process.env.MYSQL_DATABASE ?? 'stillpoint_mysql';
const USER = process.env.MYSQL_USER ?? 'stillpoint';
const PASSWORD = process.env.MYSQL_PASSWORD ?? 'stillpoint';
const ADMIN = process.env.MYSQL_ADMIN ?? 'mysql';

/**
 * How to call the admin client.
 *
 * Deliberately **without** `-h`/`-P` unless a host was asked for, so the
 * client goes over the unix socket. On this container `root` authenticates
 * with MariaDB's `unix_socket` plugin and has no password, so a TCP
 * connection as root answers `ERROR 1698 (28000): Access denied` — measured,
 * on the first version of this script, which created the database fine over
 * the socket and then failed doing the same thing over a port.
 *
 * The application still connects over TCP, as the `stillpoint` user, which is
 * what a deployment does and what this is checking.
 */
const ADMIN_ARGS = process.env.MYSQL_HOST === undefined ? [] : ['-h', HOST, '-P', PORT];

const dim = (s) => `\u001b[2m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const say = (s) => {
  console.log(`${dim('[mysql]')} ${s}`);
};

function has(command) {
  return spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
}

/** True once the server answers. Polls, because a cold start takes a moment. */
function reachable(attempts) {
  for (let i = 0; i < attempts; i++) {
    if (spawnSync('mysqladmin', ['ping', ...ADMIN_ARGS], { stdio: 'ignore' }).status === 0)
      return true;
    spawnSync('sleep', ['2']);
  }
  return false;
}

if (!has('mysqladmin')) {
  console.error(
    red('No MySQL client here.') +
      '\n\nOn this container:\n' +
      '  apt-get update && apt-get install -y --no-install-recommends mariadb-server mariadb-client\n\n' +
      'The update is not optional — without it one package 404s on a stale index.\n' +
      'Then `mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld && mysqld_safe --user=mysql &`,\n' +
      'because there is no systemd here to start it for you.',
  );
  process.exit(1);
}

if (!reachable(1)) {
  // No server answering. Start one if this looks like the container above,
  // rather than asking for a step that is the same two lines every time.
  if (has('mysqld_safe') && HOST === '127.0.0.1') {
    say('no server answering — starting one');
    spawnSync('sh', ['-c', 'mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld'], {
      stdio: 'ignore',
    });
    spawnSync('sh', ['-c', 'nohup mysqld_safe --user=mysql >/tmp/mysqld-stillpoint.log 2>&1 &'], {
      stdio: 'ignore',
    });
    if (!reachable(15)) {
      console.error(red('Started a server and it never answered. See /tmp/mysqld-stillpoint.log'));
      process.exit(1);
    }
  } else {
    console.error(red(`Nothing answering at ${HOST}:${PORT}.`));
    process.exit(1);
  }
}

const version = execFileSync('mysql', ['-N', ...ADMIN_ARGS, '-e', 'SELECT VERSION()'], {
  encoding: 'utf8',
}).trim();
say(`server: ${version}`);
if (!/mariadb/i.test(version) && !/^8\./.test(version))
  say('note: neither MariaDB nor MySQL 8 — the caveat at the top of this file applies doubly');

say(`creating ${DATABASE} and the ${USER} grant`);
execFileSync(ADMIN, [
  ...ADMIN_ARGS,
  '-e',
  `CREATE DATABASE IF NOT EXISTS \`${DATABASE}\` CHARACTER SET utf8mb4;` +
    `CREATE USER IF NOT EXISTS '${USER}'@'%' IDENTIFIED BY '${PASSWORD}';` +
    `CREATE USER IF NOT EXISTS '${USER}'@'localhost' IDENTIFIED BY '${PASSWORD}';` +
    `GRANT ALL ON \`${DATABASE}\`.* TO '${USER}'@'%';` +
    `GRANT ALL ON \`${DATABASE}\`.* TO '${USER}'@'localhost';FLUSH PRIVILEGES;`,
]);

const env = {
  ...process.env,
  DB_CONNECTION: 'mysql',
  DB_HOST: HOST,
  DB_PORT: PORT,
  DB_DATABASE: DATABASE,
  DB_USERNAME: USER,
  DB_PASSWORD: PASSWORD,
  DB_URL: '',
};

function artisan(args) {
  const r = spawnSync('php', ['artisan', ...args, '--force', '--no-interaction'], {
    cwd: API,
    env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(red(`\nartisan ${args.join(' ')} failed.`));
    process.exit(1);
  }
}

/*
 * **This drops every table in that database, so look at the target first.**
 *
 * `migrate:fresh` is unconditional destruction, and the default database name
 * is one character away from the one a deployment uses. So the table set is
 * read first and compared against what this project's own migrations create —
 * derived from the migration files rather than listed here, because a listed
 * set is the thing that goes stale and this one decides whether to drop
 * somebody's data.
 *
 * Empty is fine. Only our tables is fine. Anything else stops, names what it
 * found, and says what to do instead.
 */
const declared = new Set(['migrations']);
for (const file of readdirSync(join(API, 'database/migrations'))) {
  const text = readFileSync(join(API, 'database/migrations', file), 'utf8');
  for (const m of text.matchAll(/Schema::(?:create|dropIfExists|table)\(\s*'([a-z0-9_]+)'/g))
    declared.add(m[1]);
}
if (declared.size < 5) {
  console.error(red('Could not read the migrations to learn which tables are ours. Refusing.'));
  process.exit(1);
}

const present = execFileSync('mysql', [
  '-N',
  ...ADMIN_ARGS,
  '-e',
  `SELECT table_name FROM information_schema.tables WHERE table_schema = '${DATABASE}'`,
])
  .toString()
  .split('\n')
  .map((t) => t.trim())
  .filter((t) => t !== '');

const foreign = present.filter((t) => !declared.has(t));
if (foreign.length > 0) {
  console.error(
    red(`\n${DATABASE} holds ${String(foreign.length)} table(s) this project did not create:`) +
      `\n  ${foreign.join(', ')}\n\n` +
      'This command would have dropped them. Point MYSQL_DATABASE at a scratch\n' +
      'database instead — the default is `stillpoint_mysql`, which it creates itself.',
  );
  process.exit(1);
}
say(
  present.length === 0
    ? `${DATABASE} is empty`
    : `${DATABASE} holds ${String(present.length)} table(s), all this project's — dropping them`,
);

// Up, and back down, which is the half CI has always done: a migration with no
// working `down()` is only ever found by running one.
say('migrating up');
artisan(['migrate:fresh']);
say('and back down');
artisan(['migrate:reset']);
say('and up again, for the suite to run against');
artisan(['migrate']);

/*
 * The suite's own config with the connection swapped, generated rather than
 * committed.
 *
 * A second checked-in `phpunit-mysql.xml` would be a copy of a file that
 * changes, and the copy would go stale silently — the same argument as
 * `parity/generate.mjs` writing the fixture instead of it being hand-kept.
 */
const config = readFileSync(join(API, 'phpunit.xml'), 'utf8');
const swapped = config
  .replace(
    '<env name="DB_CONNECTION" value="sqlite"/>',
    '<env name="DB_CONNECTION" value="mysql"/>',
  )
  .replace(
    '<env name="DB_DATABASE" value=":memory:"/>',
    [
      `<env name="DB_DATABASE" value="${DATABASE}"/>`,
      `<env name="DB_HOST" value="${HOST}"/>`,
      `<env name="DB_PORT" value="${PORT}"/>`,
      `<env name="DB_USERNAME" value="${USER}"/>`,
      `<env name="DB_PASSWORD" value="${PASSWORD}"/>`,
    ].join('\n        '),
  );

if (swapped === config) {
  console.error(
    red('phpunit.xml no longer declares the sqlite connection the way this script rewrites it.') +
      '\nLook at its <php> block and update the two replacements above.',
  );
  process.exit(1);
}

/*
 * Written **beside** `phpunit.xml` rather than in a temp directory, because
 * PHPUnit resolves `bootstrap`, `cacheDirectory` and the testsuite paths
 * relative to the config file. Measured: a config in `/tmp` answered
 * `Cannot open bootstrap script "/tmp/stillpoint-mysql-idUFA1/vendor/autoload.php"`
 * and exited 2 — before a single test ran, while the script's own summary
 * printed as if it had.
 *
 * Removed afterwards, and listed in `.gitignore` so a run interrupted part way
 * cannot leave a second config in the tree for somebody to find and wonder
 * about.
 */
const path = join(API, '.phpunit-mysql.xml');
writeFileSync(path, swapped);
process.on('exit', () => {
  rmSync(path, { force: true });
});
say(`running the suite against ${DATABASE}`);

const phpunit = join(API, 'vendor/bin/phpunit');
if (!existsSync(phpunit)) {
  console.error(red('apps/api/vendor is missing — run composer install there first.'));
  process.exit(1);
}

const suite = spawnSync(phpunit, ['-c', path], { cwd: API, env, stdio: 'inherit' });

if (suite.status !== 0) {
  // Said plainly, because the first version of this script printed its
  // "what a green run means" summary unconditionally — including after
  // PHPUnit had exited 2 without running anything.
  console.error(red(`\nThe suite did not pass on ${version}. Nothing above is a green run.`));
  process.exit(suite.status ?? 1);
}

console.log(
  `\n${dim('What a green run here does and does not mean')}\n` +
    `  does: the schema, the column widths and the collation behaviour hold on ${version}.\n` +
    '  does not: CI runs MySQL 8.4, which is a different server. This is more than\n' +
    '  sqlite told you and less than CI tells you.\n' +
    '  not covered: the Docker images and deploy/smoke.mjs, which need a daemon.',
);

process.exit(suite.status ?? 1);
