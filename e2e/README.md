# End-to-end check

`flow.mjs` drives a real browser through the web app against a running Laravel
API: register, consent, a full six-step session, a reply lost on the way back,
the journal, insights, settings, the safety stop, and sign-out.

It is not part of `pnpm run check`, because it needs three servers. It **does**
run in CI now, in the `e2e` job, which boots the API against a MySQL service,
seeds the demo accounts, builds and starts the web app, and runs all six
scripts. Run it by hand too after changing the session flow, the API client or
anything in `apps/api/app/Domain` — it is faster than waiting for a push.

**CI's API is not configured the way yours is**, and deliberately. There it runs
`--no-reload` with `PHP_CLI_SERVER_WORKERS`, because `php artisan serve` is
PHP's built-in server: one connection at a time, and a browser holds several
open on keep-alive, so the API went unresponsive mid-run and every script inside
that window failed with `Failed to fetch`. Several worker processes against one
database then rules sqlite out — two deferred transactions cannot both take the
write lock and `transaction_mode => 'IMMEDIATE'` needs PHP 8.4 — so CI uses
MySQL, which is what ships anyway. A side benefit: `lockForUpdate()` is a no-op
on sqlite, so the lock guarding a session that has already stopped for safety is
now exercised by the one check that drives a real browser.

Workers raised that ceiling and did not remove it: the server has since died
outright part-way through a run, and the last script reported it as a UI
timeout thirty seconds later. Two things said so — `storage/logs/laravel.log`
did not exist at all, so nothing had reached PHP and failed, and `php` was
missing from the runner's own list of orphan processes at the end of the job
while `next-server` and `python3` were still there. So CI supervises it: the
server respawns, and a restart is reported as a warning even when the checks
go green around it, because the run it breaks is the one after it. If that
warning starts appearing, the answer is nginx and php-fpm — `deploy/` has both
and the `docker` job already brings them up.

Locally the single-worker server below is right, and sqlite is fine for the
data: nothing is competing for the file. The cache is the exception, which is
why the command below moves it out of the database — see the note on it.

`mobile.mjs` is the odd one out and the most useful recently: it is the only
thing that runs `apps/mobile`. CI typechecked that app and `expo export`
bundled it, which proves a broken import and nothing about behaviour — a screen
that renders and then fails the moment it talks to the API passes that build.
So the web export is served and driven in a browser at 390px against the real
API, through the whole journey and the safety stop. Nothing native is covered;
`apps/mobile/README.md` lists what that leaves, and the first run on hardware
is still a test pass that has not happened.

```bash
# 0. the accounts these scripts need. `role` is not fillable and pairing has no
#    public route, so they cannot be made through the API.
cd apps/api && php artisan db:seed --class=DemoSeeder

# 1. the API, on :8000. `CACHE_STORE=file` if your `.env` is on sqlite: the
#    authenticated routes' `throttle:120,1` writes a counter to the cache on
#    every request, and with the cache in a sqlite database those writes
#    compete with the data under test. Measured at 8 server workers: 33 of 60
#    concurrent reads of `/admin/role-changes` came back 500 `database is
#    locked`. It looks like a flaky console and it is the rate limiter.
cd apps/api && CACHE_STORE=file php artisan serve --port=8000 &

# 2. the web app, on :3000  (the API's CORS list allows localhost and 127.0.0.1)
pnpm run build
cd apps/web && npx next start --port 3000 &

# 2b. the mobile app's web export, on :4000 (already in the API's CORS list)
pnpm --filter @stillpoint/mobile run build
cd apps/mobile/dist && python3 -m http.server 4000 --bind 127.0.0.1 &

