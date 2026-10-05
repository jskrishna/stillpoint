import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.next/**',
      // The standalone build has its own `distDir`, so the line above does not
      // cover it; without this, `next build`'s generated route validators are
      // linted and fail for not belonging to any tsconfig project.
      '**/.next-standalone/**',
      'apps/api/**',
      // The web app's standalone build, copied in by the desktop shell.
      'apps/desktop/web/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.test.json spans src, tests and the root *.config.ts files,
        // so every linted TypeScript file belongs to a known project.
        project: [
          './tsconfig.test.json',
          './apps/web/tsconfig.json',
          './apps/mobile/tsconfig.json',
          './apps/desktop/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The mobile app's own config files are CommonJS for Metro and Babel,
    // which load them with `require`, so the ESM rules do not apply.
    files: ['apps/mobile/*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { project: null, projectService: false },
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: {
      // Metro and Babel load these with `require`; an `import` here would not
      // run at all.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Plain scripts: not part of any tsconfig project, so type-aware rules
    // cannot run on them. `parity/generate.mjs` is one — it writes the fixture
    // both test suites read and belongs to neither package.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { project: null, projectService: false },
      // Declared by hand rather than pulling in `globals` for two names.
      // `e2e/flow.mjs` also runs snippets inside the browser via Playwright.
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        // `e2e/run.mjs` polls the three servers with a bounded fetch.
        AbortSignal: 'readonly',
        // `e2e/a11y.mjs`'s 320 pass measures each text run with a `Range`,
        // which needs a `TreeWalker` to reach the text nodes.
        NodeFilter: 'readonly',
      },
    },
  },
  prettier,
);
