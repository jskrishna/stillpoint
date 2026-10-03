/**
 * The Warm & Clear tokens, as React Native wants them.
 *
 * `@stillpoint/design-tokens` is the source; nothing here invents a colour, a
 * size or a radius. What it does is translate three things the web gets for
 * free:
 *
 * - **Font families.** The tokens hold CSS stacks (`'Newsreader', Georgia, …`),
 *   and React Native takes one loaded family name. The names below are the ones
 *   `expo-font` registers in `_layout.tsx`, and they fall back to the platform
 *   serif and sans until the fonts land.
 * - **Line height.** `LEADING` is unitless, as CSS wants; React Native wants
 *   pixels, so `leading()` multiplies.
 * - **Shadows.** `SHADOW` holds CSS `box-shadow` strings. React Native takes
 *   `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` on iOS and
 *   `elevation` on Android, so the card shadow is expressed both ways here
 *   rather than parsed.
 */
import { Platform, StyleSheet } from 'react-native';
import {
  LEADING,
  SPACE,
  TEXT,
  WEIGHT,
  palette,
  type Palette,
  type Scheme,
} from '@stillpoint/design-tokens';

export { GUTTER, RADIUS, CONTROL, SPACE, TEXT, LEADING, WEIGHT } from '@stillpoint/design-tokens';
export type { Palette, Scheme };

/**
 * The two families, by the name `expo-font` loads them under.
 *
 * Display is the guide's voice and the user's own words; UI is everything the
 * user operates. Swapping them round is, per the tokens, the fastest way to
 * make this feel like any other app.
 */
export const FAMILY = {
  display: 'Newsreader',
  displayMedium: 'Newsreader-Medium',
  ui: 'HankenGrotesk',
  uiMedium: 'HankenGrotesk-Medium',
  uiSemibold: 'HankenGrotesk-Semibold',
} as const;

/**
 * A palette colour at partial strength.
 *
 * Only for places the designs specify an opacity rather than a colour — the
 * mark's ring is drawn at 30% of the accent. Not a way to invent tints: a
 * colour a screen needs belongs in the palette, where the contrast audit can
 * see it.
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/** `LEADING` is unitless; React Native wants pixels. */
export function leading(size: number, ratio: number = LEADING.normal): number {
  return Math.round(size * ratio);
}

export function themeFor(scheme: Scheme | null | undefined): Palette {
  return palette(scheme === 'dark' ? 'dark' : 'light');
}

/** The card shadow from `SHADOW.card`, in the two forms native needs. */
export function cardShadow(scheme: Scheme) {
  return Platform.select({
    ios: {
      shadowColor: scheme === 'dark' ? '#000000' : '#784628',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: scheme === 'dark' ? 0.4 : 0.18,
      shadowRadius: 14,
    },
    android: { elevation: 3 },
    default: {},
  });
}

/**
 * The styles every screen shares, built for one palette.
 *
 * A function rather than a module-level `StyleSheet.create` because the palette
 * depends on the colour scheme, and the scheme can change while the app is
 * open. `useStyles()` in `use-theme.ts` memoises it per scheme.
 */
export function sharedStyles(scheme: Scheme) {
  const c = palette(scheme);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: SPACE.xl, gap: SPACE.lg },
    centred: { flex: 1, justifyContent: 'center', padding: SPACE.xl, gap: SPACE.lg },

    title: {
      fontFamily: FAMILY.display,
      fontSize: TEXT.heading,
      lineHeight: leading(TEXT.heading, LEADING.snug),
      color: c.ink,
    },
    subheading: {
      fontFamily: FAMILY.uiSemibold,
      fontSize: TEXT.subheading,
      lineHeight: leading(TEXT.subheading, LEADING.snug),
      color: c.ink,
    },
    lead: {
      fontFamily: FAMILY.ui,
      fontSize: TEXT.body,
      lineHeight: leading(TEXT.body, LEADING.relaxed),
      color: c.inkSoft,
    },
    body: {
      fontFamily: FAMILY.ui,
      fontSize: TEXT.control,
      lineHeight: leading(TEXT.control),
      color: c.ink,
    },
    quote: {
      fontFamily: FAMILY.display,
      fontSize: TEXT.body,
      lineHeight: leading(TEXT.body, LEADING.relaxed),
      color: c.ink,
    },
    small: {
      fontFamily: FAMILY.ui,
      fontSize: TEXT.small,
      lineHeight: leading(TEXT.small),
      color: c.inkSoft,
    },
    caption: {
      fontFamily: FAMILY.ui,
      fontSize: TEXT.caption,
      lineHeight: leading(TEXT.caption),
      color: c.muted,
    },
    label: {
      fontFamily: FAMILY.uiSemibold,
      fontSize: TEXT.label,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.muted,
    },
    micro: { fontFamily: FAMILY.ui, fontSize: TEXT.micro, color: c.muted },

    // `accentText`, never `accent`: the tokens keep both because the fill
    // colour does not meet AA as small text, and this is small text.
    link: { fontFamily: FAMILY.uiMedium, fontSize: TEXT.control, color: c.accentText },
    error: {
      fontFamily: FAMILY.ui,
      fontSize: TEXT.small,
      lineHeight: leading(TEXT.small),
      color: c.danger,
    },
  });
}

export const FONT_WEIGHT = {
  regular: String(WEIGHT.regular) as '400',
  medium: String(WEIGHT.medium) as '500',
  semibold: String(WEIGHT.semibold) as '600',
} as const;
