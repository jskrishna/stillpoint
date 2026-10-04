import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { STEP_COUNT, greeting, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry, type ApiSession, type Profile } from '../../api';
import { Button, Card, Waiting } from '../../ui';
import { useTheme } from '../../use-theme';
import { describeLoad } from '../../describe';

/** The app home: start a session, and the most recent entries. */
export default function Today() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState<ApiSession | null>(null);
  /**
   * Whether this screen could not find out, which is not the same as there
   * being nothing open — and the difference costs a session.
   */
  const [openUnknown, setOpenUnknown] = useState(false);
  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  /** The sentence, not a boolean: the reason is the server's. */
  const [failed, setFailed] = useState<string | null>(null);
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
        .then((current) => {
          setOpen(current);
          setOpenUnknown(false);
        })
        .catch(() => {
          // Not `setOpen(null)`. Null is this screen's word for "nothing is
          // open", which is the branch with no offer to resume and no warning
          // — and `POST /sessions` ends whatever *is* open as `user_stopped`.
          // So a dropped request turned the next tap into: the session they
          // were part-way through closed, and on a free plan one of three
          // spent to do it, with nothing on the screen having said so. A
          // failed read is not evidence that there is nothing to carry on
          // from. The web app had the same line and the same bug; the words
          // below are the same words, because two surfaces disagreeing about
          // what a session costs is the next failure after this one.
          setOpenUnknown(true);
        });

      void api
        .journal(3)
        .then((page) => {
          setEntries(page.items);
          setFailed(null);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.isUnauthenticated) {
            api.storeToken(null);
            router.replace('/welcome');
            return;
          }
          setFailed(describeLoad('your journal', e));
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

      {/*
        An untouched session is one nothing has been said into. There is
        nothing to carry on from, and starting hands that same session back
        rather than charging another one — so this is the ordinary branch, with
        no offer to resume and no warning about a cost that is not real.
      */}
      {open === null || open.untouched ? (
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
          {/*
            Never withheld: somebody who is upset is not told to come back when
            the signal is poor, which on a phone is most of the time this
            happens. What the failure changes is that the cost is stated rather
            than assumed away.
          */}
          {openUnknown ? (
            <Text style={s.caption}>
              Could not check whether you left a session open. Starting something new closes
              anything that is, and uses another full session.
            </Text>
          ) : null}
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
        <Text style={s.caption}>{failed}</Text>
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
