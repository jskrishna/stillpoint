# Stillpoint

A voice guide that helps someone calm down and understand why something hurt, in
six steps.

> _"Upset about something? Talk it through."_

Stillpoint walks a user through the six-step **Choose Again** process by voice.
It is explicitly **not therapy or medical advice**, and the user can stop at any
time. If what they say suggests they may be in danger, the session stops and
helplines are shown immediately.

**Canada is the first market and India is the second.** Prices are in CAD, the
helplines are 9-8-8, Québec's 1-866-APPELLE and 911, and a new account is
assumed to be in Canada. The design artifacts were drawn India-first, so where
one of them says ₹ or Tele-MANAS it is older than this line.

## The six steps

| #   | Step           | What the user does                           |
| --- | -------------- | -------------------------------------------- |
| 1   | Notice         | Say what happened.                           |
| 2   | Responsibility | See that the hurt comes from how you see it. |
| 3   | Feel           | Name what you feel.                          |
| 4   | Remember       | Find when you first felt this as a child.    |
| 5   | Inquire        | Say what you decided about yourself then.    |
| 6   | Forgive        | Let that old belief go.                      |

A session ends on a summary: what happened, what you felt, the old belief, the
forgiveness spoken at step 6, and a "do you feel a bit calmer?" rating. It is
then saved to the journal, which only its user can see until they share an entry
with a coach.

Sessions come in two kinds. A **full** session walks all six steps; a **quick**
one is listed as "Quick session". Plans treat them differently — Free allows
three full sessions a week but unlimited quick ones. Insights summarise the last
30 days: sessions, how many the user said they felt calmer after, how many
reached step 6, the feelings chosen most, and the belief that keeps coming back.

## Surfaces

| Surface           | Where                    | State                                                                          |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------ |
| **Mobile app**    | `apps/mobile`            | Built. Expo + expo-router. Not yet run on a physical device — see its README.  |
| **Desktop app**   | `apps/desktop`           | Built. Electron around the web app. No installer yet — see its README.         |
| **Website**       | `apps/web`               | The app is built; the marketing site and pricing are pending a design rebuild. |
| **Admin console** | `apps/web/src/app/admin` | Built: overview, safety queue, step-prompt editor, users and roles.            |
| **Coach portal**  | `apps/web/src/app/coach` | Built: client list and detail, shared sessions only.                           |

**`pnpm run demo`** brings the whole thing up, seeded, and prints the accounts
and URLs. **`pnpm run e2e`** runs the end-to-end checks against it — `ls e2e/*.mjs | grep -vE 'browser|report|run'` is the list, and there are seven.

**[`LAUNCH.md`](LAUNCH.md) is what stands between this and a stranger
finishing a session safely**, in order, with what each item actually needs. The
first three are a clinician reading the risk screen, a mail provider, and
somewhere to run it with TLS. It is also honest about the other half: what is
already done and tested.

**[`DECISIONS.md`](DECISIONS.md) is the list of what is waiting on somebody
choosing something** rather than on somebody writing code: the step copy, the
voice vendor, a mail provider, clinical sign-off for the risk screen, billing,
and three retention questions. Each is also written down where the code waits
for it; that page exists so the list can be read in one go.

Plans: **Free** (3 full sessions a week, unlimited quick sessions, journal),
**Plus** (unlimited sessions, insights, better voices), **Coach** (up to 25
clients, shared sessions and notes). Help in a crisis is always free.

## Repository layout

```
.
├── apps/
│   ├── api/                 Laravel 13 + MySQL — the backend, and the authority on the protocol
│   ├── web/                 @stillpoint/web — Next.js: the app, the console, the coach portal
│   ├── mobile/              @stillpoint/mobile — Expo: iOS and Android
│   └── desktop/             @stillpoint/desktop — Electron: a shell around the web app
├── packages/
│   ├── protocol/            @stillpoint/protocol — the domain, in TypeScript
│   ├── design-tokens/       @stillpoint/design-tokens — Warm & Clear colour, type, space
│   └── client/              @stillpoint/client — the typed API client, one for all the surfaces
├── parity/                  the cross-language fixture both test suites assert against
├── e2e/                     seven browser checks against a running stack
├── deploy/                  Dockerfiles, nginx, and what running this actually needs
└── .github/workflows/ci.yml
```

