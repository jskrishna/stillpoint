# End-to-end check

`flow.mjs` drives a real browser through the web app against a running Laravel
API: register, consent, a full six-step session, a reply lost on the way back,
the journal, insights, settings, the safety stop, sign-out, and a forgotten
password reset end to end — out of the log, through both screens, with the
journal still readable afterwards.

It is not part of `pnpm run check`, because it needs three servers. It **does**
run in CI now, in the `e2e` job, which boots the API against a MySQL service,
seeds the demo accounts, builds and starts the web app, and runs all seven
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

`desktop.mjs` is the newest and had the longest-standing gap behind it:
`apps/desktop` has one unit test, over the two decisions worth asserting in
isolation, and nothing that **started the app**. The root `CLAUDE.md` said it
had been launched under Xvfb, which was true once, by hand. So this launches
it: the bundled standalone server (a different build from the `.next` the other
checks use — `next start` is not supported alongside `output: 'standalone'`),
the window on the app's own origin, no Node in the page, the navigation pin in
the real main process rather than only in `navigation.test.ts`, `window.open`
refusing a `file:` URL, and `localStorage` surviving a relaunch, which is the
whole reason the port is fixed at 8735. On Linux it needs a display, so
`pnpm run e2e` wraps it in `xvfb-run` there and only there: macOS and Windows
draw a window with no `DISPLAY` at all, and the runner used to ask for
`xvfb-run` on them too, which neither has. It has now run on macOS, where its
last section closes the window and comes back to the app, the one thing only a
Mac can show. It proves nothing about packaging or signing, and it has not run
on Windows: `LAUNCH.md` item 8 is still item 8.

It fetches Electron itself if the binary is not there, with the package's own
installer, and fails if it cannot. It used to print "skipping" and pass.

If you run it from an editor built on Electron, the editor sets
`ELECTRON_RUN_AS_NODE`, which makes Electron behave as plain Node. The script
takes that variable out of what it launches the app with.

`mobile.mjs` is the odd one out and the most useful recently: it is the only
thing that runs `apps/mobile`. CI typechecked that app and `expo export`
bundled it, which proves a broken import and nothing about behaviour — a screen
that renders and then fails the moment it talks to the API passes that build.
So the web export is served and driven in a browser at 390px against the real
API, through the whole journey and the safety stop. Nothing native is covered;
`apps/mobile/README.md` lists what that leaves, and the first run on hardware
is still a test pass that has not happened.

It is also the phone's **accessibility audit**, because there could not be a
separate one: those screens cannot be reached by URL (the export is a plain
file server with no client-side routing, so a direct URL gets a 404 or
expo-router's "Unmatched Route" — and both of those pass an audit having
measured nothing). So axe runs at every screen this script walks, in both
palettes. `grep -c 'await audit(' mobile.mjs` is the count. This sentence
used to end "and it is ten" and then went stale, twice, which is why it is a
command and no longer a number: the script itself compares what it audited
with the screens on disk and fails if one is missing. `document-title` is the one rule turned off, and why is in
the comment beside it: the export serves one `index.html` and `headerShown` is
false on every stack, so there are no titles to find and a phone has no
document to title.

## One command

```bash
pnpm run e2e                 # build what is missing, seed, all seven, tear down
pnpm run e2e flow admin      # just those two
pnpm run e2e --no-build      # servers and scripts only, nothing rebuilt
pnpm run e2e --keep          # leave the servers up afterwards
pnpm run demo --lan          # the demo, reachable from a phone on this network
```

`e2e/run.mjs` does what the steps below do: builds the packages, the web
app and — only when that script is in the run — the Expo export or the desktop
shell, reseeds with
`DemoSeeder`, starts the three servers, waits for each to answer, runs every
script whatever any one of them does, tears the servers down and exits non-zero
if anything failed. A server that dies before it comes up is reported with its
own last forty lines rather than two minutes of polling a dead port.

It reseeds on purpose (`migrate:fresh`). A database left part-way through an
earlier run is how a check once passed here and failed in CI, so `--no-build`
is the flag to reach for when iterating on one script and the one to suspect
when a result surprises you.

**Which also makes it a check on the checks.** Run `pnpm run e2e` and then
`pnpm run e2e --no-build`: the second skips the reseed, so anything that was
passing because of what the first run left behind goes red. Both pass 7 of 7
today, and the reason to re-run it after touching a script is `flow.mjs`
section 6b — it spent the guide budget and asserted that a crisis turn is
still screened, and it was green because _earlier sections_ had already spent
most of that minute's budget. It only surfaced when an unrelated section added
twenty-five seconds above it.

