/**
 * Emitting the tokens as CSS custom properties.
 *
 * The web surfaces consume tokens as CSS variables so they can be themed by
 * the cascade; the native surface consumes the same objects directly. Both read
 * the same source, so they cannot drift.
 */

import { DARK, LIGHT, SHADOW, type Palette } from './color.js';
import { FEELING_COLOR } from './feelings.js';
import { FONT, LEADING, TEXT, WEIGHT } from './typography.js';
import { CONTROL, RADIUS, SPACE } from './space.js';

/** Prefix on every emitted custom property. */
export const PREFIX = 'sp';

function declare(name: string, value: string | number): string {
  return `  --${PREFIX}-${name}: ${String(value)};`;
}

/** `Object.entries` keeps its value type here, instead of widening to `any`. */
function entries<T extends Record<string, string | number>>(o: T): [string, T[keyof T]][] {
  return Object.entries(o) as [string, T[keyof T]][];
}

function paletteVars(p: Palette): string[] {
  return entries(p).map(([k, v]) => declare(`color-${kebab(k)}`, v));
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Returns a stylesheet defining every token.
 *
 * The dark palette is emitted twice, as the artifact guidance requires: once
 * under `prefers-color-scheme` guarded so an explicit light choice wins, and
 * once under an explicit `data-theme="dark"`.
 */
export function stylesheet(): string {
  const scale = [
    ...Object.entries(SPACE).map(([k, v]) => declare(`space-${k}`, `${String(v)}px`)),
    ...Object.entries(RADIUS).map(([k, v]) =>
      declare(`radius-${k}`, k === 'pill' ? `${String(v)}px` : `${String(v)}px`),
    ),
    ...Object.entries(CONTROL).map(([k, v]) => declare(`control-${k}`, `${String(v)}px`)),
    ...Object.entries(TEXT).map(([k, v]) => declare(`text-${k}`, `${String(v)}px`)),
    ...Object.entries(LEADING).map(([k, v]) => declare(`leading-${k}`, v)),
    ...Object.entries(WEIGHT).map(([k, v]) => declare(`weight-${k}`, v)),
    ...Object.entries(FONT).map(([k, v]) => declare(`font-${k}`, v)),
    ...Object.entries(SHADOW).map(([k, v]) => declare(`shadow-${k}`, v)),
    ...Object.entries(FEELING_COLOR).map(([k, v]) => declare(`feeling-${k}`, v)),
  ];

  return [
    ':root {',
    ...paletteVars(LIGHT),
    ...scale,
    '  color-scheme: light;',
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...paletteVars(DARK).map((l) => `  ${l}`),
    '    color-scheme: dark;',
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    ...paletteVars(DARK),
    '  color-scheme: dark;',
    '}',
    '',
  ].join('\n');
}

/** The custom-property name for a token, e.g. `var(--sp-color-accent)`. */
export function cssVar(name: string): string {
  return `var(--${PREFIX}-${name})`;
}
