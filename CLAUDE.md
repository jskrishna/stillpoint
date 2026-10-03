# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What Stillpoint is

A voice guide that walks someone through the six-step **Choose Again** process
when they are upset: Notice → Responsibility → Feel → Remember → Inquire →
Forgive. Not therapy, not medical advice; the user can stop at any time.

Five designed surfaces share one protocol: mobile app, desktop app, marketing
website, admin console, coach portal. The product is India-first (₹ pricing,
Tele-MANAS and 112 as helplines).

The design artifacts — not this repo — are the source of truth for product
behaviour. Read them before changing domain rules; do not infer product
decisions from the code alone.

## Safety rules are not preferences

The marketing site promises that a session stops when a user may be in danger.
In `packages/protocol/src/session.ts`:

- a `crisis` signal ends the session (`endReason: 'safety_stop'`);
- an ended session is terminal — only the summary rating may still land;
- `safetyLevel` only rises.

Never weaken these to make a flow more convenient, and never add a resume path
around a safety stop. They have tests; a change that breaks them is a bug, not a
failing test to update.

Helplines resolve by country and cover India only. `helplinesFor()` returns an
empty list for anywhere else — leave it that way rather than substituting a
plausible-looking number. A wrong crisis number is worse than none.

## The risk screen is a backstop, not the detector

`packages/protocol/src/risk.ts` is a small phrase screen. It exists so the
obvious cases cannot be missed while a real classifier is chosen and reviewed.
It cannot read tone, context, metaphor or irony.

**It knows English, Hinglish and Hindi, and it is thin in all three.** It used
to know English only, and that was worse than it sounded: `normalise()` dropped
every character outside `[a-z' ]`, so an utterance in Devanagari did not go
unmatched — it became an empty string and returned `none` before a rule ran.
Somebody typing "मुझे मरना है" into an India-first product got nothing at all.

The normaliser keeps Devanagari now, and the Hinglish and Hindi phrases are
graded by the same rule as the English ones: only a statement of intent or of
an act is `high`, hopelessness stays `medium`. Matching literal substrings in
Devanagari is brittle — "हूँ" and "हूं" are one word and two strings — and
Hinglish has no settled spelling, so the common variants are all listed because
a missed spelling is a missed disclosure. India has many more languages than
two. None of this makes the screen adequate; it makes the most unambiguous
phrasings visible, and it is the clearest argument for the classifier being
multilingual rather than English translated.

**Never describe it as sufficient, and never let a clinical claim rest on it.**
Shipping needs a trained model and sign-off from someone qualified to judge it.
It is tuned for recall on purpose: a false flag costs a reviewer a minute, a
missed one costs something that cannot be undone. Grade an ambiguous phrase up.

It also now says when it could not read the text at all. `normalise()` keeps
Latin and Devanagari and deletes the rest, so an utterance in Bengali, Tamil,
Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi or Urdu became an empty
string and was graded `none` — the same answer as an ordinary bad day. So an
assessment carries `unreadable` / `$unreadable`, true when any letter was in a
script the screen has no phrases for.

Three things about it, all deliberate:

- **It is not a risk level.** Grading an unreadable utterance up would invent a
  signal out of an absence of evidence, and flagging every one would drown the
  queue and make the product unusable for whole languages.
- **A `high` match still stops the session** and can carry `unreadable: true`
  beside it. The screen read enough of that utterance to be sure, and not all
  of it. Nothing about being unreadable may suppress a stop; there is a test.
- **It describes the text, not the act**, so `false` is correct wherever no
  utterance reached the screen. A refused turn is not evidence about any
  language.

Adding a script to the readable list without adding phrases for it is the wrong
fix: it would make `unreadable` say no about text that still nobody reads.

It is counted, in `guided_sessions.unreadable_turns`, and the console's
overview reports it. That is the whole intervention — a count, because a count
is what says whether the gap is worth closing and for whom, and because the
alternatives are both wrong. Nothing stores which script it was: that needs a
decision about whether a user's language is ours to keep, and knowing _whether_
this happens is enough to decide whether to ask.

