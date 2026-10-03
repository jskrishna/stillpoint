import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEELING_COLOR, RADIUS, SPACE, TEXT } from '@stillpoint/design-tokens';
import {
  FEELINGS,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  canSelectMore,
  toggleFeeling,
  type FeelingId,
} from '@stillpoint/protocol';
import { ApiError, api, type ApiSession } from '../api';
import { FAMILY, leading } from '../theme';
import { guideVoiceFor, silentGuide, type GuideVoice } from '../voice';
import { Button, Card, Field, Tag } from '../ui';
import { useTheme } from '../use-theme';

const RATINGS = [
  { value: 'yes', label: 'Yes' },
  { value: 'a_little', label: 'A little' },
  { value: 'no', label: 'No' },
] as const;

const LABEL = new Map(FEELINGS.map((f) => [f.id, f.label]));

/**
 * The six-step flow, run by the server.
 *
 * This screen holds no rules. Every answer is posted to
 * `/sessions/{id}/turns`, which screens for risk *before* the guide is
 * consulted and returns the session as the server believes it to be. What is
 * rendered is whatever came back, so the two cannot diverge — and this app
 * cannot skip the safety check, because there is no other way to advance.
 *
 * It is the same shape as the web's `SessionFlow`, deliberately: when someone
 * starts on their phone and comes back on a laptop, the step they are on and
 * the words they are reading should be the same.
 */
