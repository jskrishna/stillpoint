# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project state

This is a **scaffold**, not a product. `src/index.ts` is a placeholder entry
point whose only job is to give the build, lint, type and test pipelines
something real to run against. The project's purpose, runtime shape and public
API are undecided — do not infer a product direction from the placeholder, and
ask before introducing a framework, database or deployment target.

## Stack

- TypeScript 6.0.x, ESM only (`"type": "module"`)
- Node.js >= 22 (pinned in `.nvmrc`)
- pnpm 10 (pinned via `packageManager`)
- Vitest for tests, ESLint (flat config, type-aware) + Prettier for style

TypeScript is pinned to the 6.0 line because `typescript-eslint` 8.x declares a
`typescript@>=4.8.4 <6.1.0` peer range. **Do not bump TypeScript to 7.x** until
`typescript-eslint` supports it, or type-aware linting breaks.

## Commands

Always verify with the aggregate check before committing:

```bash
pnpm run check      # format:check + lint + typecheck + test, in CI's order
```

Individually: `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`,
`pnpm run format`, `pnpm run test`. CI runs exactly the `check` gates plus
`build`, so a green `pnpm run check && pnpm run build` means a green CI run.

## Conventions

- Use `.js` extensions in relative import specifiers, even when importing
  TypeScript sources — this is required by `NodeNext` module resolution.
- Write type-only imports as `import type { ... }` (lint-enforced).
- Tests are co-located as `src/**/*.test.ts`; a top-level `tests/` directory is
  also picked up for integration tests.
- Prefer fixing types over casting. `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are all on.
- Let Prettier own formatting; never hand-format to satisfy a diff.

## Two tsconfigs, on purpose

- `tsconfig.json` — the build. Emits `dist/`, is `composite`, excludes
  `*.test.ts` so tests stay out of the published output.
- `tsconfig.test.json` — extends the build config, sets `noEmit`, resets
  `rootDir` to `.` and overrides the inherited `exclude`. It spans `src/`,
  `tests/` and the root `*.config.ts` files, and backs both `pnpm run typecheck`
  and ESLint's `parserOptions.project`.

If a new file ever reports "not found in any of the provided project(s)" from
ESLint, it is missing from `tsconfig.test.json`'s `include`.

## Gotchas

- `tsc --noEmit` cannot be used against `tsconfig.json` directly: `composite`
  projects may not disable emit. That is why `typecheck` targets
  `tsconfig.test.json`.
- `exclude` is inherited by extending configs even when `include` is
  overridden — `tsconfig.test.json` must restate it.
- `pnpm/action-setup` must run **before** `actions/setup-node` in CI, since
  `cache: pnpm` requires the pnpm binary to already exist.
