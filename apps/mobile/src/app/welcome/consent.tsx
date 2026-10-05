import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACE } from '@stillpoint/design-tokens';
import {
  CONSENT_ITEMS,
  hasRequiredConsent,
  DEFAULT_COUNTRY,
  helplinesFor,
  missingConsent,
  type ConsentId,
} from '@stillpoint/protocol';
import { ApiError, api } from '../../api';
import { Button } from '../../ui';
import { useTheme } from '../../use-theme';
import { describe } from '../../describe';
import { inFlight } from '../../presses';

/**
 * What someone agrees to before their first session.
 *
 * Which items are required is the domain's rule (`hasRequiredConsent`), not
 * this screen's, and the server enforces it again — a session cannot start
 * without it whatever a client believes.
 *
 * The helplines come from `helplinesFor()`, which covers Canada and India and
 * returns nothing for anywhere else. Nothing is substituted when it does: a
 * wrong crisis number is worse than none.
 */
export default function Consent() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [accepted, setAccepted] = useState<readonly ConsentId[]>([]);
  /**
   * Whose crisis numbers to print. It was `helplinesFor('IN')`, written when
   * India was the only market — so after Canada became the first one this
   * screen told a Canadian to call 112 and Tele-MANAS. The web's consent
   * screen had the same line; a wrong crisis number is worse than none.
   */
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What is already accepted, so re-opening this screen does not look like
  // nothing was ever agreed. Dropped the moment the user touches a box: a
  // reply that lands late must not undo a choice made in the meantime.
  const touched = useRef(false);

  useEffect(() => {
    void api
      .me()
      .then((profile) => {
        if (touched.current) return;
        setAccepted(
          CONSENT_ITEMS.filter((i) => profile.acceptedConsent.includes(i.id)).map((i) => i.id),
        );
        // The country this screen's crisis numbers come from. It was already
        // being fetched here and thrown away.
        setCountry(profile.country);
      })
      .catch(() => {
        // Nothing accepted is the safe assumption, and the screen already
        // shows that.
      });
  }, []);

  const helplines = helplinesFor(country);
  const emergency = helplines.find((h) => h.kind === 'emergency');
  const helpline = helplines.find((h) => h.kind === 'helpline');

  const canContinue = hasRequiredConsent(accepted);
  const outstanding = missingConsent(accepted).length;

  const toggle = (id: ConsentId) => {
    touched.current = true;
    setAccepted((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const once = useRef(inFlight()).current;

  const accept = () =>
    once(async () => {
      // `inFlight` rather than `if (busy) return`, which cannot refuse a
      // same-frame second tap: the handler closes over the `busy` from the
      // render it was built in. Measured on the settings screen's export,
      // where three same-frame taps started three requests. Here it would be
      // a second `POST /me/consent` on the screen that gates the whole
      // product. See `src/presses.ts`.
      setBusy(true);
      setError(null);
      try {
        await api.consent(accepted);
        router.replace('/welcome/voice');
      } catch (e: unknown) {
        // Both halves of this were missing and the web's copy of this screen
        // has had both: an expired token sent somebody to "check your
        // connection" rather than to sign in, and a 422 naming the consent
        // item they had not accepted said the same thing. On the screen that
        // gates the whole product and names the crisis numbers.
        if (e instanceof ApiError && e.isUnauthenticated) {
          api.storeToken(null);
          router.replace('/welcome');

          return;
        }
        setError(describe(e));
        setBusy(false);
      }
    });

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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
      >
        <Text style={s.link}>← Back</Text>
      </Pressable>

      <Text style={s.title}>Before we start</Text>

      <View
        style={{
          backgroundColor: c.dangerWash,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
        }}
      >
        <Text style={s.body}>
          <Text style={{ fontWeight: '600' }}>This is not therapy or medical advice.</Text>{' '}
          {emergency === undefined || helpline === undefined
            ? 'If you are in danger, contact your local emergency service.'
            : `If you are in danger, call ${emergency.number} or ${helpline.name.replace(
                ' helpline',
                '',
              )} ${helpline.number}.`}
        </Text>
      </View>

      <View style={{ gap: SPACE.md }}>
        {CONSENT_ITEMS.map((item) => {
          const on = accepted.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              // `aria-checked`, not `accessibilityState` — see the note in
              // `welcome/voice.tsx`. A checkbox needs the state for the same
              // reason a radio does, and this is the consent gate.
              aria-checked={on}
              accessibilityLabel={item.text}
              onPress={() => {
                toggle(item.id);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.md,
                padding: SPACE.lg,
                borderRadius: RADIUS.field,
                backgroundColor: c.panel,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: on ? c.accent : c.field,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: on ? c.accent : c.field,
                  backgroundColor: on ? c.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? (
                  <Text style={{ color: c.accentInk, fontSize: 15, lineHeight: 18 }}>✓</Text>
                ) : null}
              </View>
              <Text style={[s.body, { flex: 1 }]}>{item.text}</Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={busy ? 'Saving…' : 'Continue'}
        onPress={() => {
          void accept();
        }}
        disabled={!canContinue}
        busy={busy}
      />

      {error === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {canContinue ? null : (
        <Text style={s.caption}>
          {outstanding === 1
            ? 'One more thing to agree to before you can start.'
            : 'Please agree to both before you start.'}
        </Text>
      )}
    </ScrollView>
  );
}
