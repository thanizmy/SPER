import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * expo-secure-store has no web implementation, so on web we fall back to
 * localStorage. This is a weaker guarantee than the OS keychain used on
 * native, acceptable for a browser-based test build.
 */
export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
