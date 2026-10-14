import { Stack } from 'expo-router';
import { SessionProvider } from '../src/lib/session';
import { color } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.lock,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
          headerBackTitle: 'Volver',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="entrar" options={{ headerShown: false }} />
        <Stack.Screen name="nueva-meta" options={{ title: 'Nueva meta', presentation: 'modal' }} />
        <Stack.Screen name="meta/[id]" options={{ title: 'Tu meta' }} />
      </Stack>
    </SessionProvider>
  );
}
