import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ApiRequestError, type PlanView } from '../../src/lib/api';
import { GOAL_LABEL, monthLabel, weekLabel } from '../../src/lib/format';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { GoalPicker } from '../../src/ui/GoalPicker';
import { Body, Button, Check, Heading, Loading, Notice, Screen, Small, Title } from '../../src/ui/components';
import { space } from '../../src/ui/theme';

export default function Plan() {
  const { api, goalId } = useSession();
  const goals = useAsync(() => api.goals(), [api]);
  useFocusEffect(useCallback(() => void goals.reload(), [goals.reload]));
  const plan = useAsync(async () => (goalId ? api.plan(goalId) : null), [api, goalId]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  const goal = goals.data?.find((g) => g.id === goalId);

  async function create() {
    if (!goalId) return;
    setCreating(true);
    setCreateError(null);
    try {
      plan.setData(await api.createPlan(goalId));
    } catch (e) {
      setCreateError(e as Error);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(a: PlanView['actions'][number]) {
    const next = a.status === 'done' ? 'pending' : 'done';
    const current = plan.data;
    if (!current) return;
    plan.setData({ ...current, actions: current.actions.map((x) => (x.id === a.id ? { ...x, status: next } : x)) });
    try {
      await api.setAction(a.id, next);
    } catch {
      plan.setData(current); // revierte si falla
    }
  }

  const done = plan.data?.actions.filter((a) => a.status === 'done').length ?? 0;

  return (
    <Screen>
      <Title>Tu plan</Title>
      {goals.data ? <GoalPicker goals={goals.data} /> : null}
      {goals.data && goals.data.length === 0 ? (
        <>
          <Body muted>Tu plan sale de tus metas. Crea una para empezar.</Body>
          <Button label="Agregar meta" onPress={() => router.push('/nueva-meta')} />
        </>
      ) : null}
      {plan.loading && goalId ? <Loading /> : null}
      {plan.error ? <Notice tone="error">{plan.error.message}</Notice> : null}
      {goal && plan.data === null && !plan.loading ? (
        <>
          <Body muted>
            Armamos un plan para {GOAL_LABEL[goal.type].toLowerCase()} a partir de lo que hoy te frena: un objetivo para el mes y
            pocas acciones concretas para esta semana.
          </Body>
          <Button label="Crear mi plan del mes" onPress={create} busy={creating} />
          {createError instanceof ApiRequestError && createError.code === 'snapshot_required' ? (
            <>
              <Notice>{createError.message}.</Notice>
              <Button label="Completar mi perfil" kind="secondary" onPress={() => router.push('/perfil')} />
            </>
          ) : createError ? (
            <Notice tone="error">{createError.message}</Notice>
          ) : null}
        </>
      ) : null}
      {plan.data ? (
        <>
          <Small>Objetivo de {monthLabel(plan.data.month)}</Small>
          <Heading>{plan.data.objective}</Heading>
          <View style={{ marginTop: space.lg }}>
            <Small>
              {plan.data.actions[0] ? `Esta ${weekLabel(plan.data.actions[0].weekStart)}` : 'Esta semana'}: {done} de{' '}
              {plan.data.actions.length} hechas
            </Small>
            {plan.data.actions.map((a) => (
              <Check key={a.id} label={a.title} checked={a.status === 'done'} onToggle={() => void toggle(a)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
