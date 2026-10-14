import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { emptyForm, formFromSnapshot, formToSnapshot, type DebtForm, type ProfileForm } from '../../src/lib/profileForm';
import { useSession } from '../../src/lib/session';
import { useAsync } from '../../src/lib/useAsync';
import { Body, Button, Check, Choice, Divider, Field, Heading, Loading, Notice, Screen, Small, Title } from '../../src/ui/components';
import { color, space, type } from '../../src/ui/theme';

const DEBT_KINDS: Array<{ value: DebtForm['kind']; label: string }> = [
  { value: 'credit_card', label: 'Tarjeta' },
  { value: 'personal_loan', label: 'Préstamo personal' },
  { value: 'auto_loan', label: 'Auto' },
  { value: 'mortgage', label: 'Hipoteca' },
  { value: 'other', label: 'Otra' },
];

export default function Perfil() {
  const { api, email, signOut } = useSession();
  const existing = useAsync(() => api.snapshot(), [api]);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) setForm(formFromSnapshot(existing.data.snapshot));
  }, [existing.data]);

  const set = <K extends keyof ProfileForm>(k: K) => (v: ProfileForm[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const setDebt = (i: number, patch: Partial<DebtForm>) =>
    setForm((f) => ({ ...f, debts: f.debts.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  async function save() {
    const r = formToSnapshot(form);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setSaveError(null);
    try {
      await api.saveSnapshot(r.value);
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (existing.loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Title>Tu perfil financiero</Title>
      <Body muted>Con esto calculamos qué tan cerca estás de cada meta. Cada vez que guardas, recalculamos.</Body>

      <Heading>Ingresos y trabajo</Heading>
      <View style={{ marginTop: space.md }}>
        <Field label="Ingreso neto mensual" hint="Lo que te llega después de descuentos" value={form.netMonthlyIncome}
          onChangeText={set('netMonthlyIncome')} keyboardType="decimal-pad" placeholder="1,500" error={errors.netMonthlyIncome} />
        <Choice label="Tipo de empleo" value={form.employmentType} onChange={set('employmentType')} options={[
          { value: 'salaried', label: 'Asalariado' }, { value: 'self_employed', label: 'Independiente' },
          { value: 'informal', label: 'Informal' }, { value: 'retired', label: 'Jubilado' }]} />
        <Field label="Meses en tu empleo actual" value={form.employmentMonths} onChangeText={set('employmentMonths')}
          keyboardType="number-pad" placeholder="18" error={errors.employmentMonths} />
        <Field label="Gastos fijos mensuales" hint="Alquiler, servicios, colegios. Sin contar deudas." value={form.fixedMonthlyExpenses}
          onChangeText={set('fixedMonthlyExpenses')} keyboardType="decimal-pad" placeholder="600" error={errors.fixedMonthlyExpenses} />
        <View style={s.pair}>
          <View style={{ flex: 1 }}>
            <Field label="Edad" value={form.age} onChangeText={set('age')} keyboardType="number-pad" placeholder="30" error={errors.age} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Dependientes" value={form.dependents} onChangeText={set('dependents')} keyboardType="number-pad" error={errors.dependents} />
          </View>
        </View>
        <Choice label="Residencia" value={form.residency} onChange={set('residency')} options={[
          { value: 'national', label: 'Panameño' }, { value: 'resident', label: 'Residente' }, { value: 'foreign', label: 'Extranjero' }]} />
      </View>

      <Divider />
      <Heading>Historial y ahorro</Heading>
      <View style={{ marginTop: space.md }}>
        <Choice label="¿Cómo está tu historial de crédito (APC)?" value={form.apcSelfReported} onChange={set('apcSelfReported')} options={[
          { value: 'good', label: 'Bueno' }, { value: 'fair', label: 'Algún atraso' }, { value: 'poor', label: 'Con problemas' },
          { value: 'none', label: 'No tengo' }, { value: 'unknown', label: 'No sé' }]} />
        <Field label="Ahorro para abono" hint="Si tu meta es un carro o una casa" value={form.savingsForDownPayment}
          onChangeText={set('savingsForDownPayment')} keyboardType="decimal-pad" placeholder="0" error={errors.savingsForDownPayment} />
      </View>

      <Divider />
      <Heading>Tus deudas</Heading>
      <Small>Incluye tarjetas aunque las pagues completas cada mes.</Small>
      {form.debts.map((d, i) => (
        <View key={i} style={s.debt}>
          <Choice label={`Deuda ${i + 1}`} value={d.kind} onChange={(kind) => setDebt(i, { kind })} options={DEBT_KINDS} />
          <View style={s.pair}>
            <View style={{ flex: 1 }}>
              <Field label="Saldo" value={d.balance} onChangeText={(v) => setDebt(i, { balance: v })} keyboardType="decimal-pad" error={errors[`debts.${i}.balance`]} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Pago mensual" value={d.monthlyPayment} onChangeText={(v) => setDebt(i, { monthlyPayment: v })} keyboardType="decimal-pad" error={errors[`debts.${i}.monthlyPayment`]} />
            </View>
          </View>
          {d.kind === 'credit_card' ? (
            <Field label="Límite de la tarjeta" value={d.limit} onChangeText={(v) => setDebt(i, { limit: v })} keyboardType="decimal-pad" error={errors[`debts.${i}.limit`]} />
          ) : null}
          <Button label="Quitar esta deuda" kind="quiet" onPress={() => setForm((f) => ({ ...f, debts: f.debts.filter((_, j) => j !== i) }))} />
        </View>
      ))}
      <Button label="Agregar deuda" kind="secondary" onPress={() =>
        setForm((f) => ({ ...f, debts: [...f.debts, { kind: 'credit_card', balance: '', limit: '', monthlyPayment: '' }] }))} />

      <Divider />
      <Heading>Documentos listos</Heading>
      <Check label="Talonario o ficha de la CSS" checked={form.documents.incomeProof}
        onToggle={() => set('documents')({ ...form.documents, incomeProof: !form.documents.incomeProof })} />
      <Check label="Carta de trabajo" checked={form.documents.employmentLetter}
        onToggle={() => set('documents')({ ...form.documents, employmentLetter: !form.documents.employmentLetter })} />
      <Check label="Reporte de historial de crédito" checked={form.documents.apcReport}
        onToggle={() => set('documents')({ ...form.documents, apcReport: !form.documents.apcReport })} />

      {Object.keys(errors).length ? <Notice tone="error">Revisa los campos marcados.</Notice> : null}
      {saveError ? <Notice tone="error">{saveError}</Notice> : null}
      <Button label="Guardar perfil" onPress={save} busy={busy} />
      {saved ? (
        <View style={{ marginTop: space.md }}>
          <Text style={s.saved}>Perfil guardado. Tus metas se recalculan con estos datos.</Text>
          <Button label="Ver mis metas" kind="quiet" onPress={() => router.push('/')} />
        </View>
      ) : null}

      <Divider />
      <Small>Entraste como {email}.</Small>
      <Button label="Salir" kind="quiet" onPress={signOut} />
    </Screen>
  );
}

const s = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md },
  debt: { marginTop: space.lg, paddingLeft: space.md, borderLeftWidth: 3, borderLeftColor: color.line },
  saved: { ...type.body, color: color.good, fontWeight: '600' },
});
