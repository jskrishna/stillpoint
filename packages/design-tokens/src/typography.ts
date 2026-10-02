/**
 * Type.
 *
 * Two families do all the work: a serif for the guide's voice and the user's
 * own words, and a grotesk for everything the user operates. Mixing them the
 * other way round is the fastest way to make the product feel generic.
 */

/** Font stacks, with fallbacks that hold the layout before webfonts land. */
export const FONT = {
  /** The guide's voice, the user's words, headings. */
  display: "'Newsreader', Georgia, 'Times New Roman', serif",
  /** Everything the user operates: buttons, labels, navigation, body copy. */
  ui: "'Hanken Grotesk', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

/** Weights used across the designs. */
export const WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/**
 * Type sizes in px, named for the role they play rather than their size, so a
 * screen asks for `stepQuestion` rather than guessing at 22.
 */
export const TEXT = {
  /** Marketing hero. */
  hero: 60,
  /** Page titles on the web and admin. */
  title: 34,
  /** Section headings. */
  heading: 28,
  /** The guide's question during a session. */
  stepQuestion: 22,
  /** Card and group headings. */
  subheading: 20,
  /** Body copy. */
  body: 17,
  /** Controls and secondary body. */
  control: 16,
  /** Supporting text. */
  small: 15,
  /** Captions. */
  caption: 14,
  /** All-caps field labels. */
  label: 13,
  /** Metadata. */
  micro: 12,
} as const;

/** Line heights, unitless. */
export const LEADING = {
  /** Display type, which sets tight. */
  tight: 1.1,
  /** Headings. */
  snug: 1.3,
  /** Body copy. */
  normal: 1.45,
  /** Long-form reading. */
  relaxed: 1.6,
} as const;
