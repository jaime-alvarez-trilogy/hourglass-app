/**
 * Isolated reproduction of the stale-closure contamination issue.
 * Uses useAIData with all mocks, same setup as use-ai-data.test.ts.
 * Run only this test to confirm if the issue is the hook or test interaction.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAIData } from '../src/hooks/useAIData';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrossoverConfig, Credentials } from '../src/types/config';

jest.mock('../src/api/workDiary', () => ({ fetchWorkDiary: jest.fn() }));
jest.mock('../src/store/config', () => ({
  loadCredentials: jest.fn(),
  getApiBase: jest.fn((useQA: boolean) => useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com'),
}));
jest.mock('../src/hooks/useConfig', () => ({ useConfig: jest.fn() }));

import { fetchWorkDiary } from '../src/api/workDiary';
import { loadCredentials } from '../src/store/config';
import { useConfig } from '../src/hooks/useConfig';

const mockFetchWorkDiary = fetchWorkDiary as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockUseConfig = useConfig as jest.Mock;

const VALID_CONFIG: CrossoverConfig = {
  userId: '2362707', fullName: 'Jane Doe', managerId: '2372227', primaryTeamId: '4584',
  assignmentId: '79996', hourlyRate: 50, weeklyLimit: 40, useQA: false, isManager: false,
  teams: [], lastRoleCheck: '2026-01-01T00:00:00.000Z', setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z', debugMode: false,
};

async function flushAsync() {
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
}

function setupHook() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let current!: ReturnType<typeof useAIData>;
  const Wrapper = () => React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(() => { current = useAIData(); return null; }));
  act(() => { create(React.createElement(Wrapper)); });
  return { get: () => current };
}

function makeSlots(aiCount: number) {
  return Array.from({ length: aiCount }, () => ({ tags: ['ai_usage'], autoTracker: true, status: 'APPROVED' as const, memo: '', actions: [] }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as unknown as { _reset: () => void })._reset();
  mockUseConfig.mockReturnValue({ config: VALID_CONFIG, isLoading: false, refetch: jest.fn() });
  mockLoadCredentials.mockResolvedValue({ username: 'u', password: 'p' } as Credentials);
  mockFetchWorkDiary.mockResolvedValue(makeSlots(20));
});

// Test 1: Simulate what the "Bug A: throw on creds" test does
it('sim: credentials throw (leaves AsyncStorage in state)', async () => {
  mockLoadCredentials.mockRejectedValue(new Error('locked'));
  const { get } = setupHook();
  await flushAsync();
  await flushAsync();
  expect(get().data).not.toBeNull();
  expect(get().error).toBe('unknown');
});

// Test 2: The stale closure test - should pass after test 1
it('stale closure: calls after first fetch > 0', async () => {
  await AsyncStorage.setItem('previousWeekAIPercent', '75');
  const { get } = setupHook();
  await flushAsync();
  await flushAsync();
  // eslint-disable-next-line no-console
  console.log('[iso] loadCreds calls:', mockLoadCredentials.mock.calls.length, 'fetchWD calls:', mockFetchWorkDiary.mock.calls.length, 'get():', typeof get());
  expect(mockFetchWorkDiary.mock.calls.length).toBeGreaterThan(0);
  expect(get().data).not.toBeNull();
});
