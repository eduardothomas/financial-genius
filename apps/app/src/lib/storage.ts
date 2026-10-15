/**
 * Almacenamiento de la sesión: Keychain/Keystore en iOS y Android (expo-secure-store),
 * localStorage en web. Si no está disponible, la sesión vive solo en memoria.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* sin almacenamiento: la sesión vive en memoria */
  }
}
