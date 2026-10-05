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

The suite runs on in-memory sqlite, so by default a migration is only verified
against sqlite's grammar. **`pnpm run check:mysql` (from the repository root)
runs the migrations up, back down, up again, and then this whole suite against
a real MySQL-family server** — installing and starting one if nothing is
answering. This file used to say apt could not install one, which was false.

It is MariaDB 10.11 where CI is MySQL 8.4, so it is more than sqlite tells you
and less than CI does; `scripts/check-mysql.mjs` has the differences that
matter. Run it when you change a migration, and still wait for CI.

`database/database.sqlite` is for running the app by hand (`php artisan serve`),
not for the tests.

**Column widths are one of the things sqlite will not tell you.** `text` is
unbounded there and 65,535 *bytes* on MySQL, and the encrypted columns were
`text` while a single session answered in Hindi encrypted to 90,400 bytes —
Devanagari costs three bytes a character and the `encrypted` cast roughly
doubles what it stores. They are `mediumText` now, and
`tests/Feature/EncryptedColumnsAreWideEnoughTest.php` asserts that every
`encrypted` cast has a widened column behind it. Add a new one and that test is
what reminds you.

**Collation is the other one.** sqlite's `=` is case-sensitive; MySQL's default
collation is not. `users.email` was stored as typed while five other places
compared it lowercased, so on sqlite a person who registered with a capital
could not sign in, could not reset their password, and could have a second
account created differing only in case — none of which happens on MySQL.
`App\Support\EmailAddress::normalise()` is the one rule now, and
`OneSpellingForAnAddressTest` pins it. Any new comparison of an address goes
through that function rather than through the database's idea of equality.

The guided sessions table is `guided_sessions`, not `sessions`: Laravel's
session driver owns that name.

## Encryption

Personal text uses `encrypted` casts — session data, the journal's title, what
happened, belief, forgiveness, memory and note, a safety flag's excerpt, and a
coach's notes about a client. A new one goes in `RotateEncryptionKey::COLUMNS`
in the same commit, and that command refuses to rotate while a model in
`app/Models` declares one it does not list.
Encrypted columns cannot be queried or indexed, which is deliberate: aggregates
run in PHP over a user's own window rather than with `GROUP BY`. Do not drop the
encryption to make a query easier.

They are also **`mediumText`, not `text`** — see the database section above, and
the root `CLAUDE.md` for the measurement. One answer is bounded at 20,000
characters by `App\Domain\Utterance`, which is a storage bound applied after
the safety screen and never a limit on what someone may say.

## Pint, not Prettier

This directory is excluded from the workspace's Prettier and ESLint, and from
`pnpm-workspace.yaml`. Laravel ships a `package.json` for Vite scaffolding this
API does not use, and globbing `apps/*` pulled those dependencies in.