export default function Session() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; resume?: string }>();

  // `?kind=quick` — the home screen offers both, and a quick session is the one
  // that is always available whatever the plan allows.
  const kind = params.kind === 'quick' ? 'quick' : 'full';
  // `?resume=1` carries on the open session instead of starting one. Starting
  // one ends whatever was open, so the difference matters: on a free plan it is
  // the difference between spending one of three and spending two.
  const resuming = params.resume === '1';

  const [session, setSession] = useState<ApiSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [lastSaid, setLastSaid] = useState('');
  const [feelings, setFeelings] = useState<readonly FeelingId[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [voice, setVoice] = useState<GuideVoice | null>(null);

  const started = useRef(false);
  const spoken = useRef<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!api.hasToken()) {
      router.replace('/welcome');
      return;
    }

    // The voice is bound from the account's setting. Listening is not built —
    // see `src/voice.ts` — so this only decides whether the guide speaks its
    // question aloud.
    void api
      .me()
      .then((profile) => {
        setVoice(guideVoiceFor(profile.guideVoice));
      })
      .catch(() => {
        // A session without a voice is a typed session, which works.
        setVoice(silentGuide);
      });

    // Resuming asks for the open session; starting asks for a new one, which
    // ends whatever was open. Both land in the same place from here.
    void (
      resuming
        ? api.currentSession().then((open) => open ?? api.startSession(kind))
        : api.startSession(kind)
    )
      .then(setSession)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          api.storeToken(null);
          router.replace('/welcome');
          return;
        }
        if (e instanceof ApiError && e.status === 403) {
          router.replace('/welcome/consent');
          return;
        }
        if (e instanceof ApiError && e.status === 402) {
          // The plan's full-session allowance is spent. A quick session is
          // always available, so offer that rather than a dead end.
          setExhausted(e.message);
          return;
        }
        setError(describe(e));
      });
  }, [router, kind, resuming]);

  /**
   * Says the step's question aloud, once per question.
   *
   * Keyed on the text rather than the step, because the guide may ask a backup
   * question without the step changing — and tracked in a ref so a re-render
   * does not repeat it. Only the protocol's own copy is ever spoken; the
   * user's words are never read back out.
   */
  useEffect(() => {
    if (voice === null || session === null) return;
    const say = session.say ?? '';
    if (say === '' || say === spoken.current) return;

    spoken.current = say;
    void voice.say(say);
  }, [voice, session]);

  // Stop mid-sentence when the screen goes away, so a question is not still
  // being spoken over whatever comes next.
  useEffect(() => {
    if (voice === null) return;
    return () => {
      voice.hush();
    };
  }, [voice]);

  const send = useCallback(
    /**
     * `utterance` is what the server screens and records; `said` is what this
     * screen echoes back. They differ at step 3, where the answer is a
     * selection: the server is sent feeling ids, which are domain, and the
     * user is shown their labels, which are not.
     */
    async (utterance: string, said: string = utterance) => {
      if (session === null || busy) return;
      setBusy(true);
      setError(null);
      // The user has answered, so the question no longer needs saying.
      voice?.hush();
      try {
        // The step goes with the answer. Without it, a reply lost on the way
        // back and then sent again is recorded against the *next* step, whose
        // question is then never answered by anybody — and on a phone, a reply
        // lost on the way back is a Tuesday.
        const next = await api.takeTurn(session.id, utterance, session.step?.id ?? null);
        setSession(next);
        setLastSaid(said);
        setAnswer('');
        setFeelings([]);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.isConflict) {
          // The session ended, or this answer was for a step that has moved
          // on. Either way the server knows where this session is and this
          // screen does not, so take its word for it — and clear the box,
          // because what is in it is not an answer to whatever is asked next.
          setSession(await api.session(session.id));
          setAnswer('');
          setFeelings([]);
        } else {
          setError(describe(e));
        }
      } finally {
        setBusy(false);
      }
    },
    [session, busy, voice],
  );

  const stop = useCallback(async () => {
    if (session === null) return;
    voice?.hush();
    try {
      setSession(await api.stopSession(session.id));
    } catch (e: unknown) {
      setError(describe(e));
    }
  }, [session, voice]);

  const rate = useCallback(
    async (rating: (typeof RATINGS)[number]['value']) => {
      if (session === null) return;
      try {
        setSession(await api.rateSession(session.id, rating));
      } catch (e: unknown) {
        setError(describe(e));
      }
    },
    [session],
  );

  const pad = {
    padding: SPACE.xl,
    paddingTop: insets.top + SPACE.lg,
    paddingBottom: insets.bottom + SPACE['3xl'],
    gap: SPACE.lg,
  };

  if (exhausted !== null) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={pad}>
        <Text style={s.title}>That is this week’s full sessions</Text>
        <Text style={s.lead}>{exhausted}</Text>
        <Button
          label="Start a quick session"
          onPress={() => {
            router.replace('/session?kind=quick');
          }}
        />
        <Button
          label="Back"
          tone="secondary"
          onPress={() => {
            router.replace('/(tabs)');
          }}
        />
      </ScrollView>
    );
  }

  if (error !== null && session === null) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={pad}>
        <Text style={s.lead}>{error}</Text>
        <Button
          label="Back"
          tone="secondary"
          onPress={() => {
            router.replace('/(tabs)');
          }}
        />
      </ScrollView>
    );
  }

  if (session === null) {
    return (
      <View style={s.centred}>
        <Text style={s.caption}>Starting…</Text>
      </View>
    );
  }

  if (session.ended) {
    return session.safety !== null ? (
      <SafetyPause safety={session.safety} />
    ) : (
      <Summary
        session={session}
        onRate={(r) => {
          void rate(r);
        }}
        onFinish={() => {
          router.replace('/(tabs)/journal');
        }}
      />
    );
  }

  /**
   * What the session already holds, for someone coming back to it.
   *
   * Built from what the server sent, not from anything this screen remembered:
   * a resumed session has no local history, and without this a person carries
   * on with no sign of what they had already told it. The step's own echo
   * covers the turn just taken, so this only shows when there is no echo —
   * coming back, rather than mid-flow.
   */
  const recap = [
    { label: 'What happened', value: session.data.whatHappened },
    {
      label: 'What you felt',
      value:
        session.data.feelings.length === 0
          ? null
          : session.data.feelings.map((id) => LABEL.get(id as FeelingId) ?? id).join(', '),
    },
    { label: 'The belief', value: session.data.belief },
  ].filter((line): line is { label: string; value: string } => {
    return line.value !== null && line.value !== '';
  });

  const onFeelStep = session.step?.id === 'feel';
  const canContinue = onFeelStep ? feelings.length > 0 : answer.trim() !== '';

  return (
    <ScrollView style={s.screen} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void stop();
          }}
        >
          <Text style={s.link}>✕ Leave</Text>
        </Pressable>
        {/* Asks the server to screen it, exactly like any other answer. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void send('I need help, I do not feel safe');
          }}
        >
          <Text style={[s.link, { color: c.danger }]}>Get help</Text>
        </Pressable>
      </View>

      <View style={{ gap: SPACE.sm }}>
        <Text style={s.label}>
          Step {session.step?.ordinal} of {session.stepCount} · {session.step?.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACE.xs }}>
          {Array.from({ length: session.stepCount }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: SPACE.xs,
                borderRadius: RADIUS.pill,
                backgroundColor: i < (session.step?.ordinal ?? 0) ? c.accent : c.line,
              }}
            />
          ))}
        </View>
      </View>

      {session.say === null || session.say === '' ? (
        <Text style={s.lead}>
          This step has no question yet. Its copy is still owed by the PRD, so the protocol cannot
          be published.
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: FAMILY.display,
            fontSize: TEXT.stepQuestion,
            lineHeight: leading(TEXT.stepQuestion, 1.4),
            color: c.ink,
          }}
        >
          {session.say}
        </Text>
      )}

      {lastSaid !== '' || recap.length === 0 ? null : (
        <Card>
          <Text style={s.label}>Where you got to</Text>
          {recap.map((line) => (
            <Text key={line.label} style={s.small}>
              <Text style={{ fontFamily: FAMILY.uiSemibold }}>{line.label}:</Text> {line.value}
            </Text>
          ))}
        </Card>
      )}

      {lastSaid === '' ? null : (
        <Card>
          <Text style={s.label}>You said</Text>
          <Text style={s.quote}>“{lastSaid}”</Text>
        </Card>
      )}

      {onFeelStep ? (
        <FeelingPicker
          selected={feelings}
          showMore={showMore}
          onToggle={(id) => {
            setFeelings((current) => toggleFeeling(current, id));
          }}
          onShowMore={() => {
            setShowMore(true);
          }}
        />
      ) : (
        <Field
          label="Your answer"
          value={answer}
          onChange={setAnswer}
          placeholder="Type what you want to say."
          multiline
        />
      )}

      {error === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Button
        label="Continue"
        busy={busy}
        disabled={!canContinue}
        onPress={() => {
          if (onFeelStep) {
            void send(feelings.join(' '), feelings.map((id) => LABEL.get(id) ?? id).join(', '));
          } else {
            void send(answer.trim());
          }
        }}
      />
    </ScrollView>
  );
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

function FeelingPicker({
  selected,
  showMore,
  onToggle,
  onShowMore,
}: {
  selected: readonly FeelingId[];
  showMore: boolean;
  onToggle: (id: FeelingId) => void;
  onShowMore: () => void;
}) {
  const { c, s } = useTheme();
  const full = !canSelectMore(selected);
  const shown = showMore ? [...PRIMARY_FEELINGS, ...MORE_FEELINGS] : PRIMARY_FEELINGS;

  return (
    <View style={{ gap: SPACE.md }}>
      <Text style={s.caption}>Choose up to {MAX_FEELINGS}.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        {shown.map((f) => {
          const on = selected.includes(f.id);
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={f.label}
              onPress={() => {
                onToggle(f.id);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                borderRadius: RADIUS.pill,
                borderWidth: 1.5,
                borderColor: on ? c.accent : c.field,
                backgroundColor: on ? c.accentWash : c.panel,
                // Dimmed, not disabled: the twelfth chip still deselects, so a
                // tap on a chosen one always works.
                opacity: full && !on ? 0.5 : 1,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: FEELING_COLOR[f.id],
                }}
              />
              <Text style={{ fontFamily: FAMILY.ui, fontSize: TEXT.small, color: c.ink }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {showMore ? null : (
        <Pressable accessibilityRole="button" onPress={onShowMore}>
          <Text style={s.link}>See more feelings</Text>
        </Pressable>
      )}
    </View>
  );
}

function Summary({
  session,
  onRate,
  onFinish,
}: {
  session: ApiSession;
  onRate: (r: (typeof RATINGS)[number]['value']) => void;
  onFinish: () => void;
}) {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = session;

  const rows = [
    { label: 'What happened', value: data.whatHappened },
    {
      label: 'What you felt',
      value:
        data.feelings.length > 0
          ? data.feelings.map((id) => LABEL.get(id as FeelingId) ?? id).join(', ')
          : null,
    },
    { label: 'Old belief', value: data.belief === null ? null : `“${data.belief}”` },
    { label: 'Forgiveness', value: data.forgiveness },
  ].filter((r): r is { label: string; value: string } => r.value !== null && r.value !== '');

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE['3xl'],
        paddingBottom: insets.bottom + SPACE['3xl'],
        gap: SPACE.lg,
      }}
    >
      <Tag text={session.endReason === 'completed' ? 'Session complete' : 'Session saved'} />
      <Text style={s.title}>{session.endReason === 'completed' ? 'Well done.' : 'Saved.'}</Text>

      {rows.map((row) => (
        <View key={row.label} style={{ gap: SPACE.xs }}>
          <Text style={s.label}>{row.label}</Text>
          <Text style={s.quote}>{row.value}</Text>
        </View>
      ))}

      <Card>
        <Text style={s.subheading}>Do you feel a bit calmer?</Text>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {RATINGS.map((r) => {
            const on = data.calmerRating === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onRate(r.value);
                }}
                style={{
                  flex: 1,
                  paddingVertical: SPACE.md,
                  borderRadius: RADIUS.button,
                  borderWidth: 1.5,
                  borderColor: on ? c.accent : c.field,
                  backgroundColor: on ? c.accentWash : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: FAMILY.uiMedium, fontSize: TEXT.control, color: c.ink }}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Button label="Save and finish" onPress={onFinish} />
    </ScrollView>
  );
}

/**
 * The safety pause.
 *
 * Rendered entirely from what the server sent: the wording and the helplines
 * come from the protocol version the session ran on, so this screen cannot
 * disagree with the rest of the product about which number to call. There is
 * no way on from here back into the session, and that is the rule, not an
 * omission.
 */
function SafetyPause({ safety }: { safety: NonNullable<ApiSession['safety']> }) {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE['3xl'],
        paddingBottom: insets.bottom + SPACE['3xl'],
        gap: SPACE.lg,
      }}
    >
      <Text style={s.title}>{safety.title}</Text>
      <Text style={s.lead}>{safety.body}</Text>

      {safety.helplines.map((h) => (
        <Pressable
          key={h.number}
          accessibilityRole="button"
          accessibilityLabel={`Call ${h.name} on ${h.number}`}
          // A phone can actually make the call, which is the whole point of
          // this screen being on a phone.
          onPress={() => {
            void Linking.openURL(`tel:${h.number}`);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.md,
            padding: SPACE.lg,
            borderRadius: RADIUS.card,
            backgroundColor: h.kind === 'emergency' ? c.danger : c.positive,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <Text
              style={{
                fontFamily: FAMILY.uiSemibold,
                fontSize: TEXT.body,
                color: h.kind === 'emergency' ? c.dangerInk : '#FFFFFF',
              }}
            >
              {h.name}
            </Text>
            <Text
              style={{
                fontFamily: FAMILY.ui,
                fontSize: TEXT.caption,
                color: h.kind === 'emergency' ? c.dangerInk : '#FFFFFF',
                opacity: 0.9,
              }}
            >
              {h.detail}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: FAMILY.uiSemibold,
              fontSize: TEXT.subheading,
              color: h.kind === 'emergency' ? c.dangerInk : '#FFFFFF',
            }}
          >
            {h.number}
          </Text>
        </Pressable>
      ))}

      <Button
        label="I’m safe, go back home"
        tone="secondary"
        onPress={() => {
          router.replace('/(tabs)');
        }}
      />
    </ScrollView>
  );
}