Three rules hold this together:

- **`apps/api/app/Domain` is the authority.** The PHP there owns the protocol
  and safety. `packages/protocol` is a port of the same rules, and while both
  exist they must agree — `parity/cases.json` is asserted by both test suites,
  so a rule that moves in one language and not the other turns one of them red.
- **`packages/protocol` is free of I/O and of presentation** — no network, no
  storage, no speech, no framework, no colours. Feeling ids and labels are
  domain; feeling colours are presentation and live in `design-tokens`.
- **`packages/client` is the only API client.** Two workspaces consume it —
  `apps/web` and `apps/mobile`, which is every workspace that talks to the API,
  since `apps/desktop` depends on `@stillpoint/web` and implements nothing
  itself — so the paths and field names cannot drift apart. It takes the two things that
  genuinely differ as arguments: the base URL and where the token is kept.

## Getting started

```bash
corepack enable        # pnpm 10, as pinned in package.json
pnpm install
pnpm run check         # build packages, then format + lint + typecheck + test
pnpm run build         # every project: packages, web, mobile, desktop
```

The backend is separate, and has its own README in `apps/api`:

```bash
cd apps/api
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite   # no MySQL in a development container
php artisan migrate && php artisan db:seed
php artisan serve --port=8000
./vendor/bin/phpunit             # the domain and feature tests
```

Then `cd apps/web && pnpm run dev` for the web app on `:3000`,
`pnpm --filter @stillpoint/mobile run start` for Expo, or
`pnpm --filter @stillpoint/desktop run start` for the desktop shell.

To run the whole thing with no toolchain at all, see [`deploy/`](deploy/README.md):
`docker compose up --build`.

| Script                     | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `pnpm run check`           | The JavaScript gates CI runs, in CI's order          |
| `pnpm run verify:clean`    | All of that from nothing built, plus PHP — see below |
| `pnpm run build`           | Every workspace project, packages first              |
| `pnpm run typecheck`       | Every source, test and config, no emit               |
| `pnpm run lint`            | ESLint, type-aware                                   |
| `pnpm run test`            | Vitest                                               |
| `pnpm run parity:generate` | Regenerate the cross-language fixture — read first   |

**Before a push, `pnpm run verify:clean`.** It deletes `node_modules` and every
build directory, reinstalls from the lockfile, and runs the gates in CI's order
plus the full build, Pint and PHPUnit. `apps/web` resolves `@stillpoint/*`
through `node_modules` to their **built** output, so an export that was deleted
or never emitted still resolves against the `dist/` from before the change —
and a leftover `dist/` has twice made a broken commit look green here.

## Safety is a hard stop

This is the one rule in the codebase that is not a preference. The product
promises, on its own marketing site, that a session stops when a user may be in
danger. So:

- a `crisis` safety signal ends the session with `endReason: 'safety_stop'`;
- an ended session is terminal — every later event except the summary rating
  leaves it unchanged, so a late turn cannot reopen it;
- a session's safety level only ever rises, never falls;
- **a session that ended for safety never gets a journal row.** The absence of
  the row is how that is kept.

`POST /api/sessions/{id}/turns` is the only way to advance a session, and it
screens for risk **before the guide is consulted** — a model answering someone
who has just said they are not safe is the exact failure that ordering prevents.
Nothing comes before that screen, including the rate limit: the turns route
carries no throttle middleware, because middleware refuses a request before
anything has read what it said.

The client is told as little as possible. A session response never carries the
risk level, the category or the matched phrase: a user mid-crisis has no use for
"you tripped the self-harm rule", and a client that knows the rule can be built
to dodge it.

`risk.ts` is a deliberately over-eager phrase screen, and a **backstop rather
than the detector**: it will miss things, and no clinical claim should rest on
it. A real deployment needs a trained model and sign-off from someone qualified
to judge it.

