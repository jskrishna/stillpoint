import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palette, type Palette, type Scheme } from '@stillpoint/design-tokens';
import { sharedStyles } from './theme';

/**
 * The palette and the shared styles for whichever scheme the phone is in.
 *
 * `useColorScheme()` answers `null` while the system value is being read, and
 * light is the right answer for that moment: it is the default for every
 * screen but a session in progress.
 */
export function useTheme(): {
  readonly scheme: Scheme;
  readonly c: Palette;
  readonly s: ReturnType<typeof sharedStyles>;
} {
  const raw = useColorScheme();
  const scheme: Scheme = raw === 'dark' ? 'dark' : 'light';

  // Memoised on the scheme: `StyleSheet.create` on every render would rebuild
  // every style object in the app each time a screen re-rendered.
  const s = useMemo(() => sharedStyles(scheme), [scheme]);
  const c = useMemo(() => palette(scheme), [scheme]);

  return { scheme, c, s };
}
