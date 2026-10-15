import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { FactorId } from '@fg/engine';
import { ApiRequestError } from '../../src/lib/api';
import { FACTOR_LABEL, GOAL_LABEL, levelLabel, money, obstacleDetail } from '../../src/lib/format';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { Body, Button, Divider, Heading, Loading, LockLevel, Notice, Screen, Small, Title } from '../../src/ui/components';
import { color, space, type } from '../../src/ui/theme';

const READY_AT = 70;

export default function Meta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, setGoalId } = useSession();
  const { data, error, loading } = useAsync(async () => {
    const [goal, readiness] = await Promise.all([api.goal(id!), api.readiness(id!)]);
    return { goal, readiness };
  }, [api, id]);

  const needsProfile = error instanceof ApiRequestError && error.code === 'snapshot_required';
  const go = (path: '/plan' | '/productos') => {
    setGoalId(id!);
    router.push(path);
  };

  return (
    <Screen underHeader>
      {loading ? <Loading /> : null}
      {needsProfile ? (
        <>
          <Title>Primero, tu perfil</Title>
          <Body muted>Para calcular qué tan cerca estás necesitamos tus ingresos y deudas.</Body>
          <Button label="Completar mi perfil" onPress={() => router.push('/perfil')} />
        </>
      ) : error ? (
        <Notice tone="error">{error.message}</Notice>
      ) : null}
      {data ? (
        <>
          <Title>{GOAL_LABEL[data.goal.type]}</Title>
          {data.goal.targetAmount ? (
            <Small>
              Meta de {money(data.goal.targetAmount)}
              {data.goal.desiredTermMonths ? ` a ${data.goal.desiredTermMonths} meses` : ''}
            </Small>
          ) : null}
          <LockLevel
            score={data.readiness.score}
            threshold={READY_AT}
            label={levelLabel(data.readiness.score, data.readiness.readyToCompare)}
          />
          <View style={{ gap: space.sm }}>
            <Button label="Ver las mejores opciones" kind={data.readiness.readyToCompare ? 'primary' : 'secondary'} onPress={() => go('/productos')} />
            <Button label="Ver mi plan del mes" kind={data.readiness.readyToCompare ? 'secondary' : 'primary'} onPress={() => go('/plan')} />
          </View>
          <Divider />
          <Heading>{data.readiness.obstacles.length ? 'Lo que te frena' : 'Nada te frena por ahora'}</Heading>
          {data.readiness.obstacles.map((o) => (
            <View key={o.factor} style={s.obstacle}>
              <View style={s.obstacleHead}>
                <Text style={s.factor}>{FACTOR_LABEL[o.factor as FactorId]}</Text>
                <Text style={[s.impact, o.blocking && { color: color.error }]}>
                  {o.blocking ? 'Bloquea' : `+${Math.round(o.impactPoints)} pts`}
                </Text>
              </View>
              <Body muted>{obstacleDetail(o.factor as FactorId, o.evidence)}</Body>
            </View>
          ))}
          <Divider />
          <Small>
            Este índice es nuestro, no es tu puntaje de la APC. Calculado con tus datos del {data.readiness.snapshotDate.slice(0, 10)}.
          </Small>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  obstacle: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.line },
  obstacleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.xs },
  factor: { ...type.heading, color: color.lock },
  impact: { ...type.small, fontWeight: '700', color: color.waterDeep, fontVariant: ['tabular-nums'] },
});
