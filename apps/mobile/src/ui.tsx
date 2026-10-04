/**
 * The handful of controls every screen is built from.
 *
 * Deliberately small, and deliberately not a component library: each of these
 * exists because a Warm & Clear screen uses it, and each takes its colour,
 * radius and height from the tokens rather than from a prop.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { CONTROL, RADIUS, SPACE, TEXT } from '@stillpoint/design-tokens';
import { FAMILY, cardShadow, leading } from './theme';
import { useTheme } from './use-theme';

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  busy = false,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();

  const fill =
    tone === 'primary'
      ? c.accent
      : tone === 'danger'
        ? c.danger
        : tone === 'secondary'
          ? c.panel
          : 'transparent';
  const ink =
    tone === 'primary'
      ? c.accentInk
      : tone === 'danger'
        ? c.dangerInk
        : tone === 'secondary'
          ? c.ink
          : c.accentText;

  const off = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      accessibilityLabel={label}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: tone === 'quiet' ? CONTROL.standard : CONTROL.primary,
          borderRadius: RADIUS.button,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACE.xl,
          borderWidth: tone === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: c.field,
          // Pressed and disabled are both opacity rather than a second colour:
          // the palette has one accent, and tinting it would invent a value.
          opacity: off ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Text
          style={{ fontFamily: FAMILY.uiSemibold, fontSize: TEXT.control, color: ink }}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  multiline = false,
  autoFocus = false,
  keyboard = 'default',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  autoFocus?: boolean;
  keyboard?: 'default' | 'email-address';
  /**
   * The autofill hint, and **`'password'` is deliberately not one of the
   * options.**
   *
   * React Native's own types list `current-password` and `new-password` under
   * "work across platforms" and `password` under "Android only", so
   * `autoComplete="password"` was a hint iOS drops: somebody with the account's
   * password in iCloud Keychain was offered nothing on the screen that asks for
   * it, on a product whose rule is twelve characters — which is exactly the
   * length people keep in a manager rather than in their head. The web app has
   * said `current-password` all along, so the two surfaces disagreed about one
   * field.
   *
   * It is narrowed here rather than corrected at the two call sites because the
   * value that works everywhere and the value that is Android-only differ by a
   * word, and the wrong one fails silently on the platform nobody here can
   * test on.
   */
  autoComplete?: 'email' | 'current-password' | 'new-password' | 'name';
}) {
  const { c, s } = useTheme();

  return (
    <View style={{ gap: SPACE.sm }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={secure}
        multiline={multiline}
        autoFocus={autoFocus}
        keyboardType={keyboard}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboard !== 'email-address'}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? 120 : CONTROL.standard,
          borderRadius: RADIUS.field,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.field,
          backgroundColor: c.panel,
          color: c.ink,
          paddingHorizontal: SPACE.lg,
          paddingTop: multiline ? SPACE.md : 0,
          paddingBottom: multiline ? SPACE.md : 0,
          fontFamily: multiline ? FAMILY.display : FAMILY.ui,
          fontSize: TEXT.body,
          lineHeight: multiline ? leading(TEXT.body) : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { c, scheme } = useTheme();

  const look: StyleProp<ViewStyle> = [
    {
      backgroundColor: c.panel,
      borderRadius: RADIUS.card,
      padding: SPACE.xl,
      gap: SPACE.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
    cardShadow(scheme),
    style,
  ];

  if (onPress === undefined) return <View style={look}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [look, { opacity: pressed ? 0.85 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/** A tag. `tone` 'danger' is for safety and nothing else. */
export function Tag({ text, tone = 'accent' }: { text: string; tone?: 'accent' | 'danger' }) {
  const { c } = useTheme();

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tone === 'danger' ? c.dangerWash : c.accentWash,
        borderRadius: RADIUS.pill,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.xs,
      }}
    >
      <Text
        style={{
          fontFamily: FAMILY.uiMedium,
          fontSize: TEXT.micro,
          color: tone === 'danger' ? c.danger : c.accentText,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

/** What a screen shows while it is waiting for its first answer. */
export function Waiting({ what = 'One moment…' }: { what?: string }) {
  const { c, s } = useTheme();
  return (
    <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', gap: SPACE.lg }]}>
      <ActivityIndicator color={c.accent} />
      <Text style={s.caption}>{what}</Text>
    </View>
  );
}

/** A screen that could not load, said plainly and with a way out. */
export function Problem({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; onPress: () => void };
}) {
  const { s } = useTheme();
  return (
    <View style={s.centred}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.lead}>{detail}</Text>
      {action === undefined ? null : <Button label={action.label} onPress={action.onPress} />}
    </View>
  );
}