# 3. the check
node e2e/flow.mjs
```

`e2e/browser.mjs` holds what all four agree on: the two URLs, the seeded
accounts and the password, and how to find a browser. `WEB_URL`, `API_URL`,
`SEED_PASSWORD` and `CHROMIUM_PATH` override the defaults. Chromium is looked
for in three places in order — `CHROMIUM_PATH`, the development container's
fixed path, then Playwright's own — because the container blocks Playwright's
download and CI does not have the container's path.

The section that matters most is the last one. It types crisis language into the
browser and asserts that the **server** ends the session, that the Tele-MANAS
and 112 numbers are shown, and that no journal row was written. Those are the
rules in `CLAUDE.md` that must never be weakened, checked against the real
stack rather than a mock.

## The admin console

`admin.mjs` checks who may read what. A safety flag's excerpt is the user's own
words at the moment they said they were not safe, so most of this script is
asserting that an ordinary account cannot reach it — that the text is absent
from the response, not merely hidden.

It also covers the step-prompt editor: that an incomplete protocol blocks
publishing, that the server refuses it with a 422 and the problem list even when
the request bypasses the button, and that an edit survives a reload.

It needs an admin account, which the API deliberately cannot make: `role` is
not fillable, so no request can set it. Make one with artisan:

```bash
cd apps/api && php artisan tinker --execute="
  \$u = App\Models\User::firstOrCreate(
    ['email' => 'admin@stillpoint.test'],
    ['name' => 'Admin', 'password' => 'correct-horse-battery-staple'],
  );
  \$u->role = App\Domain\Role::Admin;
  \$u->save();
"
node e2e/admin.mjs
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` override the defaults.

## The coach portal

`coach.mjs` checks one sentence from the outside: "You only see sessions your
clients choose to share." It has a client run two sessions, share one and keep
the other, then asserts that the private one's title, belief and note are
**absent** — from the coach's page and from the API's response, not merely
hidden by the markup. It also checks that a coach is refused the safety queue.

It also walks an invitation end to end: a coach opens one, a stranger holding
the link is refused, the address it was sent to accepts, and then the client ends
the pairing and the coach loses access on the next load.

It needs a coach and a client. The pairing it can make itself through the invite
flow; the roles it cannot, because `role` is not fillable and no request can set
it.

```bash
cd apps/api && php artisan tinker --execute="
  \$coach = App\Models\User::firstOrCreate(
    ['email' => 'coach@stillpoint.test'],
    ['name' => 'Coach Devi', 'password' => 'correct-horse-battery-staple'],
  );
  \$coach->role = App\Domain\Role::Coach;
  \$coach->save();

  \$client = App\Models\User::firstOrCreate(
    ['email' => 'client@stillpoint.test'],
    ['name' => 'Priya S.', 'password' => 'correct-horse-battery-staple'],
  );
  \$client->accepted_consent = ['understands', 'adult'];
  \$client->consented_at = now();
  \$client->save();

  if (! \$coach->clients()->where('users.id', \$client->id)->exists()) {
    \$coach->clients()->attach(\$client->id, ['status' => 'active', 'since' => now()->subMonths(4)]);
  }
"
node e2e/coach.mjs
```

`COACH_EMAIL`, `COACH_PASSWORD` and `CLIENT_EMAIL` override the defaults.

## The accessibility audit

`a11y.mjs` runs axe-core over every route in both palettes at 390 and 1440 — 76
combinations across 19 routes — against the same servers. `CLAUDE.md` asks for
it after UI work.

```bash
node e2e/a11y.mjs
```

It registers its own account so the routes behind a token render something
rather than redirecting, and signs in as the admin and coach above for their own
screens — signed out those render a one-line "this is for staff", which is not
the screen worth auditing. The client route is resolved from the coach's real
pairing rather than hard-coded. Without an account for a role those routes are
skipped, and the run says so rather than passing on a refusal. Contrast is already covered at the token level by
`packages/design-tokens/src/contrast.test.ts`; what this catches is the rest — a
control with no accessible name, a label with nothing to label, a heading level
skipped, a pairing that only exists once a component is rendered.

## What the browser sends, and where

`privacy.mjs` loads the public screens and then the signed-in ones, including a
session, and asserts that **no request leaves this origin**. Not a style
preference: this is a product about being upset, and a request to a third party
carries the visitor's IP and user-agent whatever comes back. A font, an icon set
or an analytics snippet is one line that nobody reads again.

It found something the first time it ran. The webfonts were linked from Google's
CDN, so every page load — the session screen included — reached them. They are
served from `apps/web/public/fonts` now, and this is what keeps them there.
