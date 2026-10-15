import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../src/lib/session';
import { Loading } from '../../src/ui/components';
import { color } from '../../src/ui/theme';

export default function TabsLayout() {
  const { email, ready } = useSession();
  if (!ready) return <Loading />;
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
      <Tabs.Screen name="genio" options={{ tabBarButtonTestID: 'tab-genio', title: 'Genio' }} />
      <Tabs.Screen name="index" options={{ tabBarButtonTestID: 'tab-metas', title: 'Metas' }} />
      <Tabs.Screen name="plan" options={{ tabBarButtonTestID: 'tab-plan', title: 'Plan' }} />
      <Tabs.Screen name="productos" options={{ tabBarButtonTestID: 'tab-productos', title: 'Productos' }} />
      <Tabs.Screen name="perfil" options={{ tabBarButtonTestID: 'tab-perfil', title: 'Perfil' }} />
    </Tabs>
  );
}
