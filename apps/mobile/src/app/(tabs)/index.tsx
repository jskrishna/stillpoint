import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { STEP_COUNT, greeting, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry, type ApiSession, type Profile } from '../../api';
import { Button, Card, Waiting } from '../../ui';
import { useTheme } from '../../use-theme';

/** The app home: start a session, and the most recent entries. */
export default function Today() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState<ApiSession | null>(null);
  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  // On focus rather than on mount: finishing a session comes back to this
  // screen, and a stale allowance or a session that has just ended would be
  // the first thing someone saw.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());

      if (!api.hasToken()) {
        router.replace('/welcome');
        return;
      }

      // The allowance, so the screen can say what is left before anyone starts
      // a session and is refused.
      void api
        .me()
        .then(setProfile)
        .catch(() => {
          setProfile(null);
        });

      // A session someone is in the middle of. Offered rather than replaced:
      // starting a new one ends it, and on a free plan that is the difference
      // between spending one of three and spending two.
      void api
        .currentSession()
        .then(setOpen)
        .catch(() => {
          setOpen(null);
        });

      void api
        .journal(3)
        .then((page) => {
          setEntries(page.items);
          setFailed(false);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.isUnauthenticated) {
            api.storeToken(null);
            router.replace('/welcome');
            return;
          }
          setFailed(true);
        });
    }, [router]),
  );

  if (now === null) return <Waiting />;

  const left = profile?.fullSessionsLeft ?? null;
  const perWeek = profile?.fullSessionsPerWeek ?? 0;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE.xl,
        paddingBottom: SPACE['3xl'],
        gap: SPACE.lg,
      }}
    >
      <Text style={s.label}>{greeting(now, profile?.name)}</Text>
      <Text style={s.title}>Something bothering you?</Text>
      <Text style={s.lead}>
        Talk it through in {STEP_COUNT} simple steps. It takes about 10–15 minutes.
      </Text>

      {open === null ? (
        <>
          <Button
            label="Start talking"
            onPress={() => {
              router.push('/session');
            }}
          />
          <Button
            label="Or a quick session"
            tone="quiet"
            onPress={() => {
              router.push('/session?kind=quick');
            }}
          />
        </>
      ) : (
        <>
          <Button
            label="Carry on where you left off"
            onPress={() => {
              router.push('/session?resume=1');
            }}
          />
          <Text style={s.caption}>
            You were on step {open.step?.ordinal ?? 1} of {open.stepCount}
            {open.step === null ? '' : ` · ${open.step.name}`}.
          </Text>
          <Button
            label="Or start something new"
            tone="quiet"
            onPress={() => {
              router.push('/session');
            }}
          />
          <Text style={s.caption}>
            Starting something new closes the one you left, and uses another full session.
          </Text>
        </>
      )}

      {left === null ? null : (
        <Text style={s.caption}>
          {left === 0
            ? 'No full sessions left this week. Quick sessions are always available.'
            : `${String(left)} of ${String(perWeek)} full ${
                left === 1 ? 'session' : 'sessions'
              } left this week. Quick sessions are unlimited.`}
        </Text>
      )}

      <Text style={[s.label, { marginTop: SPACE.md }]}>Recent</Text>

      {failed ? (
        <Text style={s.caption}>Could not load your journal. Check your connection.</Text>
      ) : entries === null ? (
        <Text style={s.caption}>Loading…</Text>
      ) : entries.length === 0 ? (
        <Text style={s.caption}>Nothing yet. Your finished sessions will appear here.</Text>
      ) : (
        entries.map((entry) => (
          <Card
            key={entry.id}
            onPress={() => {
              router.push(`/journal/${entry.id}`);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <View style={{ flex: 1, gap: SPACE.xs }}>
                <Text style={s.quote}>{entry.title}</Text>
                <Text style={s.caption}>
                  {relativeDay(new Date(entry.occurredAt), now)}
                  {entry.calmerRating === 'yes' ? ' · Felt calmer' : ''}
                </Text>
              </View>
              <Text style={{ color: c.muted, fontSize: 22 }}>›</Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
