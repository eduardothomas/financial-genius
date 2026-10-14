import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, maxWidth, radius, space, type } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenInner} keyboardShouldPersistTaps="handled">
      <View style={s.column}>{children}</View>
    </ScrollView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" style={s.title}>
    {children}
  </Text>
);
export const Heading = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" style={s.heading}>
    {children}
  </Text>
);
export const Body = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text style={[s.body, muted && { color: color.muted }]}>{children}</Text>
);
export const Small = ({ children, muted = true }: { children: ReactNode; muted?: boolean }) => (
  <Text style={[s.small, muted && { color: color.muted }]}>{children}</Text>
);

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={off ? undefined : onPress}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        s.btn,
        s[`btn_${kind}`],
        off && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
        focused && s.focus,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? '#fff' : color.lock} />
      ) : (
        <Text style={[s.btnText, s[`btnText_${kind}`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8A9A9C"
        style={[s.input, error ? { borderColor: color.error } : null]}
        {...input}
      />
      {error ? <Text style={[s.small, { color: color.error }]}>{error}</Text> : hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.choices} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              style={[s.choice, on && s.choiceOn]}
            >
              <Text style={[s.small, { color: on ? '#fff' : color.lock, fontWeight: on ? '600' : '400' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Check({ label, checked, onToggle, detail }: { label: string; checked: boolean; onToggle: () => void; detail?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={s.checkRow}>
      <View style={[s.box, checked && s.boxOn]}>{checked ? <Text style={s.tick}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.body, checked && { color: color.muted, textDecorationLine: 'line-through' }]}>{label}</Text>
        {detail ? <Small>{detail}</Small> : null}
      </View>
    </Pressable>
  );
}

/**
 * Nivel de la esclusa: el agua sube con el índice de preparación (0–100).
 * La línea marca dónde empieza "listo para comparar".
 */
export function LockLevel({ score, threshold, label }: { score: number; threshold: number; label: string }) {
  const level = Math.max(0, Math.min(100, score));
  return (
    <View
      style={s.lockRow}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Preparación ${Math.round(level)} de 100. ${label}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(level) }}
    >
      <View style={s.lock}>
        <View style={[s.water, { height: `${level}%` }]} />
        <View style={[s.threshold, { bottom: `${threshold}%` }]} />
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Text style={s.display}>{Math.round(level)}</Text>
        <Text style={s.heading}>{label}</Text>
        <Small>La línea marca {threshold}: desde ahí te mostramos dónde aplicar.</Small>
      </View>
    </View>
  );
}

export const Loading = () => (
  <View style={{ paddingVertical: space.xxl }}>
    <ActivityIndicator color={color.lock} />
  </View>
);

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'error' }) {
  return (
    <View style={[s.notice, tone === 'error' ? { backgroundColor: color.errorBg } : { backgroundColor: color.warnBg }]}>
      <Text style={[s.small, { color: tone === 'error' ? color.error : color.warn }]}>{children}</Text>
    </View>
  );
}

export const Divider = () => <View style={{ height: 1, backgroundColor: color.line, marginVertical: space.lg }} />;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  screenInner: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: 64 },
  column: { width: '100%', maxWidth, alignSelf: 'center' },
  display: { ...type.display, color: color.lock, fontVariant: ['tabular-nums'] },
  title: { ...type.title, color: color.lock, marginBottom: space.sm },
  heading: { ...type.heading, color: color.lock },
  body: { ...type.body, color: color.lock },
  small: { ...type.small },
  label: { ...type.small, fontWeight: '600', color: color.lock, marginBottom: space.xs },
  input: {
    ...type.body,
    color: color.lock,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    marginBottom: space.xs,
  },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  btn_primary: { backgroundColor: color.lock },
  btn_secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: color.lock },
  btn_quiet: { backgroundColor: 'transparent', minHeight: 40, paddingHorizontal: 0, alignItems: 'flex-start' },
  btn_danger: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: color.error },
  btnText: { ...type.body, fontWeight: '600' },
  btnText_primary: { color: '#fff' },
  btnText_secondary: { color: color.lock },
  btnText_quiet: { color: color.lockSoft, textDecorationLine: 'underline' },
  btnText_danger: { color: color.error },
  focus: { outlineColor: color.water, outlineWidth: 3, outlineStyle: 'solid' } as object,
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: color.lockSoft, backgroundColor: color.surface },
  choiceOn: { backgroundColor: color.lock, borderColor: color.lock },
  checkRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'flex-start' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: color.lock, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: color.good, borderColor: color.good },
  tick: { color: '#fff', fontWeight: '700', fontSize: 14, lineHeight: 16 },
  lockRow: { flexDirection: 'row', gap: space.xl, alignItems: 'stretch', marginVertical: space.lg },
  lock: {
    width: 76,
    height: 168,
    borderRadius: radius.sm,
    borderWidth: 3,
    borderColor: color.lock,
    backgroundColor: color.surface,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  water: { backgroundColor: color.water, width: '100%', borderTopWidth: 3, borderTopColor: color.waterDeep },
  threshold: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: color.lock },
  notice: { borderRadius: radius.sm, padding: space.md, marginVertical: space.sm },
});
