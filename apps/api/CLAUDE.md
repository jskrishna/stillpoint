# apps/api — Stillpoint's backend

Read the repository root `CLAUDE.md` first. It is the project's guidance and it
governs this directory too; this file only covers what is specific to the API.

**This is an existing Laravel application, already installed and running.** Do
not install Laravel Boost, PHP, or Composer — they are here, and the Laravel
skeleton's setup instructions that used to live in this file did not apply to a
configured app. `php -v` reports 8.3.6.

## The rules live here

`app/Domain` is the authority on the protocol and on safety. It is a port of
`packages/protocol`, the two must agree, and `parity/cases.json` plus
`tests/Unit/ParityTest.php` enforce that. See the root `CLAUDE.md` for how, and
for the safety rules that are not preferences.

## Commands

```bash
./vendor/bin/phpunit     # the domain and feature tests
./vendor/bin/pint --test # formatting, as CI runs it
```

PHPUnit, not Pest: Pest 5 needs PHP 8.4 and this is 8.3. Laravel 13 needs ^8.3.

## The database

There is **no MySQL server in the development container**, and apt cannot
install one. The suite runs on in-memory sqlite, so locally a migration is only
verified against sqlite's grammar. CI closes the gap with a MySQL 8.4 service
that runs the migrations up and back down. If you change a migration, assume
sqlite passing proves nothing about MySQL until CI says so.

`database/database.sqlite` is for running the app by hand (`php artisan serve`),
not for the tests.

The guided sessions table is `guided_sessions`, not `sessions`: Laravel's
session driver owns that name.

## Encryption

Personal text uses `encrypted` casts — session data, the journal's title, what
happened, belief, forgiveness, memory and note, and a safety flag's excerpt.
Encrypted columns cannot be queried or indexed, which is deliberate: aggregates
run in PHP over a user's own window rather than with `GROUP BY`. Do not drop the
encryption to make a query easier.

## Pint, not Prettier

This directory is excluded from the workspace's Prettier and ESLint, and from
`pnpm-workspace.yaml`. Laravel ships a `package.json` for Vite scaffolding this
API does not use, and globbing `apps/*` pulled those dependencies in.
