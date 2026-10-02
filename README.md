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

A session ends on a summary: what happened, what you felt, the old belief, and a
"do you feel a bit calmer?" rating. It is then saved to the journal.

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
│   └── protocol/            # @stillpoint/protocol — the domain core
│       └── src/
│           ├── steps.ts     # the six steps, their prompts and completion rules
│           ├── session.ts   # the session state machine (pure reducer)
│           ├── feelings.ts  # the twelve feelings and their colours
│           └── safety.ts    # safety levels, actions and helplines
├── apps/                    # (empty) surfaces will live here
└── .github/workflows/ci.yml
```

`packages/protocol` is free of I/O — no network, no storage, no speech — so the
rules stay testable and every surface can drive them. Nothing about a UI
framework is decided yet; see [Open questions](#open-questions).

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

Two directions exist in the design artifacts and they conflict — see
[Open questions](#open-questions). Feeling colours in `feelings.ts` are taken
from the "Dusk to Light" design language, which is the only place the twelve
feelings are given colours at all.

## Open questions

These are unresolved and should not be guessed at:

1. **Which design direction is current.** The most recent artifact ("Stillpoint
   UI", the complete V3 screen set) is "Warm & Clear": cream `#FBF4EC` with a
   terracotta accent `#E4572E`, Newsreader + Hanken Grotesk. A second direction,
   "Dusk to Light", uses stone paper `#EFEBE5`, ink `#1A1714`, marigold
   `#E8A33D` and Alegreya + Hanken Grotesk + Martian Mono — and its research
   page explicitly rejects "cream + serif + terracotta" as a generic default.
   One supersedes the other; the artifacts do not say which.
2. **Step prompt copy.** Only step 4 "Remember" is fully specified anywhere in
   the designs. The other five steps are missing a completion criterion and a
   turn limit, and steps 2, 3 and 6 have no question at all. `incompleteSteps()`
   reports exactly what is missing. The design research says this copy lives in
   the PRD, which is not in the repository.
3. **Client stack.** Mobile, desktop and web are all designed; no framework is
   chosen.
4. **Voice stack.** Speech-to-text, text-to-speech and the turn-taking loop are
   central to the product and entirely unspecified.
5. **Pricing.** The pricing page shows `[PRICE]/mo` placeholders for Plus and
   Coach. Currency is ₹.

## License

[MIT](LICENSE).