Grading up has a ceiling, though: `high` ends the session, so hopelessness and
burdensomeness ("I can't go on", "I feel like a burden", "nothing matters any
more") are `medium` and `low`. They are flagged for a reviewer, not stopped on —
an upset person says them on an ordinary bad day often enough that stopping
would make the product unusable. Only a statement of intent or of an act is
`high`. Past tense is in the screen because people speak that way, and it trips
on reported speech ("a film about someone who wanted to die"); that false
positive is deliberate, and `parity/cases.json` says so beside the case.

## Safety is screened before the guide speaks

`takeTurn()` assesses risk first and, on a high-risk utterance, ends the session
**without consulting the guide at all**. A model answering someone who has just
said they are not safe is the exact failure this ordering prevents. There is a
test asserting the guide is never called; treat a change that breaks it as a
bug, not a failing test to update.

Nothing may come before that screen, and that includes a rate limit. The turns
route carries **no `throttle` middleware**: middleware refuses a request before
anything has looked at what it said, and the request it can refuse is someone
saying they are not safe — and then the helplines never appear. The budget is
`App\Support\GuideBudget`, resolved in the controller and passed into the turn
as `guideAvailable`, so a spent budget withholds **the guide** and nothing else.
The screen still runs, a flag is still raised, a stop still stops. Only the
guide is charged for: `TurnResult::guideConsulted()` is false for a stop and for
a refusal, so neither spends the budget.

### The guide is a stand-in, and so is what it records

`scriptedGuide` / `ScriptedGuide` decide what to say by reading the protocol and
nothing else. What they _record_ is `literalExtraction` (TS) /
`LiteralExtraction` (PHP): the answer taken at face value — whatever was said at
a step is what that step was asking for. Both are stand-ins for a model, both
exist in both languages, and the parity fixture covers them.

Step 3 is not answered in prose. The designs give it a grid of the twelve
feelings and "Choose up to 3", so `answerKindOf('feel')` is `'feelings'` and the
client posts feeling **ids**, not labels. The guide's word-count heuristic is
only applied to prose: judging a selection by its length stalled step 3 for
anyone who did not happen to pick exactly three feelings. Answer kind belongs to
the step _id_, not to a protocol version — staff editing prompts in the admin
console must not be able to turn a selection into a sentence.

## Two requests at once

Every method in `SessionService` that changes a session re-reads its row
**inside** its transaction with `lockForUpdate()`, and works on that row rather
than on the one route-model binding resolved. `start()` locks the _user_ row,
because there is no session yet to lock and two concurrent starts would
otherwise both find nothing open.

This is not tidiness. The pair that matters is a safety stop and an ordinary
turn arriving together: the stop writes an ended session, and the turn — holding
the state from before it — writes over the parts `storeDomain()` always writes.
`end_reason` happens to survive, because Eloquent only writes attributes it sees
as dirty and on a stale model that one reads null-to-null. Nothing else does:
the row comes back ended, at step 2, with `safety_level` written back _down_ —
past an invariant the domain states plainly and the reducer enforces, because
the reducer was handed a snapshot of a moment that had passed.

`takeTurn()` therefore asks again under the lock and throws
`SessionAlreadyEnded`, which the controller answers as 409. The controller's own
check before the transaction is the fast path; the one under the lock is the one
that is true. `stop()` deliberately does _not_ refuse — stopping something
already stopped is what the user asked for either way — but it must not
relabel a safety stop, and the domain leaves an ended session alone.

`journal_entries.guided_session_id` is **unique**, so "one row per session" is
the database's rule rather than a check with a gap after it.

**`lockForUpdate()` does nothing on sqlite**, which the tests and the
development container run on. The lock is real on MySQL. What
`tests/Feature/ConcurrentTurnTest.php` can assert is the logic the lock
protects — it holds a model from before an end, which is exactly what a second
request would be holding, and insists that acting on it is refused. Removing
either the lock or the guard turns it red; both were checked.

The `e2e` job runs against a MySQL service for this reason among others, so the
lock itself is exercised somewhere by a real browser against a real server; see
`e2e/README.md`.

## One session at a time, and it survives the tab closing

`GET /sessions/current` is the first thing a client asks. Closing a tab used to
lose a session for good: it stayed open on the server, nothing could ever reach
it again, and on a free plan it had already spent one of three full sessions for
the week.

`POST /sessions` **ends whatever was open**, as `user_stopped`, because a person
is in one session at a time — it is a voice guide, not a set of tabs, and two
open sessions would both offer to be resumed with no way to tell which one an
answer was going into. It is not silent: the home screen offers to carry on
first, and says what starting fresh costs.

A resumed session is the same session, so it spends no second allowance. An
ended one is never offered — including a safety stop, because there is never a
resume path around one.

The session screen shows a short recap of what the session already holds when
there is no local echo of a turn, built from what the server sent: a resumed
session has no history in the browser, and carrying on with no sign of what you
had already said was disorienting.

## A plan's allowance is a promise too

The pricing page says Free gets "3 full sessions a week" and "Unlimited quick
sessions". A promise the server does not keep is the same problem whichever way
it points, so it is enforced: `packages/protocol/src/plans.ts` and
`App\Domain\Plan`, with parity cases over every plan and count.

**A quick session is always allowed.** That is the point of the rule rather than
an exception to it — the limit exists to price the long session, and someone who
is upset should never be told to come back next week. A refused start answers
402 and says so, and the screen offers the quick session rather than being a
dead end.

The count comes from `guided_sessions.started_at`, not from journal rows, so a
session that stopped for safety — which never gets a row — still counts. It was
a full session; the allowance is about starting one, not finishing it.

Two things the designs state and this deliberately does **not** enforce:

- **"Up to 25 clients"** on the Coach plan. What a coach on some _other_ plan is
  allowed is not stated anywhere, so capping them would be a product decision
  made by a guess.
- **What a quick session actually is.** It runs the same six steps, because
  nothing says otherwise. The designs show quick sessions as shorter and label
  them in the journal, but not which steps are skipped — that is the PRD's to
  say, like the step copy.

## Do not invent product copy

Only step 4 "Remember" is fully specified in the designs. Unspecified prompt
copy, completion criteria and turn limits are `null`, and `incompleteSteps()`
reports them. **Do not fill these with invented text** — the real copy lives in
the PRD. A `null` is an honest gap; a guess silently becomes the product's
voice.

The same goes for pricing: the designs show `[PRICE]/mo` placeholders.

## The fonts are ours, not Google's

`apps/web` serves Newsreader and Hanken Grotesk from `public/fonts`, not from
Google's CDN. Linking the CDN meant every visitor's IP and user-agent reached a
third party on every page of a product about being upset — the session screen
included — which is not a thing to leave in place in a product that invokes
DPDP about its own microphone. The phone app has always bundled its fonts; this
is the web matching it.

`apps/web/scripts/fetch-fonts.mjs` regenerates them and is run by hand, not by
the build: `next/font/google` would self-host too, but it downloads at build
time, and a build that needs fonts.googleapis.com can fail for a reason nothing
here controls. The files are variable faces, latin and latin-ext only — neither
family carries Devanagari — and the stylesheet keeps Google's own
`unicode-range` rules, so a browser fetches a face only when a glyph on the page
needs one. Both are OFL and the licences sit beside them.

There is a check worth keeping: load a few routes with a real browser and assert
that **no external origin is requested at all**. That was how this was found.

## Contrast is tested, not assumed

`packages/design-tokens/src/contrast.test.ts` asserts WCAG AA for every text
role against every surface, in both palettes. A colour change that drops a pair
below 4.5:1 fails the build.

Three of the designs' colours did not meet AA and the tokens deliberately differ
(`muted`, `accent`, plus a new `accentText` and `dangerInk`) — the README has
the table. **Use `accentText` when the accent is small text and `accent` when it
is a fill**; they are not interchangeable, which is the whole reason both exist.

Re-run the audit after UI work: `node e2e/a11y.mjs`, with the app built and both
servers up (see `e2e/README.md`). It covers every route in both palettes at 390
and 1440 — 76 combinations across 19 routes — and the last run was clean across
all of them. It
signs in as each role and resolves the client and invitation routes from real
rows rather than hard-coding an id.

## Stack

- TypeScript 6.0.x, ESM only (`"type": "module"`)
- Node >= 22 (`.nvmrc`), pnpm 10 workspace (`pnpm-workspace.yaml`)
- Vitest, ESLint flat config (type-aware), Prettier

TypeScript is pinned to the 6.0 line because `typescript-eslint` 8.x declares a
`typescript@>=4.8.4 <6.1.0` peer range. **Do not bump to 7.x** until
`typescript-eslint` supports it, or type-aware linting breaks.

## Layout

```
apps/api/                 Laravel 13 + MySQL — the backend, and the authority on the protocol
packages/protocol/        @stillpoint/protocol — the same domain in TypeScript (see below)
packages/design-tokens/   @stillpoint/design-tokens — Warm & Clear colour, type, space
packages/client/          @stillpoint/client — the typed API client, one per surface
apps/web/                 @stillpoint/web — Next.js: marketing site and web app
apps/mobile/              @stillpoint/mobile — Expo: the iOS and Android app
apps/desktop/             @stillpoint/desktop — Electron: a shell around the web app
parity/                   the cross-language fixture both suites assert against
e2e/                      a by-hand browser check of web against a running API
```

### The phone is a real surface, and it is not verified on a phone

`apps/mobile` is Expo (SDK 57) with expo-router, consuming all three packages.
It has the welcome and consent flow, the six-step session, the journal and an
entry, what the app has noticed, and settings. Its own README has the detail.

**What can be verified here is verified, and the rest is named.**
`expo export --platform web` is a real build — every module bundled, all
routes statically rendered — and it runs in the container alongside
`typecheck`. What has never run is the app on a phone: there is no simulator
here and no device on CI. The keychain, text-to-speech, `tel:` links on the
safety screen, the splash screen and safe-area insets on a notched device are
all unproven. Do not describe this app as tested on a device, and do not let a
green export stand in for that.

Two decisions in it are worth keeping:

- **The tab bar has labels and no icons.** The design set does not assign the
  tabs any iconography, and drawing four glyphs would be inventing product
  visuals the same way inventing step copy would be inventing the guide's
  voice.
- **The voice seam is the same shape as the web's** (`src/voice.ts` against
  `apps/web/src/lib/voice`), with `expo-speech` as the stand-in. Listening is
  still not built on either surface, and both say so in the same words rather
  than pretending. When the voice vendor is chosen, these two files are what
  gets replaced — and at that point the seam itself is worth moving into a
  package.