It proves independence from one prior run, not from many, and says nothing
about a database an older schema wrote.

**It is not what CI runs.** CI brings its own servers up against a MySQL
service and runs each script as its own step, so a failure in the coach's
sharing rule and a failure in the safety stop are different lines in the log
rather than one red job. This is the local convenience; the workflow is the
contract.

### It can run against MySQL here, though

The API takes its connection from the environment and `run.mjs` passes the
environment through, so the whole suite can be pointed at a real
MySQL-family server rather than sqlite:

```bash
# A server, if one is not already up — `pnpm run check:mysql` explains this
# container's apt line and starts one for you.
mysql -e "CREATE DATABASE IF NOT EXISTS stillpoint_e2e CHARACTER SET utf8mb4;
          GRANT ALL ON stillpoint_e2e.* TO 'stillpoint'@'localhost';"

DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_DATABASE=stillpoint_e2e DB_USERNAME=stillpoint DB_PASSWORD=stillpoint DB_URL= pnpm run e2e
```

**Why it is worth doing**: `lockForUpdate()` is a **no-op on sqlite**, so the
locks in `SessionService`, the id-ordered pair in `openDraft()` and
`publishDraft()`, and the gap lock on opening an invitation are all simply not
taken when the suite runs locally. `ConcurrentTurnTest` says as much about
itself — it asserts the logic the lock protects and cannot assert the lock.
Measured: **7 of 7, 462 assertions, 0 failures** on MariaDB 10.11.

Be exact about what that shows, because it is easy to overstate. It shows the
locks are **issued against a server that honours them** and that nothing in
seven browser scripts breaks when they are — which is strictly more than a
sqlite run, where those statements do nothing. The suite is not a concurrency
harness, but it is not wholly sequential either: `admin.mjs` triple-clicks
Publish and "Mark as reviewed", and the journal delete sends one request per
entry, so there are genuinely parallel writes. What it does **not** reproduce
is the pair the locks exist for — a safety stop and an ordinary turn arriving
together — which no single browser can drive.

And **check that it really used MySQL**, because a connection that silently
fell back would produce an identical green run. The way to tell is the rows:
after the run above, `stillpoint_e2e` held 18 tables, 15 users, 14 guided
sessions, 6 journal entries and 2 safety flags, while
`apps/api/database/database.sqlite` had an mtime from before the run started.
A suite that passed having measured nothing is this directory's most repeated
finding.

## Or just show somebody

```bash
pnpm run demo
```

The same machinery with no checks: a seeded stack, the four accounts and the
five URLs printed, and it stays up until Ctrl-C. It is here rather than in its
own script because duplicating the server orchestration is how two versions of
it start disagreeing — and it is in `LAUNCH.md` because the first thing on that
list is asking a clinician to read the risk screen, which is easier if you can
hand them the console.

**And a check run after a demo empties it, with the servers still up.** Every
script above starts from `migrate:fresh --seed --seeder=DemoSeeder`, which is
the four accounts and the pairing and nothing else — so `pnpm run demo` and
then `pnpm run e2e`, in that order against one database, leaves the demo
answering on all three ports with an empty journal, empty insights, a console
overview of zeros and **nothing in the safety queue**. Measured: 0 flags, where
the demo seeds one.

That matters because of who the demo is for. `LAUNCH.md` item 1 is asking a
clinician to read the risk screen, "including the console's safety queue, where
they can see what a reviewer would actually read" — and the stack would still
be up, still look fine, and have had that screen emptied under it. Re-run
`pnpm run demo` after any check; it reseeds both halves.

**`--demo` seeds content that the checks never see**, and the two halves are
separate seeders on purpose. `DemoSeeder` makes the four accounts and the
pairing and nothing else, because a fixture that already contains what a test
is about is a test that passes whether or not the code works — so every script
above runs against exactly that. `DemoContentSeeder` is the demo's own
furniture: sessions, a journal, insights worth ranking, a shared history for
the coach's client, and **one open flag in the safety queue**, which is the
screen `LAUNCH.md` item 1 names in as many words and which was empty until it
was walked in a browser. Do not fold the second into the first; `pnpm run e2e`
must keep seeing an empty database.

## Or by hand

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

`e2e/browser.mjs` holds what every script agrees on: the two URLs, the seeded
accounts and the password, and how to find a browser. `WEB_URL`, `API_URL`,
`SEED_PASSWORD` and `CHROMIUM_PATH` override the defaults. Chromium is looked
for in three places in order — `CHROMIUM_PATH`, the development container's
fixed path, then Playwright's own — because the container blocks Playwright's
download and CI does not have the container's path. Anywhere else, that third
one has to be installed once: `pnpm exec playwright install chromium`.

