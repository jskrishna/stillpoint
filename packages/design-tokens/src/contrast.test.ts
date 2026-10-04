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
  /*
   * **One surface, one palette, and the title used to claim more.**
   *
   * This said the swatches were "distinguishable from the surfaces they sit
   * on" and compared them to `LIGHT.panel` alone. Measured against every
   * surface they are actually drawn on, in both palettes: `anxious` is 2.64:1
   * on light `sheet` (the insights bar's own track), four of the thirteen are
   * under 3:1 on dark `panel`, three on dark `sheet`, and **all thirteen** are
   * between 1.0:1 and 2.3:1 on `accent`, which is what a selected chip's
   * background is on the web. So the claim was false for nine of the ten
   * combinations it did not check.
   *
   * It is still one `expect` rather than ten, because the threshold is a
   * quality bar here and not a criterion. WCAG 1.4.11 binds a graphical object
   * **required to understand the content**, and a feeling's colour never is:
   * the chip carries the feeling's label beside the dot, and the insights bar
   * carries the label and the count as text, so the colour is a redundant
   * presentation of something already written. That is also why `axe` passes
   * these screens — see `e2e/a11y.mjs` for the other two cases of a rule that
   * is satisfied and a screen that is still wrong.
   *
   * What is *not* available is the obvious fix. The thirteen colours are the
   * only thing that survives from the "Dusk to Light" exploration, and nothing
   * else in the design set assigns the feelings colours at all — so picking
   * new ones for the dark palette would be inventing product visuals, which is
   * the same mistake as inventing step copy. It is in `DECISIONS.md`.
   */
  it('are distinguishable from the light palette’s panel, which is the bar they are held to', () => {
    for (const [id, color] of Object.entries(FEELING_COLOR)) {
      const ratio = contrast(color, LIGHT.panel);
      expect(ratio, `${id} ${color} on panel is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the focus ring', () => {
  /*
   * `globals.css` draws every focus ring as `2px solid var(--sp-color-accent)`,
   * offset 2px — so it lands on whatever surface is behind the control, and
   * nothing checked that it could be seen there. Unlike the swatches above
   * this one *is* a criterion: WCAG 1.4.11 names the focus indicator, and a
   * ring nobody can see is a keyboard user not knowing where they are.
   *
   * It passes everywhere today, and the margin is the reason to pin it: the
   * tightest is light `accent` on `field` at 3.27:1, which a palette tweak
   * spends without noticing.
   */
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)('is visible on every %s surface', (name, palette) => {
    for (const surface of ['bg', 'panel', 'sheet', 'field', 'accentWash', 'dangerWash'] as const) {
      const ratio = contrast(palette.accent, palette[surface]);
      expect(
        ratio,
        `${name}: the ring ${palette.accent} on ${surface} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
