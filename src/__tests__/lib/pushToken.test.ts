/**
 * FR4: App Push Token Registration tests
 * Tests for src/lib/pushToken.ts: registerPushToken, unregisterPushToken
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-notifications — use jest.fn() inside factory (hoisting safe)
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'test-project-id-1234',
        },
      },
    },
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AsyncStorage (jest-expo provides automock, but we declare explicitly)
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Import after mocks
import { registerPushToken, unregisterPushToken } from '../../lib/pushToken';
import * as Notifications from 'expo-notifications';

// Cast to jest.Mock after import
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetExpoPushToken = Notifications.getExpoPushTokenAsync as jest.Mock;

const PING_SERVER_URL = process.env.EXPO_PUBLIC_PING_SERVER_URL ?? 'https://hourglass-ping.railway.app';
const VALID_TOKEN = 'ExponentPushToken[abc123def456]';

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe('FR4: registerPushToken', () => {
  it('requests notification permissions before getting token', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });

    await registerPushToken();

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    // getExpoPushToken must come after permissions
    const requestOrder = mockRequestPermissions.mock.invocationCallOrder[0];
    const tokenOrder = mockGetExpoPushToken.mock.invocationCallOrder[0];
    expect(requestOrder).toBeLessThan(tokenOrder);
  });

  it('returns early without error if permissions denied', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: false });

    await expect(registerPushToken()).resolves.toBeUndefined();

    expect(mockGetExpoPushToken).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('calls getExpoPushTokenAsync with the correct projectId', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });

    await registerPushToken();

    expect(mockGetExpoPushToken).toHaveBeenCalledWith({ projectId: 'test-project-id-1234' });
  });

  it('POSTs token to server /register endpoint', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });

    await registerPushToken();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/register'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token: VALID_TOKEN }),
      })
    );
  });

  it('stores token in AsyncStorage under push_token key', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });

    await registerPushToken();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('push_token', VALID_TOKEN);
  });
});

describe('FR4: unregisterPushToken', () => {
  it('reads token from AsyncStorage and POSTs to /unregister', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);

    await unregisterPushToken();

    expect(AsyncStorage.getItem).toHaveBeenCalledWith('push_token');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/unregister'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: VALID_TOKEN }),
      })
    );
  });

  it('returns early without error if no stored token', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    await expect(unregisterPushToken()).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('removes push_token from AsyncStorage after unregistering', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);

    await unregisterPushToken();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('push_token');
  });
});
