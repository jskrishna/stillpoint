# Stillpoint

A voice guide that helps someone calm down and understand why something hurt, in
six steps.

> _"Upset about something? Talk it through."_

Stillpoint walks a user through the six-step **Choose Again** process by voice.
It is explicitly **not therapy or medical advice**, and the user can stop at any
time. If what they say suggests they may be in danger, the session stops and
helplines are shown immediately.

The product is India-first: ₹ pricing, Tele-MANAS and 112 as the helplines.

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
│   └── client/              @stillpoint/client — the typed API client, one for every surface
├── parity/                  the cross-language fixture both test suites assert against
├── e2e/                     four browser checks against a running stack
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
- **`packages/client` is the only API client.** Four surfaces consume it, so the
  paths and field names cannot drift apart. It takes the two things that
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

| Script                     | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `pnpm run check`           | Everything CI runs, in CI's order                  |
| `pnpm run build`           | Every workspace project, packages first            |
| `pnpm run typecheck`       | Every source, test and config, no emit             |
| `pnpm run lint`            | ESLint, type-aware                                 |
| `pnpm run test`            | Vitest                                             |
| `pnpm run parity:generate` | Regenerate the cross-language fixture — read first |

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

It covers English, Hinglish and Hindi, thinly. It used to cover English only,
and the normaliser dropped every non-Latin character — so a crisis disclosure
written in Devanagari became an empty string and was graded as nothing, in a
product that is India-first. That is fixed; the remaining thinness is the
argument for making the classifier multilingual rather than translating one.

Helplines resolve by country and currently cover India only (Tele-MANAS 14416,
emergency 112), matching the designs. `helplinesFor()` returns an empty list
elsewhere rather than something plausible but wrong.

## Personal content is encrypted at rest

Session content, the journal's title, what happened, the belief, the
forgiveness, the memory, the note, and a safety flag's excerpt all use Laravel's
`encrypted` casts. Encrypted columns cannot be queried or indexed, which is
deliberate and has a cost: aggregates over beliefs are computed in PHP over a
user's own window rather than with `GROUP BY`.

**`APP_KEY` is the whole journal.** There is no second copy and no recovery
path. It is also why offering password reset is safe — the key is not derived
from anyone's password. [`deploy/README.md`](deploy/README.md) says this first,
and at more length.

A user can erase their own account, and it takes everything.

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
- **`e2e/`** — four scripts driving a real browser against the real stack:
  the whole user journey including the safety stop, the console and who may
  read a flag, the coach portal and what a coach cannot see, and axe-core at
  WCAG 2.1 AA over every route in both palettes at 390 and 1440. They run in
  CI, against a seeded database.
- **CI also** runs the migrations up and back down against MySQL 8.4, and
  builds the deployment images and brings the stack up.

## Accessibility

Every route passes axe-core at WCAG 2.1 AA, in light and dark at both 390px and
1440px. `pnpm run check` separately asserts the contrast of every text role
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
3. **Pricing.** `[PRICE]/mo` placeholders for Plus and Coach. Currency is ₹.
4. **A classifier for risk**, and sign-off from someone qualified to judge it.
5. **Mail.** No provider is chosen, so a password-reset link is logged rather
   than sent — in a deployment, nobody can yet reset a password.
6. **The marketing site**, pending a design rebuild.
7. **A safeguarding question**: a safety flag is deleted with the account,
   because that is what erasure means — which also means a reviewer cannot
   follow up on someone who disclosed danger and then left. Whether an
   anonymised flag should outlive an erasure is a clinical and DPDP decision.

## License

[MIT](LICENSE).
