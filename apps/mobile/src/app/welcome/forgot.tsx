import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { api } from '../../api';
import { describe } from '../../describe';
import { Button, Field } from '../../ui';
import { useTheme } from '../../use-theme';
import { Mark } from '../../mark';

/**
 * Asking for a reset link.
 *
 * The screen says the same thing whether or not the address has an account,
 * because the server does: this product's user list is people who went looking
 * for help with being upset, and "no account with that address" would confirm
 * membership to anyone who asked.
 *
 * The link itself opens in a browser, not here. It is spent on a web screen,
 * and a deep link into the app would be one more thing to get wrong about a
 * token that resets a password.
 */
export default function Forgot() {
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (email.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (e: unknown) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };

  const padding = {
    padding: SPACE.xl,
    paddingTop: insets.top + SPACE['3xl'],
    paddingBottom: insets.bottom + SPACE.xl,
    gap: SPACE.lg,
  };

  if (sent) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={padding}>
        <Mark />
        <Text style={s.title}>Check your email</Text>
        <Text style={s.lead}>
          If that address has an account, a link to set a new password is on its way. It works once
          and expires in an hour.
        </Text>
        <Text style={s.caption}>
          Your journal is not affected by setting a new password — it will all still be there.
        </Text>
        <Button
          label="Back to sign in"
          onPress={() => {
            router.replace('/welcome');
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
    >
      <Mark />
      <Text style={s.title}>Set a new password</Text>
      <Text style={s.lead}>
        Tell us the address you signed up with and we will send a link to set a new one.
      </Text>

      <Field
        label="Email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        keyboard="email-address"
        autoComplete="email"
        autoFocus
      />

      {error === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Button
        label="Send me a link"
        onPress={() => {
          void ask();
        }}
        disabled={email.trim() === ''}
        busy={busy}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
      >
        <Text style={s.link}>Back to sign in</Text>
      </Pressable>
    </ScrollView>
  );
}
