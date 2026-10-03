import { useCallback, useState, type ReactNode } from 'react';
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
  helplinesFor,
  relativeDay,
} from '@stillpoint/protocol';
import { ApiError, api, type ApiMyCoach, type Profile } from '../../api';
import { describe } from '../../describe';
import { NO_EAR_REASON } from '../../voice';
import { Button, Card, Tag, Waiting } from '../../ui';
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
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

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
        .then(setCoaches)
        .catch(() => {
          setCoaches([]);
        });
    }, [router]),
  );

  const change = async (changes: Parameters<typeof api.updateMe>[0]) => {
    try {
      setProfile(await api.updateMe(changes));
      setProblem(null);
    } catch (e: unknown) {
      setProblem(describe(e));
    }
  };

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
              .then(setCoaches)
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
          <Tag text={profile.plan === 'free' ? 'Free plan' : profile.plan} />
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
        {coaches.length === 0 ? (
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
          {helplines.map((h) => (
            <View key={h.number} style={{ gap: SPACE.xs }}>
              <Text style={s.body}>
                {h.name} · {h.number}
              </Text>
              <Text style={s.caption}>{h.detail}</Text>
            </View>
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

      <Text style={[s.micro, { color: c.muted }]}>
        Deleting your account takes your journal with it and cannot be undone. It is on the web for
        now, under Settings.
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
      accessibilityState={{ selected: on }}
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
