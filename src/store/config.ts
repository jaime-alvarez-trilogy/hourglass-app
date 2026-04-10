// FR7, FR8, FR9, FR10: Config/credentials storage + environment helpers

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { CrossoverConfig, Credentials } from '../types/config';

// expo-secure-store exports an empty object on web — fall back to AsyncStorage
const hasSecureStore = typeof SecureStore.setItemAsync === 'function';

async function secureGet(key: string): Promise<string | null> {
  if (!hasSecureStore) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (!hasSecureStore) { await AsyncStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}
async function secureDelete(key: string): Promise<void> {
  if (!hasSecureStore) { await AsyncStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

const CONFIG_KEY = 'crossover_config';
const USERNAME_KEY = 'crossover_username';
const PASSWORD_KEY = 'crossover_password';

// FR10: Environment base URLs
export function getApiBase(useQA: boolean): string {
  return useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com';
}

export function getAppBase(useQA: boolean): string {
  return useQA ? 'https://app-qa.crossover.com' : 'https://app.crossover.com';
}

// FR7: AsyncStorage config layer
export async function loadConfig(): Promise<CrossoverConfig | null> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CrossoverConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: CrossoverConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// FR8: SecureStore credentials layer
export async function loadCredentials(): Promise<Credentials | null> {
  const [username, password] = await Promise.all([
    secureGet(USERNAME_KEY),
    secureGet(PASSWORD_KEY),
  ]);
  if (!username || !password) return null;
  return { username, password };
}

export async function saveCredentials(username: string, password: string): Promise<void> {
  await Promise.all([
    secureSet(USERNAME_KEY, username),
    secureSet(PASSWORD_KEY, password),
  ]);
}

// FR9 + 05-cache-hygiene FR1: Clear all stored data.
// AsyncStorage keys: removed via multiRemove (atomic, one call).
// SecureStore credentials: removed via secureDelete (cross-platform: SecureStore on iOS, AsyncStorage on web).
// Raw string literals intentionally avoid importing constants from hook files (would create import cycles).
export async function clearAll(): Promise<void> {
  await Promise.all([
    // All AsyncStorage keys (12 data keys + config, plus credential fallback for web)
    AsyncStorage.multiRemove([
      'crossover_config',
      'crossover_username',   // web fallback — on iOS these live in SecureStore below
      'crossover_password',   // web fallback — on iOS these live in SecureStore below
      'hours_cache',
      'ai_cache',
      'previousWeekAIPercent',
      'earnings_history_v1',
      'weekly_history_v2',
      'push_token',
      'ai_app_history',
      'widget_data',
      'notif_thursday_id',
      'notif_monday_id',
      'prev_approval_count',
    ]),
    // Credentials stored in SecureStore on iOS (no-op if not available)
    secureDelete(USERNAME_KEY),
    secureDelete(PASSWORD_KEY),
  ]);
}
