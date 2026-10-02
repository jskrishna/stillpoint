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

## Do not invent product copy

Only step 4 "Remember" is fully specified in the designs. Unspecified prompt
copy, completion criteria and turn limits are `null`, and `incompleteSteps()`
reports them. **Do not fill these with invented text** — the real copy lives in
the PRD. A `null` is an honest gap; a guess silently becomes the product's
voice.

The same goes for pricing: the designs show `[PRICE]/mo` placeholders.

## Stack

- TypeScript 6.0.x, ESM only (`"type": "module"`)
- Node >= 22 (`.nvmrc`), pnpm 10 workspace (`pnpm-workspace.yaml`)
- Vitest, ESLint flat config (type-aware), Prettier

TypeScript is pinned to the 6.0 line because `typescript-eslint` 8.x declares a
`typescript@>=4.8.4 <6.1.0` peer range. **Do not bump to 7.x** until
`typescript-eslint` supports it, or type-aware linting breaks.

## Layout

```
packages/protocol/        @stillpoint/protocol — domain core, no I/O
packages/design-tokens/   @stillpoint/design-tokens — Warm & Clear colour, type, space
apps/web/                 @stillpoint/web — Next.js marketing site (and, later, the web app)
```

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
pnpm run check   # build:packages, then format:check + lint + typecheck + test
pnpm run build   # every workspace project, packages first
```

`check` builds the packages first on purpose: `apps/web` resolves
`@stillpoint/*` through `node_modules` to their built output, exactly as an
outside consumer would, so lint and typecheck need that output to exist. CI runs
the same steps in the same order.

**Verify on a clean tree before pushing.** Delete `node_modules`, every
`packages/*/dist` and `apps/web/.next`, reinstall with `--frozen-lockfile`, then
run the gates in CI's order. A leftover `dist/` has twice made a broken commit
look green locally.

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

Still unchosen: the voice stack (speech-to-text, text-to-speech, turn-taking).
Keep it behind an interface so the choice stays reversible.
