# Stillpoint

> **Status: scaffold.** This repository currently contains project tooling and a
> placeholder entry point, not a product. The purpose, scope and public API are
> still to be decided — see [Project direction](#project-direction).

A TypeScript project targeting Node.js 22+.

## Requirements

| Tool    | Version | Notes                                         |
| ------- | ------- | --------------------------------------------- |
| Node.js | >= 22   | Version pinned in [`.nvmrc`](.nvmrc)          |
| pnpm    | 10.x    | Pinned via `packageManager` in `package.json` |

With [corepack](https://nodejs.org/api/corepack.html) enabled, `pnpm` resolves
to the pinned version automatically:

```bash
corepack enable
```

## Getting started

```bash
pnpm install     # install dependencies
pnpm run check   # format check + lint + typecheck + test
pnpm run build   # compile to dist/
```

## Scripts

| Script                   | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm run build`         | Compile `src/` to `dist/` with declarations and source maps |
| `pnpm run dev`           | Incremental compile in watch mode                           |
| `pnpm run clean`         | Remove `dist/`, build info and coverage output              |
| `pnpm run typecheck`     | Type-check sources, tests and configs (no emit)             |
| `pnpm run lint`          | ESLint with type-aware rules                                |
| `pnpm run lint:fix`      | ESLint with autofix                                         |
| `pnpm run format`        | Rewrite files with Prettier                                 |
| `pnpm run format:check`  | Verify Prettier formatting                                  |
| `pnpm run test`          | Run the Vitest suite once                                   |
| `pnpm run test:watch`    | Vitest in watch mode                                        |
| `pnpm run test:coverage` | Vitest with a V8 coverage report                            |
| `pnpm run check`         | Everything CI runs, in the same order                       |

## Layout

```
.
├── .github/workflows/ci.yml   # lint, typecheck, test, build on every push and PR
├── src/
│   ├── index.ts               # public entry point (placeholder)
│   └── index.test.ts          # co-located tests
├── eslint.config.js           # ESLint flat config, type-aware
├── tsconfig.json              # build config (emits dist/)
├── tsconfig.test.json         # no-emit config spanning src, tests and configs
└── vitest.config.ts           # test + coverage config
```

Tests live next to the code they cover as `*.test.ts`. A top-level `tests/`
directory is also picked up, for integration tests that do not belong beside a
single module.

### Why two tsconfigs

`tsconfig.json` is the build: it emits `dist/`, is `composite`, and excludes
test files so they stay out of the published output. `tsconfig.test.json`
extends it, disables emit, and widens the inputs to cover tests and the root
config files — it backs both `pnpm run typecheck` and ESLint's type-aware rules,
so everything that gets linted belongs to a real TypeScript project.

## Conventions

- **ESM only.** The package is `"type": "module"`; use `.js` extensions in
  relative import specifiers, including when importing TypeScript sources.
- **Strict types.** `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `verbatimModuleSyntax` are on. Prefer fixing
  types over casting.
- **Type-only imports** are written `import type { ... }` (enforced by lint).
- **Formatting** is Prettier's job, not a review topic. Run `pnpm run format`.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs format check, lint,
typecheck, test and build on every push and pull request. `pnpm run check`
reproduces the same gates locally, in the same order, so a green local run means
a green CI run.

## Project direction

The following are open and deliberately unanswered by this scaffold:

- **What Stillpoint is** — library, CLI, HTTP service, or application.
- **Runtime surface** — whether it stays a library entry point or grows a `bin`
  entry, a server, or a UI.
- **Persistence and external dependencies** — none are wired up yet.

`src/index.ts` is a placeholder that exists only to give the build, lint, type
and test pipelines something real to run against. Replace it as the shape of the
project settles; keep it as the single export surface.

## License

[MIT](LICENSE).
