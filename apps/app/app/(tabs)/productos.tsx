import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ApiRequestError } from '../../src/lib/api';
import { money, reasonText } from '../../src/lib/format';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { GoalPicker } from '../../src/ui/GoalPicker';
import { Body, Button, Loading, Notice, Screen, Small, Title } from '../../src/ui/components';
import { color, space, type } from '../../src/ui/theme';

export default function Productos() {
  const { api, goalId } = useSession();
  const goals = useAsync(() => api.goals(), [api]);
  useFocusEffect(useCallback(() => void goals.reload(), [goals.reload]));
  const rec = useAsync(async () => (goalId ? api.recommendations(goalId) : null), [api, goalId]);
  const needsProfile = rec.error instanceof ApiRequestError && rec.error.code === 'snapshot_required';

  return (
    <Screen>
      <Title>Mejores opciones</Title>
      {goals.data ? <GoalPicker goals={goals.data} /> : null}
      {goals.data && goals.data.length === 0 ? (
        <>
          <Body muted>Primero dinos qué quieres lograr y buscamos en el mercado por ti.</Body>
          <Button label="Agregar meta" onPress={() => router.push('/nueva-meta')} />
        </>
      ) : null}
      {rec.loading && goalId ? <Loading /> : null}
      {needsProfile ? (
        <>
          <Notice>{rec.error!.message}.</Notice>
          <Button label="Completar mi perfil" onPress={() => router.push('/perfil')} />
        </>
      ) : rec.error ? (
        <Notice tone="error">{rec.error.message}</Notice>
      ) : null}
      {rec.data ? (
        <>
          <Body muted>
            Revisamos {rec.data.consideredCount} productos y cumples los requisitos de {rec.data.eligibleCount}.
          </Body>
          {rec.data.notice ? <Notice>{rec.data.notice}</Notice> : null}
          {rec.data.top.length === 0 ? (
            <Body>Hoy no cumples los requisitos públicos de ningún producto. Tu plan del mes te dice qué cambiar.</Body>
          ) : null}
          {rec.data.top.map((p) => (
            <View key={p.productId} style={s.item}>
              <View style={s.head}>
                <Text style={s.pos} accessibilityLabel={`Opción ${p.position}`}>
                  {p.position}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.name}</Text>
                  <Small>{p.institutionName}</Small>
                </View>
                {p.estimatedMonthlyPayment != null ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.payment}>{money(p.estimatedMonthlyPayment)}</Text>
                    <Small>al mes, aprox.</Small>
                  </View>
                ) : null}
              </View>
              <Text style={s.why}>Por qué está aquí</Text>
              {p.reasons.map((r, i) => (
                <Body key={i}>• {reasonText(r)}</Body>
              ))}
              <View style={{ marginTop: space.sm }}>
                {p.assumptions.map((a, i) => (
                  <Small key={i}>{a}</Small>
                ))}
                <Text
                  accessibilityRole="link"
                  style={s.source}
                  onPress={() => void Linking.openURL(p.source.url)}
                >
                  Fuente del banco, revisada el {p.source.capturedAt}
                </Text>
              </View>
            </View>
          ))}
          {rec.data.top.length ? (
            <Small>
              Ningún banco paga por aparecer aquí ni por su posición. Confirma tasa y requisitos con el banco antes de aplicar: la
              aprobación siempre la decide el banco.
            </Small>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  item: { paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: color.line },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginBottom: space.sm },
  pos: { ...type.title, color: color.waterDeep, width: 28, fontVariant: ['tabular-nums'] },
  name: { ...type.heading, color: color.lock },
  payment: { ...type.heading, color: color.lock, fontVariant: ['tabular-nums'] },
  why: { ...type.small, fontWeight: '600', color: color.lock, marginTop: space.xs },
  source: { ...type.small, color: color.lockSoft, textDecorationLine: 'underline', marginTop: space.xs },
});
