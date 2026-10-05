import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { GUIDE_VOICES, type GuideVoice } from '@stillpoint/protocol';
import { ApiError, api } from '../../api';
import { NO_EAR_REASON, systemGuideVoice, voicePreview } from '../../voice';
import { Button, Card } from '../../ui';
import { useTheme } from '../../use-theme';
import { describe } from '../../describe';

/**
 * Voice setup, the last step before the app.
 *
 * "Keep it silent" never asks for the microphone, and is not styled as a lesser
 * path: typing is a mode of its own, and it is the one that works today.
 *
 * The phone can do one thing the web screen cannot — let someone hear a voice
 * before choosing it. The sample is a line about the choice itself, never
 * protocol copy and never a person's words.
 */
export default function VoiceSetup() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [voice, setVoice] = useState<GuideVoice['id']>('sage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = (id: GuideVoice['id']) => {
    const chosen = GUIDE_VOICES.find((v) => v.id === id);
    if (chosen === undefined) return;
    // A preview is asked for by pressing it, so it speaks whatever the talk
    // mode will be: this is how somebody chooses before choosing silence.
    void systemGuideVoice().say(voicePreview(chosen));
  };

  const go = async (talkMode: 'hold' | 'type') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({ guideVoice: voice, talkMode });
      router.replace('/(tabs)');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isUnauthenticated) {
        api.storeToken(null);
        router.replace('/welcome');
        return;
      }
      // The server's own sentence: `updateMe` validates `guideVoice`, so a
      // refusal here says which value it would not take.
      setError(describe(e));
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE.xl,
        paddingBottom: insets.bottom + SPACE.xl,
        gap: SPACE.lg,
      }}
    >
      <Text style={s.title}>Set up your voice</Text>
      <Text style={s.lead}>
        Choose how the guide sounds. Your voice is never saved — and until speaking is built, it is
        never sent anywhere either, because your answers are typed.
      </Text>

      <Text style={s.label}>Guide voice</Text>
      <Card style={{ gap: SPACE.xl }}>
        {GUIDE_VOICES.map((v) => {
          const on = voice === v.id;
          return (
            <Pressable
              key={v.id}
              accessibilityRole="radio"
              /*
               * `aria-checked`, which was `accessibilityState={{ selected }}`.
               *
               * Two things were wrong with that. A radio's state is
               * checkedness, and `selected` sets a different node property —
               * TalkBack reads `isChecked()` for a radio, so the option the
               * person had just chosen announced as "not checked". And
               * React Native Web does not translate `accessibilityState` at
               * all: measured in the export, these rendered `role="radio"`
               * with no state attribute of any kind, which axe calls critical.
               *
               * `aria-checked` is React Native's own documented alias for
               * `accessibilityState.checked`, so it is one prop that is right
               * on iOS, on Android and in the export the checks can read.
               */
              aria-checked={on}
              accessibilityLabel={`${v.name}, ${v.description}`}
              onPress={() => {
                setVoice(v.id);
                preview(v.id);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: on ? c.accent : c.field,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? (
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, gap: SPACE.xs }}>
                <Text style={s.body}>{v.name}</Text>
                <Text style={s.caption}>{v.description}</Text>
              </View>
              <Text style={s.link}>Hear it</Text>
            </Pressable>
          );
        })}
      </Card>

      <Text style={s.caption}>
        The guide can read its questions aloud. Hearing you is not built yet, so you type your
        answers either way. {NO_EAR_REASON}
      </Text>

      {error === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Button
        label="Let the guide speak"
        busy={busy}
        onPress={() => {
          void go('hold');
        }}
      />
      <Button
        label="Keep it silent"
        tone="quiet"
        disabled={busy}
        onPress={() => {
          void go('type');
        }}
      />
    </ScrollView>
  );
}
