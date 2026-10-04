import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { duration, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry } from '../../api';
import { Button, Card, Tag } from '../../ui';
import { useTheme } from '../../use-theme';

/** How many entries a page holds. */
const PAGE = 20;

/**
 * Every finished session.
 *
 * Paged, with a cursor from the server: the journal grows at the top, and an
 * offset page would repeat or skip a row when a session finished between two
 * requests.
 *
 * A session that ended for safety is not here, and that is not a filter on
 * this screen — the server never wrote a row for it.
 */
export default function Journal() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [entries, setEntries] = useState<readonly ApiJournalEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      void api
        .journal(PAGE)
        .then((page) => {
          setEntries(page.items);
          setCursor(page.nextCursor);
          setTotal(page.total);
          setProblem(null);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.isUnauthenticated) {
            api.storeToken(null);
            router.replace('/welcome');
            return;
          }
          setProblem('Could not load your journal. Check your connection.');
        });
    }, [router]),
  );

  const loadMore = async () => {
    if (cursor === null || more) return;
    setMore(true);
    try {
      const page = await api.journal(PAGE, cursor);
      setEntries((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch {
      setProblem('Could not load more. Check your connection.');
    } finally {
      setMore(false);
    }
  };

  const list = entries ?? [];

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
      <Text style={s.title}>Your journal</Text>
      <Text style={s.caption}>
        {/*
          A failed read is not a slow one. `entries` stays null when the
          request fails, so this said "Loading…" next to the error message for
          as long as the screen was open — a small thing to say that is not
          true, on a screen that already says the true thing underneath.
        */}
        {entries === null
          ? problem === null
            ? 'Loading…'
            : 'Not loaded'
          : `${String(total)} ${total === 1 ? 'session' : 'sessions'}, newest first`}
      </Text>

      {problem === null ? null : <Text style={s.error}>{problem}</Text>}

      {entries !== null && list.length === 0 ? (
        <Text style={s.lead}>
          Nothing here yet. When you finish a session it is written down for you, in your own words.
        </Text>
      ) : null}

      {now === null
        ? null
        : list.map((entry) => (
            <Card
              key={entry.id}
              onPress={() => {
                router.push(`/journal/${entry.id}`);
              }}
            >
              <Text style={s.quote}>{entry.title}</Text>
              <Text style={s.caption}>
                {relativeDay(new Date(entry.occurredAt), now)} · {duration(entry.durationMinutes)}
                {entry.kind === 'quick' ? ' · Quick' : ''}
              </Text>
              {entry.summary === '' ? null : (
                <Text style={s.small} numberOfLines={2}>
                  {entry.summary}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
                {entry.calmerRating === 'yes' ? <Tag text="Felt calmer" /> : null}
                {entry.sharedWithCoach ? <Tag text="Shared with coach" /> : null}
                {entry.reachedFinalStep ? null : <Tag text="Stopped early" />}
              </View>
            </Card>
          ))}

      {cursor === null ? null : (
        <Button
          label={more ? 'Loading…' : `Load more (${String(list.length)} of ${String(total)})`}
          tone="secondary"
          busy={more}
          onPress={() => {
            void loadMore();
          }}
        />
      )}

      <Text style={[s.micro, { color: c.muted }]}>
        A session that ended because you might not have been safe is not written down.
      </Text>
    </ScrollView>
  );
}
