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
It cannot read tone, context, metaphor or code-switching, and it knows English
phrasings only.

**Never describe it as sufficient, and never let a clinical claim rest on it.**
Shipping needs a trained model and sign-off from someone qualified to judge it.
It is tuned for recall on purpose: a false flag costs a reviewer a minute, a
missed one costs something that cannot be undone. Grade an ambiguous phrase up.

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

## Do not invent product copy

Only step 4 "Remember" is fully specified in the designs. Unspecified prompt
copy, completion criteria and turn limits are `null`, and `incompleteSteps()`
reports them. **Do not fill these with invented text** — the real copy lives in
the PRD. A `null` is an honest gap; a guess silently becomes the product's
voice.

The same goes for pricing: the designs show `[PRICE]/mo` placeholders.

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
and 1440 — 64 combinations — and the last run was clean across all of them. It
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
apps/web/                 @stillpoint/web — Next.js: marketing site and web app
parity/                   the cross-language fixture both suites assert against
e2e/                      a by-hand browser check of web against a running API
```

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

`e2e/` holds four by-hand checks against a running API — see `e2e/README.md`.
`flow.mjs` is a by-hand check of the web app against a running API —
register, consent, a full session, journal, insights, settings, the safety stop
and sign-out. It needs two servers, so it is not in `check` and not in CI; see
`e2e/README.md`. Run it after changing the session flow, `apps/web/src/lib/api.ts`
or anything in `apps/api/app/Domain`. Its last section is the one that matters:
it types crisis language into a real browser and asserts the **server** ended the
session, refuses another turn on it (409), shows Tele-MANAS and 112, and wrote no
journal row.

CI runs both as separate jobs. PHP here is 8.3; Laravel 13 needs ^8.3, and Pest
5 needs 8.4, so the API uses PHPUnit — which is what the skeleton ships anyway.

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

## Personal content is encrypted at rest

The session data, the journal's title, what happened, belief, forgiveness,
memory and note, and a safety flag's excerpt all use Laravel's `encrypted`
casts. This is the most personal text the product holds, and a flag's excerpt
is the single most sensitive column in the schema.

Encrypted columns cannot be queried or indexed, which is deliberate and has a
cost: aggregates over beliefs (the "belief that comes back") are computed in PHP
over a user's own window, not with `GROUP BY`. Do not drop the encryption to
make a query easier.

The journal table is also the rule, not just a store: **a session that ended for
safety never gets a row.** `JournalEntry::fromSession()` returns null for it,
and the absence of the row is how that is kept.

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
list print `UserHandle::for()` — "u_8f21", a short hash, stable per user so two
rows read as one person without saying who. It is one function in the domain
because two would drift, and then one screen's `u_8f21` would be a different
person from the other's. It is not a security boundary; it keeps a name and an
email off a screen that does not need them.

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

**The client creates the pairing, and the client ends it.** A coach can open an
invitation to an email address; they cannot attach themselves to an account.
Accepting is what pairs them, only the address it was sent to may accept, and
`/me/coaches` lets the client see who can read their shared sessions and end it
immediately. A sharing rule the sharer cannot inspect or revoke is a promise
about someone else's behaviour, not a rule.

Ending a pairing does **not** unshare the entries: `shared_with_coach` is a
separate decision and stays where the user put it. What ends is anyone being
able to read them, because reading goes through the pairing.

A withdrawn invitation does not undo an accepted pairing, and the API refuses
rather than implying it might. There is no mail driver yet, so an invitation's
link comes back to the coach to pass on; the screen says so rather than implying
an email went out, and `CoachInviteController::forCoach()` stops returning the
token when mail is wired.

A coach learns that a session stopped for safety through `CoachAttention` —
that it happened, and when. Never what was said: a safety-stopped session is
never journalled, so it cannot be shared, and the words are the safety queue's.
A coach is not a reviewer.

Publishing a protocol version is gated by the **server**, not by the editor:
`ProtocolVersion::publishProblems()` decides, the API refuses with 422 and that
list, and the screen renders what it is told. A disabled Publish button is a
courtesy; the refusal that matters is the one a screen cannot skip. There is one
draft at a time, a published version is never edited in place (editing opens the
next draft), and publishing archives the previous live row in the same
transaction — two live versions would mean two sets of questions in flight.

Which is also why a session is pinned to the version it started on: publishing
must not change the questions under someone part-way through.

`AdminOverviewService` reads only plain columns — kind, step, end reason,
rating. It touches none of the encrypted text: the console answers "how is the
protocol working", and the one place staff read someone's words is the queue.
Its percentages are of **sessions started**, so a session that stopped for
safety (and therefore has no journal row) stays in the denominator rather than
flattering the numbers.

## The API pages, and is bounded

`GET /journal` and `GET /admin/safety-flags` are paged, and they are the only
two endpoints with an envelope:

```json
{ "items": [...], "nextCursor": "..." | null, "total": 42 }
```

Cursor, not offset: both lists are ordered by time and grow at the top, and an
offset page silently repeats or skips a row when something is inserted between
two requests. For the queue that would mean a reviewer never seeing a flag.

A cursor is built from the ordering columns, so **both orderings end in `id`** —
`occurred_at` and `raised_at` are not unique, and a tie with no tiebreaker makes
a page repeat a row. The queue's severity is a stored `severity` column for the
same reason: it used to be a `CASE level ...` expression, which sorts correctly
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

An unauthenticated request answers **401**, with or without an `Accept` header.
Laravel's default sends a guest to `route('login')`, which this API does not
have, and the auth middleware resolves that before the exception handler decides
on JSON — so a bare request used to get a 500. `bootstrap/app.php` sets
`redirectGuestsTo` to null; there is a test for it.

CORS is a list, never `*`: `CORS_ALLOWED_ORIGINS`, defaulting to the two local
spellings of the dev server. This API carries personal health content behind
bearer tokens.

The web client keeps its token in `localStorage`, which an XSS can read. The
right answer is Sanctum's cookie mode; the shortcut is documented at the top of
`apps/web/src/lib/api.ts` and is not an opinion that it is fine.

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
- **Client stack: Expo for mobile, Next.js for web and desktop**, both consuming
  `packages/*`. Not yet scaffolded.
- **Step prompt copy stays `null`** until the PRD supplies it. Do not invent it.
- **Pricing stays unset** — the designs show `[PRICE]/mo` placeholders.

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
