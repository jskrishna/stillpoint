import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEELING_SWATCHES, RADIUS, SPACE, TEXT } from '@stillpoint/design-tokens';
import { DEFAULT_WINDOW_DAYS } from '@stillpoint/protocol';
import { ApiError, api, type ApiInsights } from '../../api';
import { FAMILY } from '../../theme';
import { Card } from '../../ui';
import { useTheme } from '../../use-theme';
import { describeLoad } from '../../describe';

// The server sends feeling ids as plain strings; the colour for one is
// presentation, and lives in the tokens.
const COLOR = new Map<string, string>(FEELING_SWATCHES.map((sw) => [sw.id, sw.color]));

/**
 * What the app has noticed, computed by the server.
 *
 * The aggregation runs in PHP over the user's own window because the columns it
 * reads are encrypted and cannot be grouped in SQL. It is not repeated here:
 * two answers to "the belief that comes back" is one too many.
 */
export default function Insights() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [result, setResult] = useState<ApiInsights | null>(null);
  /** The sentence, not a boolean: the reason is the server's. */
  const [failed, setFailed] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void api
        .insights()
        .then((r) => {
          setResult(r);
          setFailed(null);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.isUnauthenticated) {
            api.storeToken(null);
            router.replace('/welcome');
            return;
          }
          setFailed(describeLoad('this', e));
        });
    }, [router]),
  );

  const pad = {
    padding: SPACE.xl,
    paddingTop: insets.top + SPACE.xl,
    paddingBottom: SPACE['3xl'],
    gap: SPACE.lg,
  };

  if (failed) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={pad}>
        <Text style={s.title}>Noticing</Text>
        <Text style={s.error}>{failed}</Text>
      </ScrollView>
    );
  }

  if (result === null || result.sessions === 0) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={pad}>
        <Text style={s.title}>Noticing</Text>
        <Text style={s.caption}>Last {result?.windowDays ?? DEFAULT_WINDOW_DAYS} days</Text>
        <Text style={s.lead}>
          {result === null
            ? 'Loading…'
            : 'Nothing to show yet. This fills in once you have finished a session.'}
        </Text>
      </ScrollView>
    );
  }

  const top = result.feelings[0]?.count ?? 1;

  return (
    <ScrollView style={s.screen} contentContainerStyle={pad}>
      <Text style={s.title}>Noticing</Text>
      <Text style={s.caption}>Last {result.windowDays} days</Text>

      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <Stat value={result.sessions} label="sessions" />
        <Stat value={result.feltCalmer} label="felt calmer" />
        <Stat value={result.reachedFinalStep} label="reached step 6" />
      </View>

      {result.feelings.length === 0 ? null : (
        <>
          <Text style={s.label}>Feelings you chose most</Text>
          <View style={{ gap: SPACE.md }}>
            {result.feelings.map((f) => {
              // A number, not a string, so the percentage types as React
              // Native's `DimensionValue` rather than as any old string.
              const width = Math.round((f.count / top) * 100);
              return (
                <View key={f.id} style={{ gap: SPACE.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.body}>{f.label}</Text>
                    <Text style={s.caption}>{f.count}</Text>
                  </View>
                  <View
                    style={{
                      height: SPACE.sm,
                      borderRadius: RADIUS.pill,
                      backgroundColor: c.line,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${width}%`,
                        height: '100%',
                        borderRadius: RADIUS.pill,
                        backgroundColor: COLOR.get(f.id) ?? c.accent,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {result.recurringBelief === null ? null : (
        <>
          <Text style={s.label}>Belief that comes back</Text>
          <Card>
            <Text style={s.quote}>“{result.recurringBelief.belief}”</Text>
            <Text style={s.caption}>
              In {result.recurringBelief.sessions}{' '}
              {result.recurringBelief.sessions === 1 ? 'session' : 'sessions'}.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const { s } = useTheme();
  return (
    <Card style={{ flex: 1, padding: SPACE.lg, gap: SPACE.xs, alignItems: 'flex-start' }}>
      <Text style={{ fontFamily: FAMILY.display, fontSize: TEXT.heading, color: s.title.color }}>
        {value}
      </Text>
      <Text style={s.micro}>{label}</Text>
    </Card>
  );
}
