import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrast, luminance, meetsAA } from './contrast.js';
import { DARK, LIGHT, type Palette } from './color.js';
import { FEELING_COLOR } from './feelings.js';

describe('contrast maths', () => {
  it('rates black on white at 21:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('rates a colour against itself at 1:1', () => {
    expect(contrast('#CB4D29', '#CB4D29')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrast('#75685D', '#FBF4EC')).toBeCloseTo(contrast('#FBF4EC', '#75685D'), 10);
  });

  it('puts luminance between 0 and 1', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('applies the large-text threshold when asked', () => {
    // 3.08:1 — under AA for body text, over it for large text.
    expect(meetsAA('#FFFFFF', '#E5705F')).toBe(false);
    expect(meetsAA('#FFFFFF', '#E5705F', true)).toBe(true);
  });
});

/**
 * Every surface a user could read text on. `muted` is the hardest case: it is
 * the lightest text colour and appears on all of them.
 */
const SURFACES: readonly (keyof Palette)[] = ['bg', 'panel', 'sheet', 'accentWash', 'dangerWash'];

/** Text roles that must meet AA on every surface. */
const TEXT_ROLES: readonly (keyof Palette)[] = ['ink', 'inkSoft', 'muted', 'accentText'];

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('%s palette meets WCAG AA', (name, palette) => {
  for (const role of TEXT_ROLES) {
    for (const surface of SURFACES) {
      it(`${role} on ${surface}`, () => {
        const ratio = contrast(palette[role], palette[surface]);
        expect(
          ratio,
          `${name}: ${role} ${String(palette[role])} on ${surface} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('accentInk on accent', () => {
    expect(contrast(palette.accentInk, palette.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('dangerInk on danger', () => {
    expect(contrast(palette.dangerInk, palette.danger)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('accentInk on positive, which is used the same way', () => {
    expect(contrast(palette.accentInk, palette.positive)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('feeling swatches', () => {
  it('are distinguishable from the surfaces they sit on', () => {
    // Swatches are decorative squares beside a label, so the UI-component
    // threshold applies rather than the body-text one.
    for (const [id, color] of Object.entries(FEELING_COLOR)) {
      const ratio = contrast(color, LIGHT.panel);
      expect(ratio, `${id} ${color} on panel is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});
