import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { CONTROL, SPACE, TEXT } from '@stillpoint/design-tokens';
import { FAMILY } from '../../theme';
import { useTheme } from '../../use-theme';

/**
 * The four places the app keeps: today, the journal, what it notices, and
 * settings.
 *
 * Labels and no icons. The design set does not assign the tab bar any
 * iconography, and drawing four glyphs here would be inventing product visuals
 * the same way inventing step copy would be inventing the guide's voice. When
 * the designs settle it, the icons go in beside these labels.
 */
export default function TabLayout() {
  const { c } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.panel,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.line,
          height: CONTROL.primary + SPACE.lg,
          paddingTop: SPACE.sm,
        },
        tabBarLabelStyle: { fontFamily: FAMILY.uiMedium, fontSize: TEXT.caption },
        // No icon, rather than the navigator's placeholder glyph. See above.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="insights" options={{ title: 'Noticing' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