### The desktop app is a shell, and must stay one

`apps/desktop` is Electron around the web app's standalone build — the same
build the browser gets, in a window. Nothing about the product is implemented
there: no session screen, no safety rule, no API client. That is why the
designs call for Next.js on both, and it is the only reason a fifth surface
does not mean a fifth place for a crisis-stop rule to drift.

What it adds is what a window can do and a tab cannot: a remembered size and
position, a tray, a global shortcut
(<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) straight into a session,
and a menu that goes to the app's own screens. If a feature needs a screen, it
belongs in `apps/web` and the desktop app gets it for free.

The renderer is sandboxed with no Node and no preload, and navigation is pinned
to the app's own origin: the page in that window is signed in to somebody's
journal. The bundled server binds to `127.0.0.1` on an allocated port.

**The port is fixed (8735) on purpose, and it is the app's identity.** Asking
the operating system for a free port is the obvious thing and it is wrong here:
the port is part of the origin, the origin is what the browser keys storage by,
and the web app keeps its bearer token in `localStorage`. A new port each launch
is an empty store each launch — the desktop app signs everybody out every time
it starts, and nothing in the logs says why. If the port is taken the app says
so and stops, because moving to another one is that bug with an extra step. The
API's `CORS_ALLOWED_ORIGINS` carries that one origin.

**The app surface has no desktop layout.** `apps/web`'s `/app` caps its content
column at 430px with navigation along the bottom — the phone design, which is
the only one the artifacts give for those screens. So the window opens narrow:
that is the designed layout at its designed width, not a desktop one. The
console, the coach portal and the marketing site do have desktop layouts and
render as intended. A desktop layout for `/app` is a design decision, and it
belongs in `apps/web`; the shell will pick it up with no change.

It has been launched under Xvfb here, which proves the server starts, the app
renders and a session survives a relaunch. **It has never been packaged or run
on macOS or Windows**, and there is no installer, signing, notarisation or
auto-update — each of those costs a certificate or a server rather than a line
of config. Its README says so; do not let `pnpm run build` passing stand in for
it.

`apps/web` therefore has a second build: `pnpm --filter @stillpoint/web run
build:standalone`, which sets `NEXT_OUTPUT=standalone` and so turns on
`output: 'standalone'` with `outputFileTracingRoot` at the workspace root. Both
of those are load-bearing for the desktop app and for the Docker image, and
neither is visible from `apps/web` itself — the comment in `next.config.ts` is
the only warning anyone gets.

It is opt-in, and writes `.next-standalone` rather than `.next`, for two
reasons that are easy to rediscover the hard way. `next start` is **not
supported** alongside `output: 'standalone'` and Next says so at every boot —
and `next start` is what local development, the README and the end-to-end job
all use, so leaving it on meant every one of those ran a combination the
framework warns against. And two builds of one app into one `.next` means
whichever ran last decides what `next start` finds, which a root
`pnpm run build` does by itself: web, then the desktop shell.

### Display state lives in the protocol package

`packages/protocol/src/display.ts` holds `relativeDay`, `duration`, `greeting`
and `partOfDay` — the pure formatting both clients need. It is not the
presentation the package forbids: no colours, no copy of the guide's, no
framework. It is there so the web and the phone cannot end up disagreeing about
what "Yesterday" means, and the locale stays `en-IN` in one place, because the
product is India-first and a weekday in the device's locale would be the one
thing on the screen in another language.

### One API client, not one per surface

`packages/client` holds every path, field name and paging rule the API answers
with. The web app, a phone and a desktop shell all consume it, because three
hand-written clients would be three sets of field names drifting apart — the
same failure the TypeScript and PHP protocols have a parity check to prevent,
and with the same cost: the surface that drifts is the one that stops showing
someone their helpline.

It is the one package that _is_ allowed I/O — that is what it is for. It is
still not allowed presentation: no colours, no copy, no framework imports.
What a surface supplies is the two things that genuinely differ, both as
arguments to `createClient()`:

