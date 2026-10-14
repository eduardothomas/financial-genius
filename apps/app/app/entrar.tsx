import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '../src/lib/session';
import { Body, Button, Field, Notice, Screen, Title } from '../src/ui/components';
import { space } from '../src/ui/theme';

export default function Entrar() {
  const { email, signIn } = useSession();
  const [value, setValue] = useState('');
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
  if (email) return <Redirect href="/" />;
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
        <Notice>Versión de prueba: entras solo con tu correo. Antes del lanzamiento se agrega inicio de sesión seguro.</Notice>
      </View>
    </Screen>
  );
}
