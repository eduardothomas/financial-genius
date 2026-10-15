import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthError } from '../src/lib/auth';
import { useSession } from '../src/lib/session';
import { Body, Button, Field, Loading, Notice, Screen, Small, Title } from '../src/ui/components';
import { color, space, type } from '../src/ui/theme';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Entrar() {
  const { ready, mode, email, signIn, requestCode, verifyCode } = useSession();
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const valid = EMAIL_RE.test(value.trim());
  const codeOk = /^\d{6,10}$/.test(code.replace(/\s+/g, ''));

  if (!ready) return <Loading />;
  if (email) return <Redirect href="/genio" />;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof AuthError || e instanceof Error ? e.message : 'Algo salió mal.');
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      await requestCode(value);
      setStep('code');
      setCode('');
      setInfo(`Te enviamos un código a ${value.trim().toLowerCase()}. Revisa también la carpeta de spam.`);
    });

  return (
    <Screen>
      <View style={{ marginTop: space.xxl }}>
        <Title>Tu genio financiero</Title>
        <Body muted>
          Dinos a dónde quieres llegar —tu tarjeta, tu carro, tu casa— y te mostramos qué tan cerca estás, qué hacer este mes y
          dónde aplicar cuando estés listo.
        </Body>
      </View>

      <View style={{ marginTop: space.xl }}>
        {mode === 'dev' ? (
          <>
            <Field
              label="Correo"
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="tu@correo.com"
              onSubmitEditing={() => valid && signIn(value)}
            />
            <Button label="Entrar" onPress={() => signIn(value)} disabled={!valid} />
            <Notice>Versión de prueba: entras solo con tu correo.</Notice>
          </>
        ) : step === 'email' ? (
          <>
            <Field
              label="Correo"
              value={value}
              onChangeText={setValue}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="tu@correo.com"
              onSubmitEditing={() => valid && !busy && void sendCode()}
            />
            <Button label="Enviarme un código" onPress={() => void sendCode()} disabled={!valid} busy={busy} />
            <Small>Sin contraseñas: cada vez que entres te enviamos un código de un solo uso.</Small>
          </>
        ) : (
          <>
            {info ? <Body muted>{info}</Body> : null}
            <Field
              label="Código"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="123456"
              maxLength={12}
              onSubmitEditing={() => codeOk && !busy && void run(() => verifyCode(value, code))}
            />
            <Button label="Entrar" onPress={() => void run(() => verifyCode(value, code))} disabled={!codeOk} busy={busy} />
            <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
              <Pressable onPress={() => void sendCode()} disabled={busy} accessibilityRole="button">
                <Text style={{ ...type.small, color: color.lockSoft, textDecorationLine: 'underline' }}>Reenviar código</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('email');
                  setError(null);
                  setInfo(null);
                }}
                accessibilityRole="button"
              >
                <Text style={{ ...type.small, color: color.lockSoft, textDecorationLine: 'underline' }}>Usar otro correo</Text>
              </Pressable>
            </View>
          </>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
