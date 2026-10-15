import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../src/lib/session';
import { color } from '../../src/ui/theme';

export default function TabsLayout() {
  const { email } = useSession();
  if (!email) return <Redirect href="/entrar" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // cada pantalla tiene su propio título
        tabBarActiveTintColor: color.lock,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarIconStyle: { display: 'none' },
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Metas' }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="productos" options={{ title: 'Productos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
