// Tests: scheduleLock — 07-notification-lifecycle FR2, FR4
// Covers withScheduleLock (AsyncStorage best-effort mutex) and
// sweepOrphanNotifications (hourglass:* identifier sweep + legacy-key cleanup).

import AsyncStorage from '@react-native-async-storage/async-storage';

// Inline mock for expo-notifications — supplies the functions used by sweep.
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import {
  withScheduleLock,
  sweepOrphanNotifications,
  EXPECTED_IDENTIFIERS,
} from '../scheduleLock';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & {
  _reset: () => void;
};
const mockGetAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

const LOCK_KEY = 'notif_schedule_lock';

beforeEach(() => {
  MockAsyncStorage._reset();
  mockGetAll.mockReset();
  mockCancel.mockReset();
  mockGetAll.mockResolvedValue([]);
  mockCancel.mockResolvedValue(undefined);
});

// ─── FR2: withScheduleLock ───────────────────────────────────────────────────

describe('FR2: withScheduleLock', () => {
  it('T1 — first caller claims lock, runs fn, releases lock', async () => {
    const fn = jest.fn(async () => 'result-A');
    const out = await withScheduleLock(fn);

    expect(out).toBe('result-A');
    expect(fn).toHaveBeenCalledTimes(1);
    // setItem was called with a numeric string
    expect(MockAsyncStorage.setItem).toHaveBeenCalledWith(
      LOCK_KEY,
      expect.stringMatching(/^\d+$/),
    );
    // removeItem (release) called in finally
    expect(MockAsyncStorage.removeItem).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('T2 — concurrent contention: lock held → fn not invoked, returns undefined', async () => {
    // Pre-populate the lock with a fresh timestamp
    await MockAsyncStorage.setItem(LOCK_KEY, String(Date.now()));
    MockAsyncStorage.setItem.mockClear();
    MockAsyncStorage.removeItem.mockClear();

    const fn = jest.fn(async () => 'should-not-run');
    const out = await withScheduleLock(fn);

    expect(out).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    // No new claim while contended
    expect(MockAsyncStorage.setItem).not.toHaveBeenCalled();
    // No release either — the holder is responsible
    expect(MockAsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('T3 — stale lock: timestamp >30s old → second caller claims', async () => {
    // Lock from 31 seconds ago
    const stale = Date.now() - 31_000;
    await MockAsyncStorage.setItem(LOCK_KEY, String(stale));
    MockAsyncStorage.setItem.mockClear();

    const fn = jest.fn(async () => 'recovered');
    const out = await withScheduleLock(fn);

    expect(out).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(MockAsyncStorage.setItem).toHaveBeenCalledWith(LOCK_KEY, expect.any(String));
  });

  it('T4 — non-numeric lock value → treated as no-lock-present', async () => {
    await MockAsyncStorage.setItem(LOCK_KEY, 'not-a-number');
    MockAsyncStorage.setItem.mockClear();

    const fn = jest.fn(async () => 'ok');
    const out = await withScheduleLock(fn);

    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('T5 — fn rejects → lock released in finally, error propagates', async () => {
    const fn = jest.fn(async () => {
      throw new Error('boom');
    });

    await expect(withScheduleLock(fn)).rejects.toThrow('boom');
    expect(MockAsyncStorage.removeItem).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('T6 — getItem rejects → treated as no-lock-present, fn runs', async () => {
    MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('storage down'));

    const fn = jest.fn(async () => 'survived');
    const out = await withScheduleLock(fn);

    expect(out).toBe('survived');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('T7 — setItem (claim) rejects → console.warn, fn runs anyway', async () => {
    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('claim failed'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = jest.fn(async () => 'still-ran');
    const out = await withScheduleLock(fn);

    expect(out).toBe('still-ran');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(MockAsyncStorage.removeItem).toHaveBeenCalledWith(LOCK_KEY);
    warnSpy.mockRestore();
  });

  it('T8 — removeItem (release) rejects → swallowed; fn result still returned', async () => {
    MockAsyncStorage.removeItem.mockRejectedValueOnce(new Error('release failed'));

    const fn = jest.fn(async () => 'value');
    const out = await withScheduleLock(fn);

    expect(out).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── FR4: sweepOrphanNotifications ───────────────────────────────────────────

describe('FR4: sweepOrphanNotifications', () => {
  it('T9 — broadened sweep: ALL non-expected identifiers are cancelled (any prefix)', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'hourglass:thursday' },
      { identifier: 'hourglass:monday-summary' },
      { identifier: 'hourglass:monday-expiry' },
      { identifier: 'hourglass:foo' },
      { identifier: 'hourglass:legacy-abc-123' },
      { identifier: '7F3A1C2E-9B4D-4E5F-A1B2-C3D4E5F60718' }, // build-9 random-UUID orphan
      { identifier: 'some-other-app:reminder' },
    ]);

    await sweepOrphanNotifications();

    // Every identifier NOT in EXPECTED_IDENTIFIERS is cancelled, regardless of prefix.
    expect(mockCancel).toHaveBeenCalledTimes(4);
    expect(mockCancel).toHaveBeenCalledWith('hourglass:foo');
    expect(mockCancel).toHaveBeenCalledWith('hourglass:legacy-abc-123');
    expect(mockCancel).toHaveBeenCalledWith('7F3A1C2E-9B4D-4E5F-A1B2-C3D4E5F60718');
    expect(mockCancel).toHaveBeenCalledWith('some-other-app:reminder');
    // The three canonical identifiers are preserved.
    expect(mockCancel).not.toHaveBeenCalledWith('hourglass:thursday');
    expect(mockCancel).not.toHaveBeenCalledWith('hourglass:monday-summary');
    expect(mockCancel).not.toHaveBeenCalledWith('hourglass:monday-expiry');
  });

  it('T9b — build-9 regression: a bare random-UUID orphan (no hourglass: prefix) IS cancelled', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'hourglass:thursday' },
      { identifier: 'A1B2C3D4-0000-1111-2222-333344445555' },
    ]);

    await sweepOrphanNotifications();

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('A1B2C3D4-0000-1111-2222-333344445555');
    expect(mockCancel).not.toHaveBeenCalledWith('hourglass:thursday');
  });

  it('T10 — all expected identifiers: no cancellations', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'hourglass:thursday' },
      { identifier: 'hourglass:monday-summary' },
      { identifier: 'hourglass:monday-expiry' },
    ]);

    await sweepOrphanNotifications();

    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('T11 — empty list: no cancellations; multiRemove still called', async () => {
    mockGetAll.mockResolvedValueOnce([]);

    await sweepOrphanNotifications();

    expect(mockCancel).not.toHaveBeenCalled();
    expect(MockAsyncStorage.multiRemove).toHaveBeenCalledTimes(1);
  });

  it('T12 — multiRemove always called with the three legacy ID keys', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'hourglass:thursday' },
    ]);

    await sweepOrphanNotifications();

    expect(MockAsyncStorage.multiRemove).toHaveBeenCalledWith([
      'notif_thursday_id',
      'notif_monday_id',
      'notif_expiry_id',
    ]);
  });

  it('T13 — getAllScheduledNotificationsAsync rejects → warn, multiRemove still runs', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('iOS bridge dropped'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(sweepOrphanNotifications()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Legacy-key cleanup still attempted even on getAll failure
    expect(MockAsyncStorage.multiRemove).toHaveBeenCalledWith([
      'notif_thursday_id',
      'notif_monday_id',
      'notif_expiry_id',
    ]);
    warnSpy.mockRestore();
  });

  it('T14 — cancelScheduledNotificationAsync rejects for one orphan → loop continues', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'hourglass:foo' },
      { identifier: 'hourglass:bar' },
    ]);
    mockCancel.mockRejectedValueOnce(new Error('first orphan failed'));
    mockCancel.mockResolvedValueOnce(undefined);

    await expect(sweepOrphanNotifications()).resolves.toBeUndefined();

    // Both cancellations attempted despite first failure
    expect(mockCancel).toHaveBeenCalledTimes(2);
  });

  it('T15 — multiRemove rejects → swallowed; function resolves', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    MockAsyncStorage.multiRemove.mockRejectedValueOnce(new Error('remove failed'));

    await expect(sweepOrphanNotifications()).resolves.toBeUndefined();
  });
});

// ─── Sanity: EXPECTED_IDENTIFIERS contract ───────────────────────────────────

describe('EXPECTED_IDENTIFIERS', () => {
  it('contains the three current hourglass identifiers', () => {
    expect(EXPECTED_IDENTIFIERS.has('hourglass:thursday')).toBe(true);
    expect(EXPECTED_IDENTIFIERS.has('hourglass:monday-summary')).toBe(true);
    expect(EXPECTED_IDENTIFIERS.has('hourglass:monday-expiry')).toBe(true);
    expect(EXPECTED_IDENTIFIERS.size).toBe(3);
  });
});
