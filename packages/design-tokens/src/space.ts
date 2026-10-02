/**
 * Space, radius and control sizing.
 *
 * Taken from the measurements the Warm & Clear screens actually use, so a built
 * screen lands on the same rhythm as its design rather than near it.
 */

/** Spacing scale in px. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  '3xl': 40,
  '4xl': 56,
  '5xl': 80,
  '6xl': 120,
} as const;

/** Corner radii in px, named by what they round. */
export const RADIUS = {
  /** Inputs and small controls. */
  field: 12,
  /** Buttons. */
  button: 14,
  /** Cards and panels. */
  card: 18,
  /** Tiles and screen frames. */
  frame: 28,
  /** Chips and pills. */
  pill: 999,
} as const;

/** Control heights in px. */
export const CONTROL = {
  /** The primary action at the foot of a screen. */
  primary: 56,
  /** Inline and secondary actions. */
  standard: 48,
  /** Header actions and admin rows. */
  compact: 46,
  /** Navigation rows. */
  nav: 44,
  /** Small inline buttons. */
  mini: 30,
} as const;

/** Viewports the designs are drawn at. */
export const VIEWPORT = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

/** Page gutters in px. */
export const GUTTER = {
  mobile: 20,
  desktop: 120,
  /** Inside an admin or app content column. */
  content: 56,
} as const;
