import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { api } from '../../api';
import { describe } from '../../describe';
import { Button, Field } from '../../ui';
import { useTheme } from '../../use-theme';
import { Mark } from '../../mark';

/**
 * Sign in, or make an account.
 *
 * The designs show Google and Apple sign-in. Neither exists on the server, so
 * neither is offered here as though it did: the buttons stay visible and
 * disabled, and say why. A button that looked like Google sign-in and quietly
 * skipped to the next screen would be a lie about who is signed in.
 */
export default function Welcome() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<'signIn' | 'create'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creating = mode === 'create';
  const canSubmit =
    email.trim() !== '' && password !== '' && (!creating || name.trim() !== '') && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const profile = creating
        ? await api.register(name.trim(), email.trim(), password)
        : await api.login(email.trim(), password);

      // Consent is the server's gate, not this screen's: it decides whether a
      // session may start, so it decides where the user goes next.
      router.replace(profile.hasRequiredConsent ? '/(tabs)' : '/welcome/consent');
    } catch (e: unknown) {
      setError(describe(e));
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE['3xl'],
        paddingBottom: insets.bottom + SPACE.xl,
        gap: SPACE.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Mark />
      <Text style={s.title}>Welcome to Stillpoint</Text>
      <Text style={s.lead}>A calm voice guide for when something upsets you.</Text>

      <View style={{ gap: SPACE.sm }}>
        <Button label="Continue with Google" onPress={() => undefined} tone="secondary" disabled />
        <Button label="Continue with Apple" onPress={() => undefined} tone="secondary" disabled />
        <Text style={s.caption}>
          Google and Apple sign-in are not built yet. Use an email and password for now.
        </Text>
      </View>

      {creating ? <Field label="Name" value={name} onChange={setName} autoComplete="name" /> : null}

      <Field
        label="Email"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        keyboard="email-address"
        autoComplete="email"
      />

      <Field
        label="Password"
        value={password}
        onChange={setPassword}
        secure
        autoComplete={creating ? 'new-password' : 'password'}
      />

      {error === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Button
        label={creating ? 'Create my account' : 'Sign in'}
        onPress={() => {
          void submit();
        }}
        disabled={!canSubmit}
        busy={busy}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode(creating ? 'signIn' : 'create');
          setError(null);
        }}
      >
        <Text style={s.link}>
          {creating ? 'I already have an account' : 'Create an account instead'}
        </Text>
      </Pressable>

      {creating ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push('/welcome/forgot');
          }}
        >
          <Text style={s.link}>I’ve forgotten my password</Text>
        </Pressable>
      )}

      <Text style={[s.caption, { color: c.muted }]}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>
    </ScrollView>
  );
}
