# Stillpoint

A voice guide that helps someone calm down and understand why something hurt, in
six steps.

> _"Upset about something? Talk it through."_

Stillpoint walks a user through the six-step **Choose Again** process by voice.
It is explicitly **not therapy or medical advice**, and the user can stop at any
time. If what they say suggests they may be in danger, the session stops and
helplines are shown immediately.

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
one is shorter and is listed as "Quick session". Plans treat them differently —
Free allows three full sessions a week but unlimited quick ones.

Insights summarise the last 30 days: sessions, how many the user said they felt
calmer after, how many reached step 6, the feelings chosen most, and the belief
that keeps coming back.

## Surfaces

Five surfaces are designed, all driven by the same protocol:

| Surface       | Scope                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mobile app    | 390 × 844. Onboarding, consent, voice setup, all six steps, safety pause, summary, journal, insights, settings, upgrade. |
| Desktop app   | 1440 × 900. The same flow in a sidebar layout.                                                                           |
| Website       | Landing, pricing, plan & billing.                                                                                        |
| Admin console | Overview, sessions, safety flag queue, step-prompt editor, users & plans.                                                |
| Coach portal  | Client list and client detail — shared sessions only.                                                                    |

Plans: **Free** (3 full sessions a week, unlimited quick sessions, journal),
**Plus** (unlimited sessions, insights, better voices), **Coach** (up to 25
clients, shared sessions and notes). Help in a crisis is always free.

## Repository layout

```
.
├── packages/
│   ├── protocol/            # @stillpoint/protocol — the domain core
│   │   └── src/
│   │       ├── steps.ts     # the six steps, their prompts and completion rules
│   │       ├── session.ts   # the session state machine (pure reducer)
│   │       ├── version.ts   # live/draft protocol versions and publishing
│   │       ├── conversation.ts # one turn: safety screened, then the guide
│   │       ├── guide.ts     # the guide seam — an LLM slots in here
│   │       ├── risk.ts      # safety phrase screen (a backstop, not the detector)
│   │       ├── journal.ts   # entries derived from finished sessions
│   │       ├── insights.ts  # what the journal adds up to over a window
│   │       ├── feelings.ts  # the feelings a session can capture
│   │       └── safety.ts    # safety levels, actions and helplines
│   └── design-tokens/       # @stillpoint/design-tokens — Warm & Clear
│       └── src/
│           ├── color.ts     # light and dark palettes
│           ├── typography.ts
│           ├── space.ts     # spacing, radii, control sizes, viewports
│           ├── feelings.ts  # the colour each feeling carries
│           └── css.ts       # emits the tokens as CSS custom properties
├── apps/                    # (empty) surfaces will live here
└── .github/workflows/ci.yml
```

`packages/protocol` is free of I/O and of presentation — no network, no storage,
no speech, no colours — so the rules stay testable and every surface can drive
them. `packages/design-tokens` holds everything visual, in one place, for both
web (as CSS custom properties) and native (as plain objects).

## Getting started

```bash
corepack enable   # pnpm 10, as pinned in package.json
pnpm install
pnpm run check    # format check + lint + typecheck + test, in CI's order
pnpm run build
```

| Script                                           | Description                                         |
| ------------------------------------------------ | --------------------------------------------------- |
| `pnpm run build`                                 | Build every workspace package                       |
| `pnpm run typecheck`                             | Type-check all sources, tests and configs (no emit) |
| `pnpm run lint` / `lint:fix`                     | ESLint with type-aware rules                        |
| `pnpm run format` / `format:check`               | Prettier                                            |
| `pnpm run test` / `test:watch` / `test:coverage` | Vitest                                              |
| `pnpm run check`                                 | Everything CI runs, in the same order               |

## Prompt copy is versioned, not compiled in

Staff edit the step questions in the admin console, which shows a live version
and an unpublished draft. `version.ts` models that:

- only a **draft** is editable — a live version is what users are running
  against, and an archived one is a record;
- `publish()` **refuses a draft with any step missing its question, completion
  criterion or turn limit**, and returns every problem named by step rather than
  throwing, so the admin screen can show them in place. The baseline currently
  fails with 13 problems, which is the honest state of the copy;
- a session records the version it started on, so publishing never changes the
  questions under someone already part-way through.

## Safety is a hard stop

This is the one rule in the codebase that is not a preference. The product
promises, on its own marketing site, that a session stops when a user may be in
danger. So in `packages/protocol`:

- a `crisis` safety signal ends the session with `endReason: 'safety_stop'`;
- an ended session is terminal — every later event except the summary rating
  leaves it unchanged, so a late transcript turn cannot reopen it;
- a session's safety level only ever rises, never falls.

These are covered by tests. Treat a change that weakens them as a bug.

Helplines are resolved by country and currently cover India only
(Tele-MANAS 14416, emergency 112), matching the designs. `helplinesFor()`
returns an empty list elsewhere rather than something plausible but wrong.

## Design language

**Warm & Clear**: cream `#FBF4EC`, a single terracotta accent `#E4572E`,
Newsreader for the guide's voice and the user's words, Hanken Grotesk for
everything they operate. Light and dark renderings define the same roles.

An earlier "Dusk to Light" exploration exists in the design artifacts and is not
current — Warm & Clear is the newest direction and the only one drawn for all
five surfaces. The one thing carried over is the feeling palette, since nothing
in Warm & Clear assigns the twelve feelings colours.

## The conversation seam

`guide.ts` defines what a guide may do; in the product that is a language model.
`scriptedGuide` is a deterministic stand-in that follows the protocol's own
prompts and backups so the turn loop can be exercised and tested today. It
understands nothing, and extraction is left to the caller — which is exactly
where a model slots in.

`takeTurn()` screens safety **before** the guide is consulted. On a high-risk
utterance it ends the session and the guide is never called at all. There is a
test asserting exactly that.

`risk.ts` is a deliberately over-eager phrase screen, and a **backstop rather
than the detector**: it will miss things, it reads English phrasings only, and
no clinical claim should rest on it. A real deployment needs a trained model and
sign-off from someone qualified to judge it.

## Still open

1. **Step prompt copy.** Only step 4 "Remember" is fully specified anywhere in
   the designs. The other five are missing a completion criterion and a turn
   limit, and steps 2, 3 and 6 have no question at all. `incompleteSteps()`
   reports exactly what is missing, and these stay `null` rather than invented —
   guessed copy would silently become the product's therapeutic voice. The
   design research says the real copy lives in the PRD.
2. **Voice stack.** Speech-to-text, text-to-speech and the turn-taking loop are
   unspecified. To be kept behind an interface so the choice stays reversible.
3. **Pricing.** The pricing page shows `[PRICE]/mo` placeholders for Plus and
   Coach. Currency is ₹.

## License

[MIT](LICENSE).