- `baseUrl`, because an app bundle cannot read `NEXT_PUBLIC_*`;
- `tokens`, a `TokenStore`, because a browser has `localStorage` and a phone
  should use the keychain.

`TokenStore` is **synchronous on purpose**, and the reasoning is in
`tokens.ts`: every keychain API is asynchronous, but making the interface
asynchronous would make `hasToken()` a promise, and that is the one thing a
screen needs an answer to before it can decide between rendering and
redirecting. So the asynchronous medium gets wrapped (`cachedTokens`) instead
of the interface widened. Do not widen it.

`apps/web/src/lib/api.ts` is what a surface binding should look like: the base
URL, a `localStorage` store, and a re-export of everything so no screen has to
know which package a type came from.

### The backend is Laravel, and it owns the rules

`apps/api/app/Domain` is the authority. The PHP there is a port of
`packages/protocol`, and the TypeScript tests were the specification for it.

**While both exist, they must agree.** Two implementations of a crisis-stop
rule is the worst outcome available: they drift, and the one that drifts
decides whether someone gets a helpline. The port keeps the same names, the
same orderings and the same tests, and there is a parity check comparing the
risk screen's output across both.

The TypeScript protocol package is on its way to being types plus client-side
display state. Until that is finished, **a rule changed in one must be changed
in the other, in the same commit**.

That is enforced, not just asked for. `parity/cases.json` is a checked-in table
of utterances and step answers with the expected risk grade and the expected
capture. Both suites assert against that one file —
`packages/protocol/src/parity.test.ts` and `apps/api/tests/Unit/ParityTest.php` —
so a rule that moves in one language and not the other turns one of the two red,
in whichever CI job runs first.

The TypeScript side generates the file, because its tests were the port's
specification: `pnpm run parity:generate`. Run that only after deliberately
changing both languages. **Regenerating to turn a red parity test green records
the divergence instead of fixing it**, which is the whole failure the file
exists to prevent.

Note `pnpm-workspace.yaml` lists `apps/web` and not `apps/*`: Laravel ships a
`package.json` for Vite scaffolding this API does not use, and globbing pulled
those dependencies in. `apps/api` is also excluded from Prettier and ESLint —
it has Pint and its own CI job.

`packages/protocol` must stay free of I/O **and of presentation**: no network,
no storage, no speech, no framework imports, no colours. Feeling ids and labels
are domain and live there; feeling colours are presentation and live in
`design-tokens`. Every surface depends on both, so anything environment-specific
belongs in the surface instead.

The design direction is **Warm & Clear** (cream `#FBF4EC`, terracotta accent
`#E4572E`, Newsreader + Hanken Grotesk), taken from the newest and only complete
artifact. The earlier "Dusk to Light" exploration is not current; do not mix its
palette in. Only its feeling colours survive, because nothing else assigns the
twelve feelings colours at all.

## Commands

```bash
# Web and packages
pnpm run check   # build:packages, then format:check + lint + typecheck + test
pnpm run build   # every workspace project, packages first

# API (from apps/api)
./vendor/bin/phpunit     # the domain tests
./vendor/bin/pint --test # formatting, as CI runs it
```

`e2e/` holds six checks against a running API — see `e2e/README.md`. One of
them, `mobile.mjs`, is the only thing that executes `apps/mobile` at all: it
drives the Expo web export in a browser at a phone's width. It does not touch
anything native, and `apps/mobile/README.md` lists what that leaves.
`flow.mjs` is the web app's: register, consent, a full session, journal,
insights, settings, the safety stop and sign-out. It needs three servers, so it
is not part of `check` — but it **is** in CI, as the `e2e` job, along with the
other five. Run it by hand too after changing the session flow,
`packages/client` or anything in `apps/api/app/Domain`; it is faster than
waiting for a push. Its last section is the one that matters: it types crisis
language into a real browser and asserts the **server** ended the session,
refuses another turn on it (409), shows Tele-MANAS and 112, and wrote no
journal row.

CI runs four jobs: the PHP suite, the JavaScript gates, the end-to-end checks,
and the Docker images. PHP here is 8.3; Laravel 13 needs ^8.3, and Pest 5 needs
8.4, so the API uses PHPUnit — which is what the skeleton ships anyway.

**There is no MySQL server in the development container**, and apt cannot
install one. The suite runs on in-memory sqlite, so locally the schema is only
verified against sqlite's grammar. CI closes that gap with a MySQL 8.4 service
that runs the migrations up and back down. If you change a migration, assume
sqlite passing proves nothing about MySQL until CI says so.

`check` builds the packages first on purpose: `apps/web` resolves
`@stillpoint/*` through `node_modules` to their built output, exactly as an
outside consumer would, so lint and typecheck need that output to exist. CI runs
the same steps in the same order.

**Verify on a clean tree before pushing.** Delete `node_modules`, every
`packages/*/dist` and `apps/web/.next`, reinstall with `--frozen-lockfile`, then
run the gates in CI's order. A leftover `dist/` has twice made a broken commit
look green locally.

## Running it somewhere

`docker-compose.yml` and `deploy/` bring the whole thing up: MySQL, PHP-FPM,
nginx, Laravel's scheduler, and the Next.js app. `deploy/README.md` is the
detail. Two things from it that matter wherever this is discussed:

**`APP_KEY` is the whole journal.** Every entry, every session's content and
every safety flag's excerpt is encrypted with it, there is no second copy, and
there is no recovery path — change it or lose it and that content is gone, not
locked out. This is also the reason password reset is safe to offer: the key is
not derived from anyone's password.

Rotating it is a migration, and `stillpoint:rotate-key` is it: old key into
`APP_PREVIOUS_KEYS`, new one into `APP_KEY`, run it, and only then drop the old
key. Its `--dry-run` reads every encrypted row and writes nothing, which makes
it the check for "can this deployment still read what it holds". Two rules in
there are not conveniences: a row that decrypts under no configured key is
**left byte-for-byte as it is**, because the ciphertext is the only copy and a
guess would turn a recoverable mistake into the other kind; and the command
refuses outright if a model declares an encrypted column its own list does not
cover, because that column would keep the old key and step two would then
destroy it. Add the column to `RotateEncryptionKey::COLUMNS` in the same commit
as the cast.

