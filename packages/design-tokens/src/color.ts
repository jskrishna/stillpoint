/**
 * Colour, from the Warm & Clear direction of the Stillpoint designs.
 *
 * Every screen in the complete UI set is built from this palette, in both a
 * light and a dark rendering. Semantic names are what surfaces consume: a
 * screen asks for `accent`, never for `#E4572E`, so the direction can be
 * retuned in one place.
 */

/** A hex colour, as the designs write them. */
export type Hex = `#${string}`;

/** Which rendering of the palette to use. */
export type Scheme = 'light' | 'dark';

/** The semantic roles every surface draws from. */
export type Palette = {
  /** Page background. */
  readonly bg: Hex;
  /** Raised surfaces: cards, sheets, inputs. */
  readonly panel: Hex;
  /** A recessed band behind navigation, e.g. the admin sidebar. */
  readonly sheet: Hex;
  /** Primary text. */
  readonly ink: Hex;
  /** Secondary body text, still meant to be read. */
  readonly inkSoft: Hex;
  /** Labels and captions. Dark enough to meet AA on every surface above. */
  readonly muted: Hex;
  /** Hairlines and dividers. */
  readonly line: Hex;
  /** Input borders, which sit a little darker than `line`. */
  readonly field: Hex;
  /** The single accent: primary buttons, progress, the live mic. */
  readonly accent: Hex;
  /** Text and icons placed on `accent`. */
  readonly accentInk: Hex;
  /**
   * The accent used *as text* on a light surface.
   *
   * Separate from `accent` because a colour that reads well as a fill behind
   * white does not necessarily meet AA as small text on cream; this one does,
   * on every surface in the palette.
   */
  readonly accentText: Hex;
  /** A wash of the accent, behind step numbers and tags. */
  readonly accentWash: Hex;
  /** Confirmation: completed sessions, checkmarks, the helpline button. */
  readonly positive: Hex;
  /** Danger, used only for safety: emergency calls and flag badges. */
  readonly danger: Hex;
  /** Text and icons placed on `danger`. */
  readonly dangerInk: Hex;
  /** A wash of danger, behind the "not therapy" consent notice. */
  readonly dangerWash: Hex;
};

/** The light rendering — the default for every screen but a session in progress. */
export const LIGHT: Palette = {
  bg: '#FBF4EC',
  panel: '#FFFFFF',
  sheet: '#F3E9DE',
  ink: '#2A211C',
  inkSoft: '#5A4C42',
  // Darkened from the designs' #8A7A6E, which fails AA on every surface it is
  // used on (3.78:1 on the page background). See the note in the README.
  muted: '#74675D',
  line: '#EFE4D8',
  field: '#E6D9CB',
  // Darkened from #E4572E so that white on it meets AA; the designs' value
  // gives 3.68:1, and this is the smallest change that reaches 4.5:1.
  accent: '#CB4D29',
  accentInk: '#FFFFFF',
  accentText: '#B54525',
  accentWash: '#FCEDE8',
  positive: '#2E7D5B',
  danger: '#C0392B',
  dangerInk: '#FFFFFF',
  dangerWash: '#FDF0EC',
};

/** The dark rendering. */
export const DARK: Palette = {
  bg: '#1D1714',
  panel: '#2A221D',
  sheet: '#241D19',
  ink: '#F3E9DE',
  inkSoft: '#D6C6B6',
  muted: '#B5A496',
  line: '#3A2F28',
  field: '#4A3C33',
  accent: '#F0784F',
  accentInk: '#1D1714',
  // In dark the accent is already light enough to read as text on the page.
  accentText: '#F0784F',
  accentWash: '#3A2721',
  positive: '#5FA883',
  danger: '#E5705F',
  // Ink, not white: white on this red is 3.08:1, well under AA.
  dangerInk: '#1D1714',
  dangerWash: '#3A241F',
};

/** Returns the palette for a scheme. */
export function palette(scheme: Scheme): Palette {
  return scheme === 'dark' ? DARK : LIGHT;
}

/** Elevation, as the designs specify shadows. */
export const SHADOW = {
  /** Cards and raised panels. */
  card: '0 6px 20px -12px rgba(120, 70, 40, 0.28)',
  /** Secondary buttons, which lift only slightly off the page. */
  button: '0 1px 3px rgba(80, 50, 30, 0.14)',
  /** The screen frames in the gallery. */
  frame: '0 10px 30px -18px rgba(120, 70, 40, 0.45)',
} as const;
