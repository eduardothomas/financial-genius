import type { GoalType } from '@fg/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GOAL_HINT, GOAL_LABEL, parseAmount } from '../src/lib/format';
import { useSession } from '../src/lib/session';
import { useAsync } from '../src/lib/useAsync';
import { Body, Button, Check, Choice, Field, Notice, Screen, Small } from '../src/ui/components';
import { space } from '../src/ui/theme';

const PREFS = [
  { value: 'cashback', label: 'Reembolso en efectivo' },
  { value: 'miles', label: 'Millas' },
  { value: 'points', label: 'Puntos' },
  { value: 'secured', label: 'Tarjeta asegurada (sin historial)' },
];

export default function NuevaMeta() {
  const { api, setGoalId } = useSession();
  const goals = useAsync(() => api.goals(), [api]);
  const [goalType, setGoalType] = useState<GoalType>('credit_card');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('');
  const [prefs, setPrefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoan = goalType !== 'credit_card';
  const amountN = parseAmount(amount);
  const termN = term.trim() ? Number(term) : null;
  const amountError = isLoan && amount && amountN === null ? 'Escribe un monto, por ejemplo 25,000' : undefined;
  const termError = term && (!Number.isInteger(termN) || termN! < 1 || termN! > 480) ? 'Entre 1 y 480 meses' : undefined;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const priority = (goals.data?.length ?? 0) + 1;
      const g = await api.createGoal({
        type: goalType,
        priority: Math.min(priority, 10),
        targetAmount: isLoan && amountN ? amountN : undefined,
        desiredTermMonths: isLoan && termN ? termN : undefined,
        preferences: goalType === 'credit_card' ? prefs : [],
      });
      setGoalId(g.id);
      router.replace(`/meta/${g.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Choice
        label="¿Qué quieres lograr?"
        value={goalType}
        options={(['credit_card', 'auto_loan', 'mortgage'] as const).map((t) => ({ value: t, label: GOAL_LABEL[t] }))}
        onChange={setGoalType}
      />
      <Body muted>{GOAL_HINT[goalType]}.</Body>
      <View style={{ marginTop: space.lg }}>
        {isLoan ? (
          <>
            <Field
              label={goalType === 'mortgage' ? 'Precio de la casa' : 'Precio del carro'}
              hint="Aproximado. Lo usamos para calcular tu cuota y el abono."
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={goalType === 'mortgage' ? '150,000' : '25,000'}
              error={amountError}
            />
            <Field
              label="Plazo en meses (opcional)"
              value={term}
              onChangeText={setTerm}
              keyboardType="number-pad"
              placeholder={goalType === 'mortgage' ? '360' : '72'}
              error={termError}
            />
          </>
        ) : (
          <>
            <Small>¿Qué te importa en una tarjeta? (opcional)</Small>
            {PREFS.map((p) => (
              <Check
                key={p.value}
                label={p.label}
                checked={prefs.includes(p.value)}
                onToggle={() => setPrefs((xs) => (xs.includes(p.value) ? xs.filter((x) => x !== p.value) : [...xs, p.value]))}
              />
            ))}
          </>
        )}
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button label="Guardar meta" onPress={save} busy={busy} disabled={!!amountError || !!termError} />
    </Screen>
  );
}