**`MAIL_MAILER=log` means nobody can reset a password.** No mail provider has
been chosen, so the reset link is written to the log instead of sent. It is the
one thing in the deployment that is deliberately unfinished, and it needs a
decision rather than a configuration change.

The CI `docker` job builds all three images and brings the stack up, so they are
known to build and start. Nothing has run against real traffic, nobody has
restored a backup, and TLS terminates somewhere that does not exist yet. A green
build means "this will start", not "this is ready".

`NEXT_PUBLIC_API_URL` is fixed when the web image is built, because the browser
is what calls the API. Pointing a built image at a different API is not
possible; rebuild it.

## Personal content is encrypted at rest

The session data, the journal's title, what happened, belief, forgiveness,
memory and note, and a safety flag's excerpt all use Laravel's `encrypted`
casts. This is the most personal text the product holds, and a flag's excerpt
is the single most sensitive column in the schema.

**And the log is not a second copy of it.** Encrypting a column and then
logging its value is not encryption at rest, and the leak that would do it is
one line: a `Log::error('turn failed', ['utterance' => $utterance])` added
while chasing something and never taken out. `NoPersonalTextInLogsTest` makes a
turn throw and asserts the utterance is nowhere in what got logged; it was
checked by adding exactly that line. It is **not** a check on stack traces —
PHP renders a string argument as `'...'` in `getTraceAsString()` however
`zend.exception_ignore_args` is set, and that is what Laravel's formatter uses.
`deploy/php.ini` pins that setting anyway, for anything that reads the
structured trace instead, which is how an error reporter would start carrying
those values.

Encrypted columns cannot be queried or indexed, which is deliberate and has a
cost: aggregates over beliefs (the "belief that comes back") are computed in PHP
over a user's own window, not with `GROUP BY`. Do not drop the encryption to
make a query easier.

A user can erase their own account, and it has to actually take everything:
`AccountDeletionService`. Most of the removal is the schema's — sessions,
journal, flags and pairings cascade from `users` — and what is in the service is
everything a foreign key does not reach, which is the pattern to check for
whenever a table is added:

- **Sanctum tokens**, which have no foreign key, so nothing would remove them.
- **The role-change trail**, which must outlive the account but must not keep
  its address.
- **Invitations sent _to_ the address.** `coach_invites.email` is a string and
  not a key, deliberately — a coach can invite an address with no account — so
  only the ones a coach _sent_ cascade. This used to be written down as
  "invitations cascade", and the row carrying the erased person's email stayed,
  on their coach's screen. Compared lowercased, because `CoachInvite::open()`
  stores it that way and sqlite's `=` is case-sensitive where MySQL's collation
  is not.
- **A pending password reset**, whose table is keyed by the address and has no
  foreign key either — a live reset token for an account that no longer exists.
  Removed through the broker, so the row is found by whatever key the broker
  writes.
- **Web session rows**, which carry `user_id`, an IP and a user-agent, and whose
  `user_id` is a plain indexed column with no `constrained()`. Nothing writes
  one today, because auth is bearer tokens; the sweep is there for the day
  cookie mode lands, which is the documented right answer for the web client.

Two tests cover the three, and both were checked by taking the fix out. It is guarded by the
account's own password and a typed confirmation, because it is not reversible
and should not be something a stray tap on an unlocked phone can do.

**Open question for someone qualified:** a safety flag is deleted with the
account, because that is what erasure means and it is what the schema already
did. But it also means that if a person said they were in danger and then
deleted their account, a reviewer cannot follow it up. Whether an anonymised
flag should outlive an erasure, and for how long, is a safeguarding and DPDP
decision — not a refactor. Deleting is the answer that needs no sign-off; keeping
someone's words against their wish is the one that does.

The journal table is also the rule, not just a store: **a session that ended for
safety never gets a row.** `JournalEntry::fromSession()` returns null for it,
and the absence of the row is how that is kept.

**And deleting an entry takes the words out of the session too.** The entry is a
copy: `guided_sessions.data` holds the same answers, and `GET /sessions/{id}`
serves that row to the owner's token — so deleting an entry used to leave every
word of it readable through the API, while the product said "It is removed for
good … This cannot be undone" and "we cannot get it back for you". That is the
plan-allowance problem again: a promise the server does not keep is the same
problem whichever way it points.

The **row** stays and only its content goes, which is the other half of the
rule. The weekly allowance counts `guided_sessions.started_at`, so deleting the
row would refund a full session and turn "3 full sessions a week" into "3 you
have not deleted"; the console's percentages are of sessions started and would
quietly start flattering themselves. Neither needs the user's words.

It is a `deleted` hook on `JournalEntry`, not controller code, for the reason
`SafetyFlag` keeps `severity` in step there: a rule that asks every caller to
remember it has a gap behind the next caller. A safety flag's excerpt is
deliberately untouched — that is the queue's, and a safety-stopped session never
had an entry to delete.

## A forgotten password is not a lost journal

`auth/forgot-password` and `auth/reset-password` use Laravel's password broker.
Two things about them are deliberate and should not be "simplified":

- **The answer is the same whether or not the address has an account.**
  `forgotPassword()` throws the broker's result away on purpose. It
  distinguishes "sent" from "no such user", and that distinction is the leak:
  this product's user list is people who went looking for help with being
  upset, and confirming membership is not something an unauthenticated caller
  should be able to do. A bad or expired token gets one message for both
  reasons, for the same reason.
- **A reset revokes every token**, this browser's included, so the new password
  has to be used to get back in. A reset is what you do when you think someone
  else may have your account.

The journal survives a reset because the `encrypted` casts use the
application's `APP_KEY`, not anything derived from the password. That is the
only reason a reset is safe to offer at all — key the encryption to the
password and this route becomes a shredder. If per-user keys are ever
introduced, this flow has to be rethought before they land, not after.

Mail is `MAIL_MAILER=log` in development: the link is written to
`storage/logs/laravel.log` rather than sent. The link points at
`config('app.frontend_url')` (`APP_FRONTEND_URL`), because the token is spent
on a web screen, not on an API route.

## Signing in

Two defaults were Laravel's and are not any more, both set once rather than at
each call site:

