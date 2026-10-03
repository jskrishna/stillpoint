import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { restoreToken } from '../api';
import { discardPreviousExport } from '../exports';
import { FAMILY } from '../theme';
import { useTheme } from '../use-theme';

// Held until the fonts are loaded and the keychain has been read. Both have to
// happen before the first screen: a font swap is visible, and a screen that
// renders before the token is restored sends a signed-in user to sign in.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { c, scheme } = useTheme();

  const [fontsLoaded, fontError] = useFonts({
    [FAMILY.display]: Newsreader_400Regular,
    [FAMILY.displayMedium]: Newsreader_500Medium,
    [FAMILY.ui]: HankenGrotesk_400Regular,
    [FAMILY.uiMedium]: HankenGrotesk_500Medium,
    [FAMILY.uiSemibold]: HankenGrotesk_600SemiBold,
  });

  const [tokenRestored, setTokenRestored] = useState(false);

  useEffect(() => {
    void restoreToken().then(() => {
      setTokenRestored(true);
    });

    // A journal export cannot be deleted when it is shared — the share sheet
    // may still be reading it — so the previous one goes now, when any share
    // has certainly finished. See `src/exports.ts` for what that does and does
    // not buy.
    discardPreviousExport();
  }, []);

  // A font that will not load is not a reason to refuse to start: the stacks
  // fall back to the platform serif and sans, and someone who is upset should
  // not meet a blank screen over a typeface.
  const fontsSettled = fontsLoaded || fontError !== null;
  const ready = fontsSettled && tokenRestored;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          // The whole app is one colour field; a sheet sliding over it with its
          // own shadow reads as a different product.
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
