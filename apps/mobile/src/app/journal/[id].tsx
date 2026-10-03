import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '@stillpoint/design-tokens';
import { duration, relativeDay } from '@stillpoint/protocol';
import { ApiError, api, type ApiJournalEntry } from '../../api';
import { describe } from '../../describe';
import { Button, Card, Field, Tag, Waiting } from '../../ui';
import { useTheme } from '../../use-theme';

/**
 * One session, as it was written down.
 *
 * The note and the sharing switch are the only things a user can change here,
 * and both are PATCHes whose reply replaces the entry — so what is on screen
 * is what the server holds.
 *
 * Sharing is a decision about *this* session. The account-wide setting decides
 * whether the app asks; it never shares anything by itself.
 */
export default function Entry() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [entry, setEntry] = useState<ApiJournalEntry | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (id === undefined) return;
    void api
      .journalEntry(id)
      .then((e) => {
        setEntry(e);
        setNote(e.note ?? '');
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          api.storeToken(null);
          router.replace('/welcome');
          return;
        }
        setProblem(describe(e));
      });
  }, [id, router]);

  const saveNote = async () => {
    if (entry === null) return;
    setSaving(true);
    try {
      const updated = await api.updateJournalEntry(entry.id, { note: note.trim() });
      setEntry(updated);
      setProblem(null);
    } catch (e: unknown) {
      setProblem(describe(e));
    } finally {
      setSaving(false);
    }
  };

  const setShared = async (shared: boolean) => {
    if (entry === null) return;
    try {
      setEntry(await api.updateJournalEntry(entry.id, { sharedWithCoach: shared }));
      setProblem(null);
    } catch (e: unknown) {
      setProblem(describe(e));
    }
  };

  const remove = () => {
    if (entry === null) return;
    Alert.alert(
      'Delete this entry?',
      'It is removed for good, and for your coach too if you shared it. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void api
              .deleteJournalEntry(entry.id)
              .then(() => {
                router.replace('/(tabs)/journal');
              })
              .catch((e: unknown) => {
                setProblem(describe(e));
              });
          },
        },
      ],
    );
  };

  if (entry === null) {
    return problem === null ? (
      <Waiting />
    ) : (
      <View style={s.centred}>
        <Text style={s.title}>Could not open this</Text>
        <Text style={s.lead}>{problem}</Text>
        <Button
          label="Back to the journal"
          onPress={() => {
            router.replace('/(tabs)/journal');
          }}
        />
      </View>
    );
  }

  const rows = [
    { label: 'What happened', value: entry.whatHappened },
    {
      label: 'What you felt',
      value: entry.feelings.length === 0 ? null : entry.feelings.join(', '),
    },
    {
      label: 'What it reminded you of',
      value:
        entry.memory === null
          ? null
          : entry.memory.age === undefined
            ? entry.memory.description
            : `${entry.memory.description} (around ${String(entry.memory.age)})`,
    },
    { label: 'Old belief', value: entry.belief === null ? null : `“${entry.belief}”` },
    { label: 'Forgiveness', value: entry.forgiveness },
  ].filter((r): r is { label: string; value: string } => r.value !== null && r.value !== '');

  const noteChanged = note.trim() !== (entry.note ?? '');

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE.lg,
        paddingBottom: insets.bottom + SPACE['3xl'],
        gap: SPACE.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
      >
        <Text style={s.link}>← Journal</Text>
      </Pressable>

      <Text style={s.title}>{entry.title}</Text>
      <Text style={s.caption}>
        {relativeDay(new Date(entry.occurredAt), now)} · {duration(entry.durationMinutes)}
        {entry.kind === 'quick' ? ' · Quick session' : ''}
      </Text>

      <View style={{ flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' }}>
        {entry.calmerRating === 'yes' ? <Tag text="Felt calmer" /> : null}
        {entry.calmerRating === 'a_little' ? <Tag text="A little calmer" /> : null}
        {entry.reachedFinalStep ? null : <Tag text="Stopped early" />}
      </View>

      {problem === null ? null : <Text style={s.error}>{problem}</Text>}

      {rows.map((row) => (
        <View key={row.label} style={{ gap: SPACE.xs }}>
          <Text style={s.label}>{row.label}</Text>
          <Text style={s.quote}>{row.value}</Text>
        </View>
      ))}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <Text style={s.body}>Share with my coach</Text>
            <Text style={s.caption}>
              Your coach can read a session only once you have shared it. You can stop at any time.
            </Text>
          </View>
          <Switch
            value={entry.sharedWithCoach}
            onValueChange={(v) => {
              void setShared(v);
            }}
            trackColor={{ true: c.accent, false: c.field }}
            thumbColor={c.panel}
            accessibilityLabel="Share this session with my coach"
          />
        </View>
      </Card>

      <Field
        label="A note to yourself"
        value={note}
        onChange={setNote}
        placeholder="Anything you want to remember about this."
        multiline
      />

      {noteChanged ? (
        <Button
          label="Save the note"
          busy={saving}
          onPress={() => {
            void saveNote();
          }}
        />
      ) : null}

      <Button label="Delete this entry" tone="quiet" onPress={remove} />
    </ScrollView>
  );
}