- **A password is at least twelve characters**, set with `Password::defaults()`
  in `AppServiceProvider`. Length and nothing else: composition rules push
  people towards a short password with a digit on the end. `uncompromised()` is
  deliberately absent — it would put a third-party request in the middle of
  registration, in a product that will not link a font from someone else, and
  it fails open when that request fails.
- **A token expires after thirty days** (`SANCTUM_TOKEN_MINUTES`). Laravel's
  default is never. Thirty rather than something shorter because there is no
  refresh flow, and a phone that asks for a password every week is a phone
  someone stops opening when they are upset. The real answer is cookie mode
  with a refresh, which is a change to how every surface authenticates.

Both have tests, and both tests were checked by removing the setting. The
expiry one needs `forgetGuards()` after travelling: the guard caches the user it
resolved, and without that the test passes with the expiry removed.

## Roles, and who reads what

A user has one of three roles, and nobody is staff by registering: `role` is not
in `User`'s `#[Fillable]`, so no request can set it. The model and the column
both default to `user`, and `isStaff()` reads a missing role as `user` — if the
role cannot be determined, the answer to "may this person read the safety queue"
is no.

**A coach is not an admin.** A coach reads the sessions a client chose to share.
An admin reads the safety queue, which holds the user's own words at the moment
they said they were not safe. Those are not the same trust, and `EnsureStaff`
admits only `admin`. It answers **404, not 403**, so the console's routes do not
confirm their own existence to someone who may not use them.

The console never names anyone. Both the queue and the overview's recent-session
list print `UserHandle::for()` — a short salted hash of the id, stable per user
so two rows read as one person without saying who. It is one function in the
domain because two would drift, and then one screen's handle would be a
different person from the other's. It is not a security boundary; it keeps a
name and an email off a screen that does not need them.

**Twelve hex characters, where the designs' example shows four** — a deliberate
departure, like the colour tokens over AA contrast, because the shown value is
wrong for what the thing has to do. Four is 65,536 handles: measured, a
thousand sequential ids already produce five collisions and twenty thousand
produce 2,761. A collision leaks nothing; it **merges two people** on the one
screen where that matters most, so two people each in crisis read as one person
in crisis twice and a reviewer's judgement about escalation rests on an identity
that is not real. Eight characters is not enough either (about a 69% chance of
a collision somewhere at 100,000 users); twelve is about one chance in 55,000.
If a short handle is ever needed again, the answer is a stored column with a
unique index — impossible rather than improbable — which is a migration, where
this is a constant and nothing stores a handle.

### A coach sees only what a client shared

`App\Domain\CoachView` is the rule, and every read in `CoachService` goes
through it. `sharedWith()` and `summarise()` both take a **whole** journal and
share it down themselves, so a caller cannot summarise private entries by
passing the wrong list. The tempting alternative is a `where('shared_with_coach')`
in each query; the reason not to is that a forgotten `where` is silent, and what
it leaks is somebody's private session. The recurring belief is computed over
the shared set only — a belief said twice in private is not a pattern a coach
gets to see. `packages/protocol/src/coach.ts` is the TypeScript half, and the
parity fixture covers both.

Two gates, both needed: `EnsureCoach` says this person is a coach at all, and
`CoachController::authorizePairing()` says they are _this client's_ coach.
Neither implies the other, and a route with only the first would let any coach
read any client.

**A pairing row means an accepted pairing.** `ClientStatus` has one case, and
the `clients()` and `coaches()` relations filter on it, so a row that says
anything else grants nothing — including to `/me/coaches`, which answers "who
can read my sessions" and must not list someone who cannot. There used to be an
`invited` case, from before invitations had a table; nothing wrote it, and what
it described is a pairing the client never agreed to, which a coach would then
read shared entries through — sharing is a property of the journal entry, not
of the pairing, so "they have not accepted yet" would not have saved it. An
unaccepted invitation is a `coach_invites` row, which is where the coach's
screen already lists them.

**The client creates the pairing, and the client ends it.** A coach can open an
invitation to an email address; they cannot attach themselves to an account.
Accepting is what pairs them, only the address it was sent to may accept, and
`/me/coaches` lets the client see who can read their shared sessions and end it
immediately. A sharing rule the sharer cannot inspect or revoke is a promise
about someone else's behaviour, not a rule.

Ending a pairing does **not** unshare the entries: `shared_with_coach` is a
separate decision and stays where the user put it. What ends is anyone being
able to read them, because reading goes through the pairing.

**Open question for someone qualified:** a `coach_invites` row holds the
address it was sent to, and nothing deletes it. The address is not a user's —
that is the point of the table, a coach can invite somebody who has no account —
so this product stores an email address indefinitely because a third party typed
it, for an invitation that expired or was withdrawn and can never be accepted
again. Erasure covers the case where the invitee does have an account
(`AccountDeletionService` sweeps by address); it cannot cover the case where
they never signed up and never agreed to anything.

Any fix is a retention period, and picking one is a DPDP and product decision
rather than a refactor — the coach's screen is also the only record that they
invited somebody, which is a reason to keep it for a while and not a reason to
keep it forever. Expired reset tokens are the contrast worth noting: those have
a non-arbitrary answer, because a token past `config('auth.passwords')`'s
`expire` is dead by definition, so `auth:clear-resets` runs hourly on the
scheduler and no policy had to be invented.

A withdrawn invitation does not undo an accepted pairing, and the API refuses
rather than implying it might. There is no mail driver yet, so an invitation's
link comes back to the coach to pass on; the screen says so rather than implying
an email went out, and `CoachInviteController::forCoach()` stops returning the
token when mail is wired.

A coach learns that a session stopped for safety through `CoachAttention` —
that it happened, and when. Never what was said: a safety-stopped session is
never journalled, so it cannot be shared, and the words are the safety queue's.
A coach is not a reviewer.

That read **selects two timestamp columns**, not the row. `guided_sessions.data`
is the most personal column in the schema, and a coach's request does not ask
for it at all rather than asking and not using it. The encrypted cast is lazy,
so nothing was being decrypted either way — this is the difference between a
rule and a habit. It is asserted on the SQL, because there is nothing in the
response to see it by: adding a field to `CoachAttention` and reaching for
`$session->data` would otherwise break no test.

