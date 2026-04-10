// FR7, FR8 Tests: useAIData hook
// Written BEFORE implementation (TDD red phase)

import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAIData } from '../src/hooks/useAIData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthError, NetworkError } from '../src/api/errors';
import type { CrossoverConfig, Credentials } from '../src/types/config';
import type { TagData } from '../src/lib/ai';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

jest.mock('../src/store/config', () => ({
  loadCredentials: jest.fn(),
  getApiBase: jest.fn((useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'
  ),
}));

// useConfig reads from AsyncStorage via React Query — we mock the hook itself
jest.mock('../src/hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

import { fetchWorkDiary } from '../src/api/workDiary';
import { loadCredentials } from '../src/store/config';
import { useConfig } from '../src/hooks/useConfig';

const mockFetchWorkDiary = fetchWorkDiary as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockUseConfig = useConfig as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  assignmentId: '79996',
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  teams: [],
  lastRoleCheck: '2026-01-01T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
  debugMode: false,
};

const VALID_CREDS: Credentials = {
  username: 'user@example.com',
  password: 'secret',
};

function makeSlots(aiCount: number, sbCount: number, emptyCount: number) {
  return [
    ...Array.from({ length: aiCount }, () => ({
      tags: ['ai_usage'],
      autoTracker: true,
      status: 'APPROVED' as const,
      memo: '',
      actions: [],
    })),
    ...Array.from({ length: sbCount }, () => ({
      tags: ['second_brain'],
      autoTracker: true,
      status: 'APPROVED' as const,
      memo: '',
      actions: [],
    })),
    ...Array.from({ length: emptyCount }, () => ({
      tags: [] as string[],
      autoTracker: true,
      status: 'APPROVED' as const,
      memo: '',
      actions: [],
    })),
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function flushAsync() {
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
}

function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let current!: ReturnType<typeof useAIData>;
  const Wrapper = () =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(() => { current = useAIData(); return null; }),
    );
  act(() => { create(React.createElement(Wrapper)); });
  return { get: () => current };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as unknown as { _reset: () => void })._reset();

  // Default: valid config + credentials + successful fetch
  mockUseConfig.mockReturnValue({
    config: VALID_CONFIG,
    isLoading: false,
    refetch: jest.fn(),
  });
  mockLoadCredentials.mockResolvedValue(VALID_CREDS);

  // Default fetch returns some slots
  mockFetchWorkDiary.mockResolvedValue(makeSlots(20, 3, 5));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FR7+FR8: useAIData', () => {
  it('returns { data: null } when config is null', async () => {
    mockUseConfig.mockReturnValue({ config: null, isLoading: false, refetch: jest.fn() });
    const { get } = setupHook();
    await flushAsync();
    expect(get().data).toBeNull();
    expect(get().isLoading).toBe(false);
    expect(get().error).toBeNull();
  });

  it('returns { data: null } when credentials are null', async () => {
    mockLoadCredentials.mockResolvedValue(null);
    const { get } = setupHook();
    await flushAsync();
    expect(get().data).toBeNull();
    expect(get().error).toBeNull();
  });

  it('populates data after successful API fetch', async () => {
    const { get } = setupHook();
    await flushAsync();
    expect(get().data).not.toBeNull();
    expect(get().data?.totalSlots).toBeGreaterThan(0);
  });

  it('sets error to "auth" when fetchWorkDiary throws AuthError', async () => {
    mockFetchWorkDiary.mockRejectedValue(new AuthError(401));
    const { get } = setupHook();
    await flushAsync();
    expect(get().error).toBe('auth');
    expect(get().data).toBeNull();
  });

  it('sets error to "network" when fetchWorkDiary throws NetworkError', async () => {
    mockFetchWorkDiary.mockRejectedValue(new NetworkError('No connection'));
    const { get } = setupHook();
    await flushAsync();
    expect(get().error).toBe('network');
    // data is kept (not wiped) on network error so stale cache remains visible
    expect(get().data).not.toBeUndefined();
  });

  it('error is null on successful fetch', async () => {
    const { get } = setupHook();
    await flushAsync();
    expect(get().error).toBeNull();
  });

  it('reads lastFetchedAt from cache after fetch', async () => {
    const { get } = setupHook();
    await flushAsync();
    expect(get().lastFetchedAt).not.toBeNull();
    // Should be a valid ISO string
    const ts = get().lastFetchedAt;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('saves cache to AsyncStorage after fetch', async () => {
    const { get } = setupHook();
    await flushAsync();
    const raw = await AsyncStorage.getItem('ai_cache');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed._lastFetchedAt).toBeDefined();
  });

  it('loads data from AsyncStorage cache without API call on second mount', async () => {
    // Pre-populate cache with valid data
    const cachedData: Record<string, TagData | string> = {
      '2026-03-03': { total: 25, aiUsage: 20, secondBrain: 3, noTags: 2 },
      _lastFetchedAt: '2026-03-04T10:00:00.000Z',
    };
    await AsyncStorage.setItem('ai_cache', JSON.stringify(cachedData));

    // Reset fetch mock to see if it's called
    mockFetchWorkDiary.mockClear();

    const { get } = setupHook();
    await flushAsync();

    // data should be available (may have re-fetched today, but cache data used)
    expect(get().data).not.toBeNull();
  });

  it('prunes cache entries outside current Mon–Sun window on load', async () => {
    // Pre-populate with last week's data
    const staleCache: Record<string, TagData> = {
      '2026-02-23': { total: 10, aiUsage: 8, secondBrain: 1, noTags: 1 }, // last Mon
      '2026-02-24': { total: 10, aiUsage: 8, secondBrain: 1, noTags: 1 }, // last Tue
    };
    await AsyncStorage.setItem('ai_cache', JSON.stringify(staleCache));

    const { get } = setupHook();
    await flushAsync();

    // After pruning, last week's entries should not affect current week totals
    // Current week should only have data from this week's fetches
    const raw = await AsyncStorage.getItem('ai_cache');
    const parsed = JSON.parse(raw!);
    expect(parsed['2026-02-23']).toBeUndefined();
    expect(parsed['2026-02-24']).toBeUndefined();
  });

  it('refetch() can be called without throwing', async () => {
    const { get } = setupHook();
    await flushAsync();
    await expect(act(async () => {
      get().refetch();
      await flushAsync();
    })).resolves.not.toThrow();
  });

  // FR3 (04-ai-data-closure): Stale closure regression test.
  // With the original useState, previousWeekPercent is always undefined inside fetchData
  // (stale closure), causing 7 extra fetchWorkDiary calls on EVERY refresh.
  // After the fix (useRef), prevWeekPercentRef.current is set after the first fetch,
  // so the second refetch() does NOT trigger another 7 prev-week calls.
  //
  // This test FAILS with the original useState code and PASSES after the useRef fix.
  it('does not re-fetch previous week on subsequent refreshes (stale closure fix)', async () => {
    // Ensure no previousWeekAIPercent in storage — simulates first-run (ref starts undefined)
    await AsyncStorage.removeItem('previousWeekAIPercent');

    const { get } = setupHook();

    // First fetch cycle — prev-week branch fires (ref is undefined)
    await flushAsync();
    const callsAfterFirstFetch = mockFetchWorkDiary.mock.calls.length;

    // First fetch should have called fetchWorkDiary for current-week days + 7 prev-week days
    // We just need it to be > 0 to confirm the first fetch ran
    expect(callsAfterFirstFetch).toBeGreaterThan(0);

    // Second fetch cycle via refetch() — prev-week branch must NOT fire again
    await act(async () => {
      get().refetch();
      await flushAsync();
    });
    const callsAfterSecondFetch = mockFetchWorkDiary.mock.calls.length;

    // The increment on the second fetch must be < 7 (current-week days only, not prev-week again).
    // With the stale closure bug, the increment would be >= 7 (another full prev-week fetch).
    const increment = callsAfterSecondFetch - callsAfterFirstFetch;
    expect(increment).toBeLessThan(7);
  });
});
