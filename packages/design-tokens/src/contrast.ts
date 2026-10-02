/**
 * Contrast, so the palette can prove itself rather than be taken on trust.
 *
 * WCAG 2.1 relative luminance and contrast ratio. The tokens are tested against
 * these, which is the point: a colour change that drops a text pair below AA
 * fails the build instead of reaching someone who cannot read it.
 */

import type { Hex } from './color.js';

/** WCAG AA for body text. */
export const AA_TEXT = 4.5;

/** WCAG AA for text at 18.66px bold or 24px regular, and for UI boundaries. */
export const AA_LARGE_TEXT = 3;

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: Hex): number {
  const r = channel(Number.parseInt(hex.slice(1, 3), 16));
  const g = channel(Number.parseInt(hex.slice(3, 5), 16));
  const b = channel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrast(a: Hex, b: Hex): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether a foreground meets AA against a background. */
export function meetsAA(foreground: Hex, background: Hex, large = false): boolean {
  return contrast(foreground, background) >= (large ? AA_LARGE_TEXT : AA_TEXT);
}