It covers English, French, Hinglish and Hindi, thinly. It used to cover English
only, and the normaliser dropped every non-Latin character — so a crisis
disclosure written in Devanagari became an empty string and was graded as
nothing. French was the sharper version of the same failure: Latin script, so
the string was not emptied, only its accents deleted, and "je suis fatigué"
came back `none` with full confidence in an official language of the first
market. Both are fixed; the remaining thinness is the argument for making the
classifier multilingual rather than translating one.

**A Latin-script language it has no phrases for still reports nothing, with
confidence.** `quiero morirme` normalises cleanly and matches nothing. Do not
read a clean result as evidence of safety in a language nobody has checked.

It also says when it **could not read** an utterance at all. Bengali, Tamil,
Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi and Urdu are still outside
it, and the honest answer for those is "not screened" rather than the "nothing
found" they used to get — the same answer an ordinary bad day gets. Nobody is
flagged or stopped for it; the console counts it, because a count is what says
whether the next language is worth covering and the alternatives (grading an
unreadable sentence up, or flagging every turn a Tamil speaker types) are both
wrong.

Helplines resolve by country and cover Canada (9-8-8 call or text, Québec's
1-866-APPELLE, and 911) and India (Tele-MANAS 14416 and 112).
`helplinesFor()` returns an empty list anywhere else rather than something
plausible but wrong — a wrong crisis number is worse than none. Québec is
listed separately on purpose: it answers through its own line rather than 988,
and somebody in Montréal dialling the wrong one of those is the failure that
screen exists to prevent.

## Personal content is encrypted at rest

Session content, the journal's title, what happened, the belief, the
forgiveness, the memory, the note, and a safety flag's excerpt all use Laravel's
`encrypted` casts. Encrypted columns cannot be queried or indexed, which is
deliberate and has a cost: aggregates over beliefs are computed in PHP over a
user's own window rather than with `GROUP BY`.

**`APP_KEY` is the whole journal.** There is no second copy and no recovery
path. It is also why offering password reset is safe — the key is not derived
from anyone's password. Rotating it is a migration, and
`php artisan stillpoint:rotate-key` is it;
[`deploy/README.md`](deploy/README.md) has the two-step procedure and why the
order of the steps is the safety of it.

A user can erase their own account, and it takes everything — including the
things no foreign key reaches, which are the ones that get missed: a pending
password reset, a coach's invitation addressed to them, and their row in the
web session table. `AccountDeletionService` lists all of them and why each one
needs saying.

## Who reads what

A coach is not an admin. A coach reads the sessions a client **chose to share**;
an admin reads the safety queue, which holds a user's own words at the moment
they said they were not safe. Those are not the same trust.

- `role` is not fillable, so no request can make anyone staff.
- The console answers **404, not 403**, to someone without the role, so its
  routes do not confirm their own existence.
- The console never names anyone: it prints a short stable handle.
- The client creates a coach pairing by accepting an invitation, and the client
  ends it. A sharing rule the sharer cannot inspect or revoke is a promise about
  someone else's behaviour, not a rule.
- Every role change is recorded, with who made it, and there is no route that
  edits or deletes the trail.

## Prompt copy is versioned, not compiled in

Staff edit the step questions in the admin console, which shows a live version
and an unpublished draft:

- only a **draft** is editable — a live version is what users are running
  against, and an archived one is a record;
- **publishing is refused by the server**, not by the editor, for a draft with
  any step missing its question, completion criterion or turn limit, and it
  returns every problem named by step so the screen can show them in place;
- a session records the version it started on, so publishing never changes the
  questions under someone already part-way through.

## Checks

`pnpm run check` is unit tests, types, lint and formatting. Beyond it:

- **`parity/cases.json`** — a checked-in table of utterances and step answers
  with the expected risk grade and capture, asserted by both the TypeScript and
  the PHP suite. Regenerating it to turn a red test green records the
  divergence instead of fixing it.
