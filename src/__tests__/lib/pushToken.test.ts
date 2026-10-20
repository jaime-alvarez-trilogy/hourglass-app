/**
 * FR4: App Push Token Registration tests
 * Tests for src/lib/pushToken.ts: registerPushToken, unregisterPushToken
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeExpoLikeResponse } from '../../../__tests__/helpers/expoLikeResponse';

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

// ---------------------------------------------------------------------------
// FR3: registerPushToken — response.ok check
// ---------------------------------------------------------------------------

describe('FR3: registerPushToken — response.ok validation', () => {
  it('saves token to AsyncStorage when server returns 200 (ok)', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await registerPushToken();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('push_token', VALID_TOKEN);
  });

  it('does NOT save token to AsyncStorage when server returns 500', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await registerPushToken();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('emits console.warn when server returns non-ok status', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await registerPushToken();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does NOT save token when fetch() throws a network error', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

    await registerPushToken();

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('emits console.warn when fetch() throws', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await registerPushToken();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves without throwing when server returns error', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(registerPushToken()).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch() throws', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(registerPushToken()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FR4 (extended): unregisterPushToken — response.ok check
// ---------------------------------------------------------------------------

describe('FR4: unregisterPushToken — response.ok validation', () => {
  it('emits console.warn when server returns non-ok status', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await unregisterPushToken();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('emits console.warn when fetch() throws during unregister', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await unregisterPushToken();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves without throwing when server returns error during unregister', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch() throws during unregister', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10-sdk-58-ios-27 FR3: the ping-server calls never read the response body
// ---------------------------------------------------------------------------
// expo/fetch reads a body once; these calls only need `ok`/`status`, so they must never
// consume it (nothing to parse, nothing to "already use").

describe('10 FR3: push-token calls never read the response body (expo/fetch)', () => {
  it.each([200, 204, 500])('registerPushToken with a %i response: no text()/json()', async (status) => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: true });
    mockGetExpoPushToken.mockResolvedValueOnce({ data: VALID_TOKEN });
    const res = makeExpoLikeResponse({ status, body: '{"ok":true}' });
    mockFetch.mockResolvedValueOnce(res);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await registerPushToken();
    warn.mockRestore();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.text).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.bodyUsed).toBe(false);
    // The ok/!ok branch still ran: the token is stored only on 2xx.
    if (status < 300) expect(AsyncStorage.setItem).toHaveBeenCalledWith('push_token', VALID_TOKEN);
    else expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it.each([200, 404])('unregisterPushToken with a %i response: no text()/json()', async (status) => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(VALID_TOKEN);
    const res = makeExpoLikeResponse({ status, body: '{"ok":true}' });
    mockFetch.mockResolvedValueOnce(res);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await unregisterPushToken();
    warn.mockRestore();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.text).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.bodyUsed).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('push_token');
  });
});
