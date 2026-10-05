import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACE } from '@stillpoint/design-tokens';
import {
  COACH_SHARINGS,
  COACH_SHARING_LABEL,
  GUIDE_VOICES,
  TALK_MODES,
  TALK_MODE_LABEL,
  PLAN_LABEL,
  helplinesFor,
  isPlanId,
  relativeDay,
} from '@stillpoint/protocol';
import * as Sharing from 'expo-sharing';
import { ApiError, api, type ApiMyCoach, type Profile } from '../../api';
import { describe } from '../../describe';
import { inFlight, inOrder } from '../../presses';
import { exportFile } from '../../exports';
import { NO_EAR_REASON } from '../../voice';
import { Button, Card, Field, HelplineButton, Tag, Waiting } from '../../ui';
import { useTheme } from '../../use-theme';

/**
 * Settings: the voice, how you talk to it, who can read your sessions, and
 * leaving.
 *
 * Every change is a PATCH and the profile is replaced with what came back, so
 * this screen never shows a preference the server did not record.
 */
export default function Settings() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [coaches, setCoaches] = useState<readonly ApiMyCoach[]>([]);
  /** Whether this screen could not find out, which is not the same as nobody. */
  const [coachesUnknown, setCoachesUnknown] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  // Erasing the account. Behind a disclosure rather than a row that acts on a
  // tap: this is the one control on the phone that cannot be undone, and an
  // unlocked phone in someone else's hand should not be one tap from it.
  const [erasing, setErasing] = useState(false);
  const [erasePassword, setErasePassword] = useState('');
  const [eraseConfirm, setEraseConfirm] = useState('');
  const [eraseProblem, setEraseProblem] = useState<string | null>(null);
  const [erasingBusy, setErasingBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void api
        .me()
        .then(setProfile)
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.isUnauthenticated) {
            api.storeToken(null);
            router.replace('/welcome');
            return;
          }
          setProblem(describe(e));
        });

      void api
        .myCoaches()
        .then((mine) => {
          setCoaches(mine);
          setCoachesUnknown(false);
        })
        .catch(() => {
          // Not `setCoaches([])`. An empty list is this screen's word for
          // "Nobody. A coach can only read a session after you have shared it
          // with them." — which it printed to somebody whose coach was reading
          // two of their sessions, because the request that would have said so
          // failed. Measured against the running app: with the request
          // answering the screen listed Meera and offered "Stop sharing"; with
          // it failing it said nobody could see anything, and the only control
          // for revoking it was gone with the list.
          //
          // This is the screen that answers "who can read my sessions". A
          // sharing rule the sharer cannot inspect is a promise about somebody
          // else's behaviour; one that answers wrongly, in the reassuring
          // direction, is worse than one that admits it does not know.
          setCoachesUnknown(true);
        });
    }, [router]),
  );

  /*
   * Serialised, so the server ends on the last option tapped rather than on
   * whichever request happened to arrive last. Measured before it was: a
   * person who chose "Share every session", changed their mind and tapped
   * "Never share" was left with `coachSharing = "always"` on the server and
   * "Share every session" on the screen — agreeing with each other, so
   * nothing to notice, on the setting that decides who may read their
   * sessions. `src/presses.ts` has the measurement and why ordering the
   * writes beats filtering the answers.
   */
  const queueChange = useRef(inOrder()).current;

  /*
   * And two refusals, because a guard reading a state variable cannot refuse
   * a same-frame second press — `src/presses.ts` has the measurements.
   */
  const onceExporting = useRef(inFlight()).current;
  const onceErasing = useRef(inFlight()).current;

  const change = (changes: Parameters<typeof api.updateMe>[0]) =>
    queueChange(async () => {
      try {
        setProfile(await api.updateMe(changes));
        setProblem(null);
      } catch (e: unknown) {
        setProblem(describe(e));
      }
    });

  /**
   * The user's own copy of their own data.
   *
   * Written to the app's cache and handed to the system share sheet, which is
   * what a phone has instead of a download. It goes to wherever they choose
   * and to no service of ours — the whole journal is fetched here and nowhere
   * else, because this is the one place that genuinely needs all of it.
   *
   * The file is not deleted here: the share sheet may still be reading it when
   * this returns. It is deleted at the next launch instead — see
   * `src/exports.ts`, which has why "the system empties the cache eventually"
   * was not good enough for a plaintext copy of somebody's whole journal.
   */
  const exportData = () =>
    onceExporting(async () => {
      /*
       * The handler refuses, like `eraseAccount` below and unlike the version
       * of this that shipped. `Button`'s own `disabled` is not the guard:
       * measured in the running export with `GET /journal` held open, three
       * taps inside one frame started **three** whole-journal reads — React had
       * not re-rendered between them, which is what a real double-tap is and
       * what three separate clicks a few milliseconds apart are not.
       *
       * The cost is not a wasted round trip. `exportFile()` is one fixed path,
       * overwritten, so a second export can be writing the file while the first
       * is handing it to the share sheet — a half-written plaintext copy of
       * somebody's whole journal, shared. Three reads of the whole journal also
       * spend an allowance shared with every other authenticated route.
       */
      setExporting(true);
      try {
        const journal = await api.wholeJournal();
        const file = exportFile();
        if (file === null) {
          setProblem('Saving a copy needs a filesystem this build does not have.');

          return;
        }
        file.create({ overwrite: true });
        file.write(JSON.stringify({ account: profile, journal }, null, 2));

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            UTI: 'public.json',
            dialogTitle: 'Your Stillpoint data',
          });
          setProblem(null);
        } else {
          // A device with nothing to share to. Saying where the file is beats
          // saying nothing, and beats pretending the share happened.
          setProblem(`Sharing is not available here. The file is at ${file.uri}`);
        }
      } catch (e: unknown) {
        setProblem(describe(e));
      } finally {
        setExporting(false);
      }
    });

  /**
   * Erases the account.
   *
   * Not reversible, and it takes everything: sessions, journal, who could read
   * it. The password and the typed confirmation are both the server's
   * requirement, not this screen's — so a client cannot skip either.
   */
  const eraseAccount = () =>
    onceErasing(async () => {
      // The handler refuses, not the disabled state — and not `erasingBusy`
      // either, which is what this said and which cannot work: the handler
      // closes over the value from the render it was built in, so a
      // same-frame second tap read `false` and erased twice. The state is
      // still what the label is drawn from; `inFlight` is the refusal.
      // `endCoaching` needs none of this — it goes through `Alert.alert`,
      // which dismisses on the first tap, so the phone cannot double-fire it
      // the way the web can.
      setErasingBusy(true);
      setEraseProblem(null);
      try {
        await api.deleteAccount(erasePassword, eraseConfirm);
        router.replace('/welcome');
      } catch (e: unknown) {
        setEraseProblem(describe(e));
        setErasingBusy(false);
      }
    });

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      // Whatever the server said, this phone is signed out.
      router.replace('/welcome');
    }
  };

  const endCoaching = (coach: ApiMyCoach) => {
    Alert.alert(
      `Stop sharing with ${coach.name}?`,
      'They lose access to every session you shared, straight away. Your journal is untouched.',
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () => {
            void api
              .endCoaching(coach.id)
              .then(() => api.myCoaches())
              .then((mine) => {
                setCoaches(mine);
                // Or a list read successfully here would stay hidden behind an
                // earlier failure's message.
                setCoachesUnknown(false);
              })
              .catch((e: unknown) => {
                setProblem(describe(e));
              });
          },
        },
      ],
    );
  };

  if (profile === null) return <Waiting what="Loading your settings…" />;

  const helplines = helplinesFor(profile.country);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE.xl,
        paddingBottom: SPACE['3xl'],
        gap: SPACE.xl,
      }}
    >
      <Text style={s.title}>Settings</Text>

      {problem === null ? null : <Text style={s.error}>{problem}</Text>}

      <Card>
        <Text style={s.subheading}>{profile.name}</Text>
        <Text style={s.caption}>{profile.email}</Text>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          {/*
            `PLAN_LABEL`: this read `plan === 'free' ? 'Free plan' : plan`, so
            a Plus account was shown the database's own `plus` and a Coach
            account `coach`. The web had the same bug the other way and told a
            Coach account it was on Free.
          */}
          <Tag text={isPlanId(profile.plan) ? `${PLAN_LABEL[profile.plan]} plan` : profile.plan} />
          {profile.role === 'user' ? null : <Tag text={profile.role} />}
        </View>
      </Card>

      <Group label="The guide's voice">
        {GUIDE_VOICES.map((v) => (
          <Choice
            key={v.id}
            label={v.name}
            detail={v.description}
            on={profile.guideVoice === v.id}
            onPress={() => {
              void change({ guideVoice: v.id });
            }}
          />
        ))}
        <Choice
          label="No voice"
          detail="Read the steps instead"
          on={profile.guideVoice === 'off'}
          onPress={() => {
            void change({ guideVoice: 'off' });
          }}
        />
      </Group>

      <Group label="How you talk to it">
        {TALK_MODES.map((m) => (
          <Choice
            key={m}
            label={TALK_MODE_LABEL[m]}
            on={profile.talkMode === m}
            onPress={() => {
              void change({ talkMode: m });
            }}
          />
        ))}
        {/* Once, under the group, rather than against each mode that cannot
            do it yet: the same sentence three times reads as three faults. */}
        <Text style={s.caption}>{NO_EAR_REASON}</Text>
      </Group>

      <Group label="Sharing with a coach">
        {COACH_SHARINGS.map((sharing) => (
          <Choice
            key={sharing}
            label={COACH_SHARING_LABEL[sharing]}
            on={profile.coachSharing === sharing}
            onPress={() => {
              void change({ coachSharing: sharing });
            }}
          />
        ))}
      </Group>

      <Group label="Who can see your sessions">
        {coachesUnknown ? (
          <Text style={s.caption}>
            Could not check who can see your sessions. This does not mean nobody can — open this
            screen again to try.
          </Text>
        ) : coaches.length === 0 ? (
          <Text style={s.caption}>
            Nobody. A coach can only read a session after you have shared it with them.
          </Text>
        ) : (
          coaches.map((coach) => (
            <View key={coach.id} style={{ gap: SPACE.sm }}>
              <Text style={s.body}>{coach.name}</Text>
              <Text style={s.caption}>
                {coach.sharedSessions === 0
                  ? 'No sessions shared yet'
                  : `${String(coach.sharedSessions)} ${
                      coach.sharedSessions === 1 ? 'session' : 'sessions'
                    } shared`}
                {coach.since === null ? '' : ` · since ${relativeDay(new Date(coach.since), now)}`}
              </Text>
              <Button
                label="Stop sharing"
                tone="quiet"
                onPress={() => {
                  endCoaching(coach);
                }}
              />
            </View>
          ))
        )}
      </Group>

      {helplines.length === 0 ? null : (
        <Group label="If you need someone now">
          {/*
           * Dialable, which these were not. They were plain `Text` while the
           * safety pause one screen over had a pressable all along — so the
           * one place somebody looks for a number *outside* a session was
           * the one place they had to retype it. `HelplineButton` is shared
           * now, the way the web's `HelplineLink` is.
           */}
          {helplines.map((h) => (
            <HelplineButton key={h.number} helpline={h} />
          ))}
        </Group>
      )}

      <Button
        label="Sign out"
        tone="secondary"
        onPress={() => {
          void signOut();
        }}
      />

      <Text style={s.label}>Your data</Text>
      <Button
        label={exporting ? 'Gathering it…' : 'Export everything'}
        tone="secondary"
        busy={exporting}
        onPress={() => {
          void exportData();
        }}
      />
      <Text style={s.caption}>
        Every session you have finished, as a file you keep. It goes where you send it and nowhere
        else.
      </Text>

      <Text style={s.label}>Delete my account</Text>
      {erasing ? (
        <Card style={{ gap: SPACE.lg }}>
          <Text style={s.body}>
            This removes your account and everything in it — every session, every journal entry, and
            anyone’s ability to read them. It cannot be undone, and we cannot get it back for you.
          </Text>

          <Field
            label="Your password"
            value={erasePassword}
            onChange={setErasePassword}
            secure
            autoComplete="current-password"
          />
          <Field
            label={`Type ${api.DELETE_CONFIRMATION} to confirm`}
            value={eraseConfirm}
            onChange={setEraseConfirm}
          />

          {eraseProblem === null ? null : (
            <Text style={s.error} accessibilityRole="alert">
              {eraseProblem}
            </Text>
          )}

          <Button
            label="Keep my account"
            onPress={() => {
              setErasing(false);
              setErasePassword('');
              setEraseConfirm('');
              setEraseProblem(null);
            }}
          />
          <Button
            label={erasingBusy ? 'Deleting…' : 'Delete everything'}
            tone="danger"
            busy={erasingBusy}
            disabled={erasePassword === '' || eraseConfirm.trim() !== api.DELETE_CONFIRMATION}
            onPress={() => {
              void eraseAccount();
            }}
          />
        </Card>
      ) : (
        <Button
          label="Delete my account"
          tone="quiet"
          onPress={() => {
            setErasing(true);
          }}
        />
      )}

      <Text style={[s.micro, { color: c.muted }]}>
        Stillpoint is not therapy or medical advice. You can stop a session at any time.
      </Text>
    </ScrollView>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: SPACE.md }}>
      <Text style={s.label}>{label}</Text>
      <Card style={{ gap: SPACE.lg }}>{children}</Card>
    </View>
  );
}

/** One of a set, with the chosen one marked. A radio, in the designs' shape. */
function Choice({
  label,
  detail,
  on,
  onPress,
}: {
  label: string;
  detail?: string;
  on: boolean;
  onPress: () => void;
}) {
  const { c, s } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      // `aria-checked` — see the note in `welcome/voice.tsx` for why it is
      // that and not `accessibilityState`. Nine radios on this screen, the
      // coach-sharing group among them, so the control that decides who may
      // read somebody's sessions never said which option was chosen.
      aria-checked={on}
      accessibilityLabel={label}
      onPress={onPress}
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
          borderRadius: RADIUS.pill,
          borderWidth: 2,
          borderColor: on ? c.accent : c.field,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: SPACE.xs }}>
        <Text style={s.body}>{label}</Text>
        {detail === undefined ? null : <Text style={s.caption}>{detail}</Text>}
      </View>
    </Pressable>
  );
}