Both `openDraft()` and `publishDraft()` lock `protocol_versions` in id order
inside their transaction — the same lock in the same order, so they cannot
deadlock against each other. Publishing is the one where it prevents a bad
state: read outside the lock, two admins can each archive what was live before
either stores its replacement, and the product is left with two live versions.
Opening is the one where it only prevents a bad _answer_: the table is unique
on (major, minor) and `nextDraft()` is a pure function of the live version, so
two drafts were never possible, but `updateOrCreate` reads and then inserts, so
whoever lost the race got a constraint violation and a 500 from a button whose
contract is "or returns the one already open".

Publishing a protocol version is gated by the **server**, not by the editor:
`ProtocolVersion::publishProblems()` decides, the API refuses with 422 and that
list, and the screen renders what it is told. A disabled Publish button is a
courtesy; the refusal that matters is the one a screen cannot skip. There is one
draft at a time, a published version is never edited in place (editing opens the
next draft), and publishing archives the previous live row in the same
transaction — two live versions would mean two sets of questions in flight.

Which is also why a session is pinned to the version it started on: publishing
must not change the questions under someone part-way through.

Roles are set in the console (`/admin/users`), which is the only way — it used
to take a shell on the server. It is also the console's most consequential
screen, because granting `admin` grants the safety queue. Three guards and a
trail:

- **nobody changes their own role.** Not only against typos: an escalation one
  person can perform on themselves alone is one nobody else had to agree to.
- **the last admin cannot be demoted**, because the alternative is a product
  nobody can administer and a queue nobody can read. The count is taken
  **inside** the transaction, under a lock on the admin set in id order: two
  admins demoting each other at the same moment each saw two admins, each
  passed a check made before either wrote, and the product was left with none.
  That branch is reachable only under contention — sequentially, an admin
  cannot demote themselves, so the target can only be the last admin if the
  actor has stopped being one — and it therefore has no test. The lock is the
  fix; a sequential test of it would be the self-demotion rule wearing its
  name.
- **every change is recorded** in `role_changes`, with who did it, keeping both
  addresses as they were — an account can be renamed or deleted and the trail
  should still read. There is no route that edits or deletes a row there,
  because a trail that can be tidied is not one.

A no-op (setting the role it already has) records nothing: a trail of no-ops is
a trail nobody reads.

`AdminOverviewService` reads only plain columns — kind, step, end reason,
rating, the count of turns the safety screen could not read, and when the
longest-waiting open flag was raised. That last one is deliberately **not**
limited to the window: a flag raised three weeks ago and still open is exactly
what it is for, and a count alone cannot show it — four open flags reads as a
manageable afternoon until you learn the oldest has been waiting six days. The
queue itself shows each flag's age for the same reason; it used to show none.
`raisedAt` was in the API response all along and no screen printed it. It touches none of the encrypted text: the console answers "how is the
protocol working", and the one place staff read someone's words is the queue.
Its percentages are of **sessions started**, so a session that stopped for
safety (and therefore has no journal row) stays in the denominator rather than
flattering the numbers.

## The API pages, and is bounded

Four endpoints are paged, and they are the only ones with an envelope:
`GET /journal`, `GET /admin/safety-flags`, `GET /admin/users` and
`GET /admin/role-changes`. Everything else is a bare resource or a bare array.

```json
{ "items": [...], "nextCursor": "..." | null, "total": 42 }
```

Cursor, not offset: these lists grow while they are being read, and an offset
page silently repeats or skips a row when something is inserted between two
requests. For the queue that would mean a reviewer never seeing a flag.

A cursor is built from the ordering columns, so **every one of those orderings
ends in `id`** — `occurred_at`, `raised_at`, a name and `created_at` are none of
them unique, and a tie with no tiebreaker makes a page repeat a row. Check that
when adding a paged list; it is the whole reason the rule is written down. The
queue's severity is a stored `severity` column for the same reason: it used to
be a `CASE level ...` expression, which sorts correctly
but is not a column a cursor can read, and two pages overlapped. The rank itself
is still the domain's (`SafetyLevel::rank()`); the model keeps the column in
step on write.

Page sizes are bounded and a nonsense one falls back to the default. These rows
are decrypted one at a time, so an unbounded page is a way to make the server do
unbounded work.

## The API's shape

Resource responses carry **no `data` envelope**: `JsonResource::withoutWrapping()`
is called in `AppServiceProvider`. Assert `step.ordinal`, not
`data.step.ordinal`, and a collection comes back as a bare JSON array.

It is stated there because the default was already being defeated by accident —
Laravel skips its wrapper when the payload has its own `data` key, and
`SessionResource` has one. So sessions came back unwrapped while the journal came
back wrapped, and renaming that key would have silently reshaped every session
response.

**This API has no web routes, and so starts no sessions.** That is a privacy
property, not tidiness: a web route runs the `web` middleware group, that group
starts a session, and `SESSION_DRIVER=database` makes a session a row holding
the caller's **IP address and user-agent**. The skeleton's `GET /` returned
Laravel's `welcome` view, so every request to the API's root stored those — for
a page it does not serve and a session nothing reads, `user_id` being always
null with authentication by bearer token. Sanctum's `sanctum/csrf-cookie` was
the same thing and is off (`'routes' => false`); **turn it back on in the same
change that adopts cookie mode**, which cannot work without it.
`tests/Feature/NoWebSessionsTest.php` asserts there are no `web`-group routes at
all, because adding one is easy and the session it starts is invisible.

An unauthenticated request answers **401**, with or without an `Accept` header.
Laravel's default sends a guest to `route('login')`, which this API does not
have, and the auth middleware resolves that before the exception handler decides
on JSON — so a bare request used to get a 500. `bootstrap/app.php` sets
`redirectGuestsTo` to null; there is a test for it.

CORS is a list, never `*`: `CORS_ALLOWED_ORIGINS`, defaulting to the two local
spellings of the dev server. This API carries personal health content behind
bearer tokens.

