import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GOAL_LABEL, money } from '../../src/lib/format';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { Body, Button, Loading, Notice, Screen, Small, Title } from '../../src/ui/components';
import { color, space, type } from '../../src/ui/theme';

export default function Metas() {
  const { api } = useSession();
  const { data, error, loading, reload } = useAsync(async () => {
    const [me, goals] = await Promise.all([api.me(), api.goals()]);
    return { me, goals };
  }, [api]);
  useFocusEffect(useCallback(() => void reload(), [reload]));

  return (
    <Screen>
      <Title>Tus metas</Title>
      {loading && !data ? <Loading /> : null}
      {error ? <Notice tone="error">{error.message}</Notice> : null}
      {data && !data.me.has_snapshot ? (
        <View style={s.prompt}>
          <Body>Para saber qué tan cerca estás, necesitamos tus datos financieros básicos. Toma unos 3 minutos.</Body>
          <Button label="Completar mi perfil" onPress={() => router.push('/perfil')} />
        </View>
      ) : null}
      {data && data.goals.length === 0 ? (
        <Body muted>Aún no tienes metas. Empieza por la que más te importa: una tarjeta, un carro o tu casa.</Body>
      ) : null}
      {data?.goals.map((g) => {
        const level = g.readinessScore ?? 0;
        return (
          <Pressable
            testID={`meta-${g.type}`}
            key={g.id}
            accessibilityRole="link"
            accessibilityLabel={`${GOAL_LABEL[g.type]}, preparación ${g.readinessScore ?? 'sin calcular'}`}
            onPress={() => router.push(`/meta/${g.id}`)}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          >
            <View style={s.mini}>
              <View style={[s.miniWater, { height: `${level}%` }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{GOAL_LABEL[g.type]}</Text>
              <Small>
                Prioridad {g.priority}
                {g.targetAmount ? `, ${money(g.targetAmount)}` : ''}
              </Small>
            </View>
            <Text style={s.score}>{g.readinessScore == null ? '—' : Math.round(g.readinessScore)}</Text>
          </Pressable>
        );
      })}
      {data ? (
        <View style={{ marginTop: space.lg }}>
          <Button label="Agregar meta" kind={data.goals.length ? 'secondary' : 'primary'} onPress={() => router.push('/nueva-meta')} />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  prompt: { borderLeftWidth: 4, borderLeftColor: color.water, paddingLeft: space.md, marginBottom: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  mini: { width: 14, height: 44, borderWidth: 2, borderColor: color.lock, borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end' },
  miniWater: { backgroundColor: color.water, width: '100%' },
  name: { ...type.heading, color: color.lock },
  score: { ...type.title, color: color.lock, fontVariant: ['tabular-nums'] },
});
