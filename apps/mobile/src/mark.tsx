import { View } from 'react-native';
import { SPACE } from '@stillpoint/design-tokens';
import { withAlpha } from './theme';
import { useTheme } from './use-theme';

/**
 * The Stillpoint mark: a filled dot inside a faint ring.
 *
 * Two `View`s with a border radius rather than an SVG, because it is two
 * circles and this app would otherwise carry `react-native-svg` for them. The
 * proportions are the icon's, scaled.
 */
export function Mark({ size = 56 }: { size?: number }) {
  const { c } = useTheme();
  const dot = Math.round(size * 0.4);

  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(1, Math.round(size / 24)),
        // The icon draws this ring at 30% of the accent, and so does the web.
        borderColor: withAlpha(c.accent, 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACE.sm,
      }}
    >
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: c.accent,
        }}
      />
    </View>
  );
}