Three things `pnpm run e2e` needs that are about your machine and not about the
product:

- **Ports 8000 and 3000 free, and 4000 for the mobile export.** The runner
  checks before it starts and says which is taken. `MOBILE_PORT=4001 pnpm run
e2e` moves the mobile export; the other two are part of what the web app and
  the phone app were built to call.
- **It reseeds the database `apps/api/.env` points at**, with `migrate:fresh`.
  To keep that one, give the run its own: `DB_CONNECTION=sqlite
DB_DATABASE=/somewhere/e2e.sqlite pnpm run e2e` (the file has to exist).
- **A checkout path with a space in it works**, which it did not: four scripts
  made a file path from a URL's percent-encoded pathname.

The section that matters most is section 7. It types crisis language into the
browser and asserts that the **server** ends the session, that 9-8-8, Québec's
line and 911 are shown and another market's numbers are not, and that no
journal row was written. Section 7a presses "Get help", which nothing used to.
Those are the rules in `CLAUDE.md` that must never be weakened, checked against
the real stack rather than a mock.

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

`ADMIN_EMAIL` overrides the default address. The password is `SEED_PASSWORD`,
one for every seeded account; this line used to name an `ADMIN_PASSWORD` that
nothing reads.

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

`COACH_EMAIL` and `CLIENT_EMAIL` override the defaults, with `SEED_PASSWORD`
for both.

## The accessibility audit

`a11y.mjs` runs axe-core over every route in both palettes at 390 and 1440 — 80
combinations across 20 routes — against the same servers. `CLAUDE.md` asks for
it after UI work.

```bash
node e2e/a11y.mjs
```

It registers its own account so the routes behind a token render something
rather than redirecting, and signs in as the admin and coach above for their own
screens — signed out those render a one-line "this is for staff", which is not
the screen worth auditing. The client route is resolved from the coach's real
pairing rather than hard-coded, and the journal-entry route from a quick
session the script finishes through the API — that one was missing for a while,
because it is the only route needing a row to exist and `DemoSeeder` makes no
content on purpose, so "every route" was nineteen of twenty and the one it
skipped was where somebody reads back their own session. Without an account for
a role those routes are skipped, and the run says so rather than passing on a
refusal. Contrast is already covered at the token level by
`packages/design-tokens/src/contrast.test.ts`; what this catches is the rest — a
control with no accessible name, a label with nothing to label, a heading level
skipped, a pairing that only exists once a component is rendered.

Two things it asserts that are not axe rules, because a page can satisfy every
rule and still be wrong for what the screen is for. It checks the **document
does not scroll sideways** — a horizontally scrolling page is valid, and at 390
the console's table screens dragged the heading and the navigation off the side
with them. And it runs the tags up to **`wcag22aa`**, not `wcag21aa`, for one
criterion: 2.5.8 Target Size (Minimum). axe has exactly one rule there,
`target-size`, and it is `enabled: false` in axe's own defaults — so the script
also asserts that axe _considered_ the rule on at least one combination, since a
rule that never ran reports no violations and reads exactly like a clean page.

It also asserts **one route per `<title>`**, which is the same distinction a
third time: axe's `document-title` asks whether a page has a title, WCAG 2.4.2
asks whether it says which page. Four routes under `/app` answered to the
layout's bare "Stillpoint" with the audit clean on all four, because
`metadata` cannot be exported from a `'use client'` module and nothing said
so.

**It does not cover the pause screen, and that is not a route list it forgot.**
`/session` renders the six steps; the pause with the crisis numbers on it only
exists after the server has ended a session for safety, so "every route in both
palettes" is every route's _first_ state. `flow.mjs` audits it in its own
section 7, where it types crisis language into the page, and `mobile.mjs` does
the same on the phone — which is where the contrast failures on that screen
were found, on both surfaces.

## What the browser sends, and where

`privacy.mjs` loads the public screens and then the signed-in ones, including a
session, and asserts that **no request leaves this origin**. Not a style
preference: this is a product about being upset, and a request to a third party
carries the visitor's IP and user-agent whatever comes back. A font, an icon set
or an analytics snippet is one line that nobody reads again.

It found something the first time it ran. The webfonts were linked from Google's
CDN, so every page load — the session screen included — reached them. They are
served from `apps/web/public/fonts` now, and this is what keeps them there.
