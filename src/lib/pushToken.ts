/**
 * FR4: App Push Token Registration
 * registerPushToken — get Expo push token and register with ping server.
 * unregisterPushToken — unregister token on logout.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const PING_SERVER_URL =
  (process.env.EXPO_PUBLIC_PING_SERVER_URL as string | undefined) ??
  'https://dynamic-balance-production-1696.up.railway.app';

const PUSH_TOKEN_KEY = 'push_token';

/**
 * Request notification permissions, get an Expo push token,
 * POST it to the ping server, and persist it locally.
 * Returns early without error if permissions are denied.
 */
export async function registerPushToken(): Promise<void> {
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) {
    return;
  }

  const projectId: string =
    Constants.expoConfig?.extra?.eas?.projectId ?? '';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  let registerResponse: Response;
  try {
    registerResponse = await fetch(`${PING_SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.warn('[pushToken] Registration error:', err);
    return;
  }

  if (!registerResponse.ok) {
    console.warn('[pushToken] Registration failed:', registerResponse.status);
    return;
  }

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}

/**
 * Read the stored push token and POST it to /unregister on the ping server.
 * Cleans up the AsyncStorage entry.
 * Returns early without error if no token is stored.
 */
export async function unregisterPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) {
    return;
  }

  try {
    const unregisterResponse = await fetch(`${PING_SERVER_URL}/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!unregisterResponse.ok) {
      console.warn('[pushToken] Unregistration failed:', unregisterResponse.status);
    }
  } catch (err) {
    console.warn('[pushToken] Unregistration error:', err);
  }

  // Always clean up local token regardless of server response
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
