// FR9: useConfig hook (src/hooks/useConfig.ts)
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConfig } from '../src/hooks/useConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrossoverConfig } from '../src/types/config';

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
  teams: [{ id: '4584', name: 'Team Alpha', company: '' }],
  lastRoleCheck: '2026-01-01T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
  debugMode: false,
};

/** Wait for async React Query operations to complete via multiple event loop turns. */
async function flushAsync() {
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise<void>((res) => setTimeout(res, 0)); });
}

function setupHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let current!: ReturnType<typeof useConfig>;
  const Wrapper = () =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(() => { current = useConfig(); return null; }),
    );
  act(() => { create(React.createElement(Wrapper)); });
  return { get: () => current, queryClient };
}

beforeEach(() => {
  (AsyncStorage as unknown as { _reset: () => void })._reset();
});

describe('FR9: useConfig', () => {
  it('returns config: null and isLoading: false when AsyncStorage is empty', async () => {
    const { get } = setupHook();
    await flushAsync();
    expect(get().config).toBeNull();
    expect(get().isLoading).toBe(false);
  });

  it('returns populated config when AsyncStorage has valid JSON', async () => {
    await AsyncStorage.setItem('crossover_config', JSON.stringify(VALID_CONFIG));
    const { get } = setupHook();
    await flushAsync();
    expect(get().config).toEqual(VALID_CONFIG);
    expect(get().isLoading).toBe(false);
  });

  it('returns null (no throw) when AsyncStorage contains invalid JSON', async () => {
    await AsyncStorage.setItem('crossover_config', '{{not valid json}}');
    const { get } = setupHook();
    await flushAsync();
    expect(get().config).toBeNull();
    expect(get().isLoading).toBe(false);
  });

  it('refetch triggers fresh AsyncStorage read and updates config', async () => {
    const { get } = setupHook();
    await flushAsync();
    expect(get().config).toBeNull();

    await AsyncStorage.setItem('crossover_config', JSON.stringify(VALID_CONFIG));
    await act(async () => {
      await get().refetch();
      await new Promise<void>((res) => setTimeout(res, 0));
    });
    expect(get().config).toEqual(VALID_CONFIG);
  });

  it('SC9.6: does NOT write to AsyncStorage (read-only hook)', async () => {
    const spySetItem = jest.spyOn(AsyncStorage, 'setItem');
    const { get } = setupHook();
    await flushAsync();
    await act(async () => { await get().refetch(); });
    expect(spySetItem).not.toHaveBeenCalled();
    spySetItem.mockRestore();
  });

  it('SC9.7: returns configs missing isManager as-is without mutation', async () => {
    const legacyConfig = { ...VALID_CONFIG } as Record<string, unknown>;
    delete legacyConfig.isManager;
    await AsyncStorage.setItem('crossover_config', JSON.stringify(legacyConfig));
    const { get } = setupHook();
    await flushAsync();
    // Config is returned as-is — isManager absent in raw storage, hook does not add it
    expect((get().config as Record<string, unknown> | null)?.isManager).toBeUndefined();
  });
});