The limit on the guessable routes — sign-in, registration, password recovery,
opening an invitation — is keyed by **the account being guessed**, not by the
address asking. `AppServiceProvider`'s `guessable` limiter does it, and
India-first is the reason: a mobile carrier puts tens of thousands of
subscribers behind one public IP, so a per-IP budget is one a whole network
shares, and the people it locks out are strangers to each other — one of whom
cannot reach their journal. A per-IP ceiling stays as a second line against one
machine spraying many accounts, set where only a script reaches it. Do not
replace this with `throttle:N,1`, which is per IP and was what it replaced.

The web client keeps its token in `localStorage`, which an XSS can read. The
right answer is Sanctum's cookie mode; the shortcut is documented at the top of
`apps/web/src/lib/api.ts` and is not an opinion that it is fine.

What stands in for it meanwhile is the Content-Security-Policy in
`apps/web/next.config.ts`: `connect-src` names this origin and the API's and
nothing else, so a token that is read cannot be sent anywhere, and `img-src`,
`form-action` and `base-uri` close the other ways out. The API's origin comes
from the same `NEXT_PUBLIC_API_URL` the client reads, so the policy cannot name
a different API from the one the app calls. `script-src` keeps `'unsafe-inline'`
on purpose — the alternative is a per-request nonce, and every route here is
statically prerendered, so the middleware minting it would make all of them
dynamic. Be plain about what that leaves: injected inline script still runs.

A strict policy is only available because the app loads nothing from anywhere
else — no analytics, no tag manager, no webfont CDN. `e2e/privacy.mjs` keeps
both halves honest: it asserts no screen trips the policy, and then, from
inside a real page, it does what a payload would do — pulls in a script from
another origin and tries to `fetch` the token out — and asserts the browser
refuses both. `Permissions-Policy` denies the microphone, which is true only
while `UserEar` is unbound; binding a listener means changing that line.

## Conventions

- In `packages/*`, use `.js` extensions in relative import specifiers, even for
  TypeScript sources — required by `NodeNext` resolution. In `apps/web` do
  **not**: it resolves with `Bundler`, and Turbopack will not rewrite `.js` to
  `.ts`.
- Type-only imports as `import type { ... }` (lint-enforced).
- Tests co-located as `*.test.ts` next to the module.
- The session reducer is pure: `apply()` must never mutate its input.
- Prefer fixing types over casting. `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on.

## tsconfig layout

- `tsconfig.base.json` — shared compiler options, extended by each package.
- `tsconfig.json` — solution file; `references` only.
- `packages/*/tsconfig.json` — the package build (emits `dist/`, `composite`,
  excludes tests).
- `tsconfig.test.json` — no-emit, spans every package's `src` plus root
  `*.config.ts`; backs `typecheck` and ESLint's `parserOptions.project`.

If a new file reports "not found in any of the provided project(s)" from ESLint,
it is missing from `tsconfig.test.json`'s `include`.

## Gotchas

- `tsc --noEmit` cannot target a `composite` project, hence `tsconfig.test.json`.
- `exclude` is inherited by extending configs even when `include` is overridden.
- `pnpm/action-setup` must run **before** `actions/setup-node` in CI, since
  `cache: pnpm` needs the pnpm binary to exist.
- `tsBuildInfoFile` points inside `dist/`. Left at its default, deleting `dist/`
  without the `.tsbuildinfo` makes `tsc --build` report success and emit
  nothing.
- `noPropertyAccessFromIndexSignature` is off in `apps/web` only: CSS Modules
  type as an index signature, so every `styles.foo` would need `styles['foo']`.

## Decisions taken

- **Design direction: Warm & Clear.** Settled; see above.
- **Client stack: Expo for mobile, Next.js for web and desktop**, all three
  consuming `packages/*`. Scaffolded and built; see the sections above for what
  is verified on each and what is not.
- **Step prompt copy stays `null`** until the PRD supplies it. Do not invent it.
- **Pricing stays unset** — the designs show `[PRICE]/mo` placeholders. What a
  plan _allows_ is settled, though: see below.

- **Backend: Laravel 13 + MySQL**, owning the session, the protocol and safety.
  Chosen over a TypeScript backend so the safety rules exist exactly once;
  MySQL was never the hard part of that decision.

Still unchosen: the voice stack (speech-to-text, text-to-speech, turn-taking).
PHP is a poor fit for long-lived audio streaming, so expect a separate small
gateway for the voice loop with Laravel owning everything around it.

The interface it stays behind is `apps/web/src/lib/voice/`, in the surface and
not in `packages/protocol`, which must stay free of speech. Two halves, kept
apart on purpose:

- **`GuideVoice` — the guide speaking.** Bound, and working. `speak()` is only
  ever handed `session.say`, which is the protocol's own copy and is already on
  the screen, so saying it aloud discloses nothing new. It is **never** the
  user's words. `SpeechEngine` is the narrow seam a vendor binds behind; the Web
  Speech API lives in `browser-engine.ts` and nowhere else, so the browser's
  accident of design does not become the requirement.
- **`UserEar` — hearing the user.** Deliberately unbound, and it says so. Every
  option today sends the user's audio somewhere: Chrome's `SpeechRecognition`
  uploads it to Google, every hosted service uploads it by definition, and an
  on-device model is real work. The setup screen says **"Your voice is never
  saved"**, and India-first puts DPDP consent in the frame. So `noEar` reports
  itself unavailable with a reason the screen shows, and every session is typed.
  **Binding a listener is a product and legal decision, not a refactor.**

So "hands free" today means a guide that speaks and answers that are typed. The
setup screen says that rather than implying the whole mode works.

## Safety screening is server-side now

`POST /api/sessions/{id}/turns` is the **only** way to advance a session, and it
screens before the guide is consulted. A client cannot skip it by not calling
it, because there is no other path. `RiskScreen` is bound in
`DomainServiceProvider`, which is where a real classifier replaces the phrase
screen.

The browser copy in `packages/protocol` is now a convenience for instant
feedback, never the enforcement. Do not let it become the only check again.

**The client is told as little as possible.** `SessionResource` never returns
the risk level, the category or the matched phrase: a user mid-crisis has no use
for "you tripped the self-harm rule", and a client that knows the rule can be
built to dodge it. There is a test asserting the response contains neither.

API resources are **not** wrapped in a `data` envelope in this Laravel version —
assert on `step.ordinal`, not `data.step.ordinal`.
