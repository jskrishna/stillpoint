import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEELING_COLOR, RADIUS, SPACE, TEXT } from '@stillpoint/design-tokens';
import {
  CALMER_ANSWER_LABEL,
  CALMER_RATINGS,
  DEFAULT_COUNTRY,
  FEELINGS,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  baselineRiskScreen,
  canSelectMore,
  helplinesFor,
  toggleFeeling,
  type FeelingId,
} from '@stillpoint/protocol';
import { ApiError, api, type ApiHelpline, type ApiSession } from '../api';
import { describe } from '../describe';
import { inOrder } from '../presses';
import { FAMILY, leading } from '../theme';
import { guideVoiceFor, silentGuide, type GuideVoice } from '../voice';
import { Button, Card, Field, HelplineButton, Tag } from '../ui';
import { useTheme } from '../use-theme';

// One copy of the three answers, from the domain. Both session screens held
// their own identical array of these, which is how the plan labels and the
// console's word for a full session came to disagree.
const RATINGS = CALMER_RATINGS.map((value) => ({ value, label: CALMER_ANSWER_LABEL[value] }));

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
  /** Whose crisis numbers, if this screen ever has to offer them itself. */
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  /**
   * Helplines to show beside an answer that never reached the server.
   *
   * **This is not the stop and must never become it.** The stop, the flag and
   * the queue are the server's — `takeTurn()` screens before the guide is
   * consulted, and nothing here changes that. What this covers is the one case
   * the server cannot: the request did not arrive. Somebody typed that they
   * were going to kill themselves, the POST died in a tunnel, and the screen
   * said "Could not reach Stillpoint. Check your connection and try again." —
   * a connection error, to a person who had just said that. On a phone that is
   * not a rare case; it is the normal one.
   *
   * So on a failure, and only on a failure, the local screen's `high` is
   * enough to put a number on the screen. It does not end the session, does
   * not raise a flag and does not claim to have read anything: the answer
   * stays in the box and the retry goes through the server, which does all
   * three. `high` and not `medium`, to match the level the server stops on.
   *
   * Its silence means nothing. The phrase screen misses whole languages, so an
   * empty list here is not evidence of safety — the same rule as a `none` from
   * that screen. The web app has this in the same words.
   */
  const [unsentCrisis, setUnsentCrisis] = useState<readonly ApiHelpline[] | null>(null);
  /**
   * Helplines this screen is showing because the person asked, or because the
   * server sent them beside a refusal. The web app has this in the same words.
   *
   * **"Get help"** puts the account's own numbers here the moment it is
   * pressed, before anything is asked of the network, and then asks the server
   * to end the session as a safety stop. It used to send the sentence "I need
   * help, I do not feel safe" as an ordinary turn, which the screen grades
   * `none`: the request was recorded as the step's answer and no number
   * appeared.
   *
   * And **a turn the server refused because the session had ended**: it reads
   * the words before refusing, and a `high` answer comes back as a 409 with
   * the helplines on it.
   *
   * An offer and not the stop, like `unsentCrisis`. Unlike it, a later answer
   * does not clear it: somebody who asked for help is not un-asked by
   * carrying on.
   */
  const [offered, setOffered] = useState<readonly ApiHelpline[] | null>(null);
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
        setVoice(guideVoiceFor(profile.talkMode));
        setCountry(profile.country);
      })
      .catch(() => {
        // A session without a voice is a typed session, which works.
        setVoice(silentGuide);
      });

    // Resuming asks for the open session; starting asks for a new one, which
    // ends whatever was open. Both land in the same place from here.
    //
    // Carrying on does not start anything. It used to fall back to starting
    // one when nothing was open, so "Carry on where you left off", pressed
    // after the session had been finished on another device, quietly started
    // a new full session and spent one of the week's three. With nothing to
    // carry on, the home screen is the honest place to be: it asks the server
    // what is open and says so.
    void (resuming ? api.currentSession() : api.startSession(kind))
      .then((found) => {
        if (found === null) {
          router.replace('/(tabs)');
          return;
        }
        setSession(found);
      })
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
    // No `?? ''`: an empty string is not `GuideCopy`, and nothing should be
    // cast into it to paper over a session with nothing to say.
    const say = session.say;
    if (say === null || say === '' || say === spoken.current) return;

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
        // It arrived, so the server has screened it and this screen has no
        // business second-guessing what it decided.
        setUnsentCrisis(null);
        setLastSaid(said);
        setAnswer('');
        setFeelings([]);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.isConflict) {
          // Refused, and read first: the server screens a turn before it
          // answers 409, whether the step had moved on or the session had
          // ended. An ended session cannot be stopped a second time, so for a
          // `high` answer into one the numbers come back on the refusal.
          if (e.helplines.length > 0) setOffered(e.helplines);
          // The session ended, or this answer was for a step that has moved
          // on. Either way the server knows where this session is and this
          // screen does not, so take its word for it — and clear the box,
          // because what is in it is not an answer to whatever is asked next.
          try {
            setSession(await api.session(session.id));
            setAnswer('');
            setFeelings([]);
          } catch (again: unknown) {
            // This read sat in a `catch` with nothing around it, so a failure
            // here was an unhandled rejection and a screen that said nothing.
            setError(describe(again));
          }
        } else {
          setError(describe(e));
          // The server never saw this one. See `unsentCrisis` above for why the
          // local screen gets to speak here and nowhere else.
          setUnsentCrisis(
            baselineRiskScreen.assess(utterance).level === 'high' ? helplinesFor(country) : null,
          );
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

  /**
   * "Get help". The numbers first, from this device, and then the request.
   *
   * The order is the rule: a help button that shows a phone number only once a
   * request has come back is one that shows nothing in a tunnel. So the
   * account's own helplines go on the screen before the network is asked for
   * anything, and what the server adds when it answers is the stop itself: the
   * session ends, a flag reaches the queue, and the pause replaces this
   * screen. If it does not answer, the numbers are still here and the failure
   * says so beside them.
   *
   * No in-flight guard, deliberately. A second press sends a second request
   * the server answers the same way, and the one thing a guard could do here
   * is refuse somebody asking for help.
   */
  const getHelp = useCallback(async () => {
    if (session === null) return;
    setOffered(helplinesFor(country));
    setError(null);
    voice?.hush();
    try {
      setSession(await api.askForHelp(session.id));
    } catch (e: unknown) {
      setError(describe(e));
    }
  }, [session, country, voice]);

  /*
   * The same ordering the settings screen's choices needed, and for the same
   * reason: the summary offers three answers side by side, so a second tap is
   * a change of mind rather than a duplicate press, and nothing ordered the
   * two `PATCH`es. The cost here is a label on somebody's own journal rather
   * than who can read it, which is why `src/presses.ts` carries the
   * measurement from the sharper case.
   */
  const queueRating = useRef(inOrder()).current;

  const rate = useCallback(
    (rating: (typeof RATINGS)[number]['value']) =>
      queueRating(async () => {
        if (session === null) return;
        setError(null);
        try {
          setSession(await api.rateSession(session.id, rating));
        } catch (e: unknown) {
          setError(describe(e));
        }
      }),
    [session, queueRating],
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
        offered={offered}
        problem={error}
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
        {/* Not a turn: see `getHelp`. Nothing is recorded as an answer. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void getHelp();
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

      <Offered helplines={offered} />

      {unsentCrisis === null || unsentCrisis.length === 0 ? null : (
        /*
         * An alert over the whole block, the same as the web's.
         *
         * The error above this has been `accessibilityRole="alert"` since it
         * was written and these numbers were not, which is the gap the web had
         * too: somebody using a screen reader typed that they wanted to kill
         * themselves, the POST died, and the three numbers that answer that
         * appeared with nothing announcing them. `accessibilityLiveRegion` is
         * Android's half and the role is what VoiceOver reads, so both are set.
         */
        <View
          style={{ gap: SPACE.md }}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={s.lead}>
            That answer has not been sent. If you are in danger right now, these do not need the
            internet.
          </Text>
          {unsentCrisis.map((h) => (
            <HelplineButton key={h.number} helpline={h} />
          ))}
        </View>
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

/**
 * The numbers this screen offers on its own account. See `offered`.
 *
 * An alert over the whole block, for the reason the unsent-answer block is
 * one: the sentence and the numbers have to be announced together. An
 * unserved country has no numbers and so no block, because a sentence with
 * nothing under it is the same mistake as a wrong number.
 */
function Offered({ helplines }: { helplines: readonly ApiHelpline[] | null }) {
  const { s } = useTheme();

  if (helplines === null || helplines.length === 0) return null;

  return (
    <View style={{ gap: SPACE.md }} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={s.lead}>If you are in danger right now, these do not need the internet.</Text>
      {helplines.map((h) => (
        <HelplineButton key={h.number} helpline={h} />
      ))}
    </View>
  );
}

function Summary({
  session,
  offered,
  problem,
  onRate,
  onFinish,
}: {
  session: ApiSession;
  /** Helplines to keep on screen: this session ended some other way than a stop. */
  offered: readonly ApiHelpline[] | null;
  /** A failed rating. It used to be set and never drawn. */
  problem: string | null;
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
    {
      label: 'Old belief',
      // An empty belief is no belief — see `packages/protocol/src/journal.ts`.
      value: data.belief === null || data.belief === '' ? null : `“${data.belief}”`,
    },
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

      {/*
        Somebody asked for help, or said something the server stops for, into a
        session that had already ended another way. It cannot become a safety
        stop, so there is no pause to show; the numbers stay here instead.
      */}
      <Offered helplines={offered} />

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

      {/*
        A rating that did not save. `rate` has always set this, and the only
        place it was drawn is the step screen, which an ended session never
        renders: tap "Yes" with no signal and nothing changed and nothing was
        said, then "Save and finish" left with the answer lost.
      */}
      {problem === null ? null : (
        <Text style={s.error} accessibilityRole="alert">
          {problem}
        </Text>
      )}

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
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * Say that the screen changed.
   *
   * The web's half of this moves focus to the heading, which is what a browser
   * gives you. React Native's equivalent — `setAccessibilityFocus` through
   * `findNodeHandle` — needs a host node and behaves differently on each
   * platform, so the portable answer is to announce it: VoiceOver and TalkBack
   * both speak this, and the live region below covers a re-render.
   *
   * **This is one of the things `apps/mobile/README.md` lists as unproven.**
   * There is no device or simulator here, so what is verified is that the call
   * is made with the title the server sent; whether a screen reader speaks it
   * is item 6 in `LAUNCH.md`, with the `tel:` links and the keychain.
   */
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(safety.title);
  }, [safety.title]);

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
      <View accessibilityLiveRegion="assertive" style={{ gap: SPACE.lg }}>
        <Text style={s.title} accessibilityRole="header">
          {safety.title}
        </Text>
        <Text style={s.lead}>{safety.body}</Text>

        {safety.helplines.map((h) => (
          <HelplineButton key={h.number} helpline={h} />
        ))}
      </View>

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
