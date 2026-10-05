# Stillpoint's API

Laravel 13 on PHP 8.3 or newer, with MySQL in a deployment and sqlite for
development. It owns the session, the six-step protocol and the safety rules:
`app/Domain` is the authority, and `packages/protocol` is the same rules in
TypeScript, held to it by `parity/cases.json`.

This file was Laravel's stock README until it was noticed that the root README
points here.

## Running it

```bash
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite   # .env.example is set up for sqlite
php artisan migrate && php artisan db:seed   # the four demo accounts
php artisan serve --port=8000
```

`pnpm run demo`, from the repository root, does all of that and starts the web
app and the phone app's preview beside it.

## Checking it

```bash
./vendor/bin/phpunit     # the domain and feature tests, on in-memory sqlite
./vendor/bin/pint --test # formatting, as CI runs it
```

From the repository root, `pnpm run check:mysql` runs the migrations up, down
and up again and then this suite against a real MySQL-family server, which is
what tells you about column widths and collation. `pnpm run e2e` drives the
whole product in a browser against this API.

## Before it meets real people

```bash
php artisan stillpoint:preflight
```

It reports what a deployment that looks healthy still cannot do: send a
password reset, ask a question at every step, or put a crisis disclosure in
front of somebody who can read it. `deploy/README.md` has the rest, and
`LAUNCH.md` at the root has it in order.

## Where things are

- `app/Domain`: the protocol, the risk screen, plans, sharing. No framework.
- `app/Services`: the domain against the database, one transaction per change.
- `app/Http`: thin controllers and the resources that shape each response.
- `routes/api.php`: every route. The turn and "Get help" are declared outside
  the rate-limited group on purpose, and the comments there say why.
- `CLAUDE.md` here and at the root: why each of those is the way it is.