- **`e2e/`** — seven scripts driving a real browser against the real stack: the
  whole user journey including the safety stop, the console and who may read a
  flag, the coach portal and what a coach cannot see, axe-core at WCAG 2.2 AA
  over every route in both palettes at 390 and 1440, a check that no request
  leaves this origin and that the page's own Content-Security-Policy refuses an
  attempt to send the token elsewhere, the mobile app's journey through its web
  export, and the desktop shell launched under Xvfb. They run in CI, against a
  seeded database.
- **CI also** runs the migrations up and back down against MySQL 8.4, and
  builds the deployment images and brings the stack up.

## Accessibility

Every route passes axe-core at WCAG 2.2 AA, in light and dark at both 390px and
1440px — 2.2 rather than 2.1 for one criterion, 2.5.8 Target Size, which is the
one a phone-first product should be measured against and which the tags left out
until recently. `pnpm run check` separately asserts the contrast of every text role
against every surface, so a colour change that drops a pair below AA fails the
build rather than reaching someone who cannot read it.

**Three of the designs' own colours did not meet AA**, and the tokens depart
from them deliberately:

| Token                | Designs   | Here      | Why                                              |
| -------------------- | --------- | --------- | ------------------------------------------------ |
| `muted`              | `#8A7A6E` | `#74675D` | 3.78:1 on the page background                    |
| `accent` (as a fill) | `#E4572E` | `#CB4D29` | white on it was 3.68:1                           |
| `accentText` (new)   | —         | `#B54525` | the accent as small text failed on every surface |

`dangerInk` is also new: white on the dark palette's red is 3.08:1, so dark mode
puts ink on it instead. Each change is the smallest that reaches 4.5:1, so the
palette still reads as the designs intend.

## Design language

**Warm & Clear**: cream `#FBF4EC`, a single terracotta accent `#E4572E`,
Newsreader for the guide's voice and the user's words, Hanken Grotesk for
everything they operate. Light and dark renderings define the same roles.

An earlier "Dusk to Light" exploration exists in the design artifacts and is not
current — Warm & Clear is the newest direction and the only one drawn for all
five surfaces. The one thing carried over is the feeling palette, since nothing
in Warm & Clear assigns the twelve feelings colours.

## The conversation seam

The guide is where a language model goes. `ScriptedGuide` is a deterministic
stand-in that follows the protocol's own prompts and backups so the turn loop
can be exercised today; it understands nothing, and what it records is the
answer taken at face value. `RiskScreen` is bound in `DomainServiceProvider`,
which is where a real classifier replaces the phrase screen.

The voice loop is behind an interface in each surface rather than in
`packages/protocol`, which must stay free of speech. The guide **speaking**
works, and is only ever handed the protocol's own copy — never the user's words.
**Hearing** the user is deliberately unbound: every option today sends their
audio somewhere, the setup screen promises their voice is never saved, and
binding a listener is a product and legal decision rather than a refactor. So
every session is typed, and both surfaces say so in the same words.

## Still open

1. **Step prompt copy.** Only step 4 "Remember" is fully specified anywhere in
   the designs. The rest stay `null` rather than invented — guessed copy would
   silently become the product's therapeutic voice. The real copy lives in the
   PRD, and the admin console is where it goes in.
2. **Voice stack.** Speech-to-text, text-to-speech and turn-taking are
   unspecified, and kept behind an interface so the choice stays reversible.
3. **Billing.** The prices are set, in CAD, and there is no way to pay: no
   provider, no checkout, no subscription. An admin can _grant_ a plan from the
   console, which is how a pilot account gets onto Plus, so the paid plans are
   reachable — nobody can buy one.
4. **A classifier for risk**, and sign-off from someone qualified to judge it.
5. **Mail.** No provider is chosen, so a password-reset link is logged rather
   than sent — in a deployment, nobody can yet reset a password.
6. **The marketing site**, pending a design rebuild.
7. **A safeguarding question**: a safety flag is deleted with the account,
   because that is what erasure means — which also means a reviewer cannot
   follow up on someone who disclosed danger and then left. Whether an
   anonymised flag should outlive an erasure is a clinical and privacy-law
   decision — PIPEDA and Québec's Law 25 first, DPDP behind them.

## License

[MIT](LICENSE).
