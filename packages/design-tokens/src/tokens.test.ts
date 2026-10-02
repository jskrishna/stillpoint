import { describe, expect, it } from 'vitest';
import { FEELINGS } from '@stillpoint/protocol';
import { DARK, LIGHT, SHADOW, palette } from './color.js';
import { FEELING_COLOR, FEELING_SWATCHES, feelingColor } from './feelings.js';
import { CONTROL, GUTTER, RADIUS, SPACE, VIEWPORT } from './space.js';
import { FONT, LEADING, TEXT, WEIGHT } from './typography.js';
import { cssVar, stylesheet } from './css.js';

const HEX = /^#[0-9A-F]{6}$/;

describe('palette', () => {
  it('defines the same roles in light and dark', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it('uses well-formed hex throughout', () => {
    for (const p of [LIGHT, DARK]) {
      for (const value of Object.values(p)) {
        expect(value).toMatch(HEX);
      }
    }
  });

  it('resolves by scheme', () => {
    expect(palette('light')).toBe(LIGHT);
    expect(palette('dark')).toBe(DARK);
  });

  it('carries the Warm & Clear page background and accent', () => {
    expect(LIGHT.bg).toBe('#FBF4EC');
    expect(LIGHT.accent).toBe('#E4572E');
  });

  it('inverts background and text between schemes', () => {
    expect(DARK.bg).not.toBe(LIGHT.bg);
    expect(DARK.ink).not.toBe(LIGHT.ink);
  });

  it('keeps danger distinct from the accent, so safety never reads as a prompt', () => {
    expect(LIGHT.danger).not.toBe(LIGHT.accent);
    expect(DARK.danger).not.toBe(DARK.accent);
  });

  it('defines every shadow', () => {
    expect(Object.values(SHADOW).every((s) => s.length > 0)).toBe(true);
  });
});

describe('feeling colours', () => {
  it('covers every feeling the protocol defines', () => {
    expect(Object.keys(FEELING_COLOR).sort()).toEqual(FEELINGS.map((f) => f.id).sort());
  });

  it('uses a distinct colour per feeling, so history stays readable', () => {
    const colors = Object.values(FEELING_COLOR);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('uses well-formed hex', () => {
    for (const c of Object.values(FEELING_COLOR)) expect(c).toMatch(HEX);
  });

  it('resolves a feeling to its colour', () => {
    expect(feelingColor('unworthy')).toBe('#8B7447');
  });

  it('pairs swatches with the protocol labels in order', () => {
    expect(FEELING_SWATCHES).toHaveLength(FEELINGS.length);
    expect(FEELING_SWATCHES[0]).toEqual({ id: 'angry', label: 'Angry', color: '#B8553E' });
  });
});

describe('scales', () => {
  it('keeps spacing ascending', () => {
    const values = Object.values(SPACE);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('keeps type sizes descending from hero to micro', () => {
    const values = Object.values(TEXT);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('keeps leading ascending from tight to relaxed', () => {
    const values = Object.values(LEADING);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('sizes controls down from the primary action', () => {
    expect(CONTROL.primary).toBeGreaterThan(CONTROL.standard);
    expect(CONTROL.standard).toBeGreaterThan(CONTROL.nav);
  });

  it('draws at the viewports the designs use', () => {
    expect(VIEWPORT.mobile).toEqual({ width: 390, height: 844 });
    expect(VIEWPORT.desktop).toEqual({ width: 1440, height: 900 });
  });

  it('gutters wider on desktop than mobile', () => {
    expect(GUTTER.desktop).toBeGreaterThan(GUTTER.mobile);
  });

  it('rounds pills further than cards', () => {
    expect(RADIUS.pill).toBeGreaterThan(RADIUS.card);
    expect(RADIUS.card).toBeGreaterThan(RADIUS.button);
  });

  it('names two font families and four weights', () => {
    expect(FONT.display).toContain('Newsreader');
    expect(FONT.ui).toContain('Hanken Grotesk');
    expect(Object.keys(WEIGHT)).toHaveLength(4);
  });
});

describe('stylesheet', () => {
  const css = stylesheet();

  it('defines the light palette on :root', () => {
    expect(css).toContain(':root {');
    expect(css).toContain('--sp-color-bg: #FBF4EC;');
    expect(css).toContain('--sp-color-accent: #E4572E;');
  });

  it('redefines dark under a guarded media query and an explicit theme', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it('declares color-scheme in every rendering', () => {
    // Anchored, so the @media (prefers-color-scheme: dark) condition does not count.
    expect(css.match(/^\s*color-scheme:/gm)).toHaveLength(3);
  });

  it('kebab-cases compound role names', () => {
    expect(css).toContain('--sp-color-accent-ink:');
    expect(css).toContain('--sp-color-ink-soft:');
  });

  it('emits scale, font and feeling tokens', () => {
    expect(css).toContain('--sp-space-lg: 16px;');
    expect(css).toContain('--sp-radius-card: 18px;');
    expect(css).toContain('--sp-text-body: 17px;');
    expect(css).toContain('--sp-font-display:');
    expect(css).toContain('--sp-feeling-unworthy: #8B7447;');
  });

  it('balances its braces', () => {
    expect((css.match(/{/g) ?? []).length).toBe((css.match(/}/g) ?? []).length);
  });

  it('builds a var() reference', () => {
    expect(cssVar('color-accent')).toBe('var(--sp-color-accent)');
  });
});
