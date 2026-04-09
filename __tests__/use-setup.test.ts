// FR8: useSetup hook (src/hooks/useAuth.ts)
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useSetup } from '../src/hooks/useAuth';
import { ApiError, AuthError, NetworkError } from '../src/api/errors';
import type { CrossoverConfig } from '../src/types/config';
import * as SecureStoreMock from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock fetchAndBuildConfig and probeEnvironments from auth.ts
// submitCredentials calls probeEnvironments first, then fetchAndBuildConfig
jest.mock('../src/api/auth', () => ({
  fetchAndBuildConfig: jest.fn(),
  probeEnvironments: jest.fn(),
  getProfileDetail: jest.fn(),
}));

const { fetchAndBuildConfig, probeEnvironments } = require('../src/api/auth');
const mockFetch = fetchAndBuildConfig as jest.MockedFunction<typeof fetchAndBuildConfig>;
const mockProbe = probeEnvironments as jest.MockedFunction<typeof probeEnvironments>;

const makeConfig = (overrides: Partial<CrossoverConfig> = {}): CrossoverConfig => ({
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
  lastRoleCheck: new Date().toISOString(),
  setupComplete: false,
  setupDate: new Date().toISOString(),
  debugMode: false,
  ...overrides,
});

// Hook test harness: creates a fresh component tree and captures the hook result
function mountHook(): { get: () => ReturnType<typeof useSetup> } {
  let current!: ReturnType<typeof useSetup>;
  act(() => {
    create(React.createElement(() => { current = useSetup(); return null; }));
  });
  return { get: () => current };
}

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStoreMock as unknown as { _reset: () => void })._reset();
  (AsyncStorage as unknown as { _reset: () => void })._reset();
  // Default: probeEnvironments returns prod_only so fetchAndBuildConfig is called with useQA=false
  mockProbe.mockResolvedValue({ type: 'prod_only' });
});

// --- Initial State ---

describe('FR8: useSetup — initial state', () => {
  it('starts with step = welcome, isLoading = false, error = null', () => {
    const { get } = mountHook();
    expect(get().step).toBe('welcome');
    expect(get().isLoading).toBe(false);
    expect(get().error).toBeNull();
  });

  it('starts with pendingConfig = null and pendingCredentials = null', () => {
    const { get } = mountHook();
    expect(get().pendingConfig).toBeNull();
    expect(get().pendingCredentials).toBeNull();
  });
});

// --- setEnvironment ---

describe('FR8: useSetup — setEnvironment', () => {
  it('does not change step when called', () => {
    const { get } = mountHook();
    act(() => { get().setEnvironment(true); });
    expect(get().step).toBe('welcome');
  });

  it('setEnvironment does not change step; submitCredentials uses probeEnvironments to determine env', async () => {
    // In the current implementation, submitCredentials calls probeEnvironments() to auto-detect env.
    // setEnvironment() sets useQARef for selectEnvironment() (manual env selection after probe).
    mockFetch.mockResolvedValueOnce(makeConfig());
    mockProbe.mockResolvedValueOnce({ type: 'qa_only' }); // probe returns QA-only
    const { get } = mountHook();
    act(() => { get().setEnvironment(true); }); // sets ref but doesn't affect submitCredentials
    await act(async () => { await get().submitCredentials('u', 'p'); });
    // fetchAndBuildConfig called with useQA derived from probeEnvironments result (qa_only → true)
    expect(mockFetch).toHaveBeenCalledWith('u', 'p', true);
  });
});

// --- submitCredentials step transitions ---

describe('FR8: useSetup — submitCredentials transitions', () => {
  it('transitions step to verifying synchronously before async work completes', async () => {
    // submitCredentials: sets step='verifying' synchronously, then awaits probeEnvironments
    let resolveProbe!: (v: { type: string }) => void;
    mockProbe.mockImplementationOnce(
      () => new Promise<{ type: string }>((res) => { resolveProbe = res; }),
    );
    mockFetch.mockResolvedValueOnce(makeConfig({ hourlyRate: 50 }));
    const { get } = mountHook();

    // Start the submission — step should be 'verifying' after the sync part
    act(() => { void get().submitCredentials('u', 'p'); });
    expect(get().step).toBe('verifying');

    // Resolve so test cleans up
    await act(async () => { resolveProbe({ type: 'prod_only' }); });
  });

  it('sets isLoading = true while fetchAndBuildConfig is in flight', async () => {
    // isLoading is set synchronously when submitCredentials starts
    let resolveProbe!: (v: { type: string }) => void;
    mockProbe.mockImplementationOnce(
      () => new Promise<{ type: string }>((res) => { resolveProbe = res; }),
    );
    mockFetch.mockResolvedValueOnce(makeConfig());
    const { get } = mountHook();
    act(() => { void get().submitCredentials('u', 'p'); });
    expect(get().isLoading).toBe(true);
    await act(async () => { resolveProbe({ type: 'prod_only' }); });
  });

  it('transitions to success and populates pendingConfig + pendingCredentials when hourlyRate > 0', async () => {
    mockFetch.mockResolvedValueOnce(makeConfig({ hourlyRate: 50 }));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u@e.com', 'p'); });
    expect(get().step).toBe('success');
    expect(get().isLoading).toBe(false);
    expect(get().pendingConfig).not.toBeNull();
    expect(get().pendingConfig?.hourlyRate).toBe(50);
    expect(get().pendingCredentials).toEqual({ username: 'u@e.com', password: 'p' });
  });

  it('transitions to setup and populates pendingConfig with hourlyRate 0 when rate is zero', async () => {
    mockFetch.mockResolvedValueOnce(makeConfig({ hourlyRate: 0 }));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u@e.com', 'p'); });
    expect(get().step).toBe('setup');
    expect(get().pendingConfig).not.toBeNull();
    expect(get().pendingConfig?.hourlyRate).toBe(0);
    expect(get().pendingCredentials).toEqual({ username: 'u@e.com', password: 'p' });
  });

  it('reverts to credentials and sets "Invalid email or password." on AuthError 401', async () => {
    mockFetch.mockRejectedValueOnce(new AuthError(401));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u', 'bad'); });
    expect(get().step).toBe('credentials');
    expect(get().error).toBe('Invalid email or password.');
    expect(get().isLoading).toBe(false);
  });

  it('reverts to credentials and sets "Invalid email or password." on AuthError 403', async () => {
    mockFetch.mockRejectedValueOnce(new AuthError(403));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u', 'bad'); });
    expect(get().step).toBe('credentials');
    expect(get().error).toBe('Invalid email or password.');
  });

  it('transitions to setup on ApiError from detail endpoint (SC5.2)', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError(403));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u@e.com', 'p'); });
    expect(get().step).toBe('setup');
    expect(get().error).toBeNull();
    expect(get().isLoading).toBe(false);
    // pendingConfig should have placeholder IDs but store the username
    expect(get().pendingConfig?.fullName).toBe('u@e.com');
    expect(get().pendingConfig?.hourlyRate).toBe(0);
    // pendingCredentials MUST be set so success screen can persist them
    expect(get().pendingCredentials).toEqual({ username: 'u@e.com', password: 'p' });
  });

  it('reverts to credentials and sets user-friendly connection error on NetworkError', async () => {
    mockFetch.mockRejectedValueOnce(new NetworkError('connection refused'));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u', 'p'); });
    expect(get().step).toBe('credentials');
    expect(get().error).toBe('Connection failed. Please check your network and try again.');
    expect(get().isLoading).toBe(false);
  });
});

// --- no-op + error reset ---

describe('FR8: useSetup — in-flight guard and error reset', () => {
  it('is a no-op if submitCredentials called while isLoading = true', async () => {
    let resolveProbe!: (v: { type: string }) => void;
    mockProbe
      .mockImplementationOnce(
        () => new Promise<{ type: string }>((res) => { resolveProbe = res; }),
      )
      .mockResolvedValue({ type: 'prod_only' }); // should NOT be called again
    mockFetch.mockResolvedValue(makeConfig()); // first call resolves; second should not happen

    const { get } = mountHook();
    act(() => { void get().submitCredentials('u', 'p'); });
    expect(get().isLoading).toBe(true);
    // Second call while loading — ignored (probeEnvironments also not called again)
    act(() => { void get().submitCredentials('u2', 'p2'); });
    expect(mockProbe).toHaveBeenCalledTimes(1); // only called once
    await act(async () => { resolveProbe({ type: 'prod_only' }); });
  });

  it('resets error to null at the start of a new submission', async () => {
    // First submission fails with AuthError (probeEnvironments returns 'none')
    mockProbe.mockResolvedValueOnce({ type: 'none' }); // triggers credentials error path
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u', 'bad'); });
    expect(get().error).toBe('Invalid email or password.');

    // Second attempt — start another pending submission and verify error clears
    let resolveProbe!: (v: { type: string }) => void;
    mockProbe.mockImplementationOnce(
      () => new Promise<{ type: string }>((res) => { resolveProbe = res; }),
    );
    mockFetch.mockResolvedValueOnce(makeConfig());
    act(() => { void get().submitCredentials('u', 'corrected'); });
    expect(get().error).toBeNull(); // error cleared at submission start
    await act(async () => { resolveProbe({ type: 'prod_only' }); });
  });
});

// --- submitRate ---

describe('FR8: useSetup — submitRate', () => {
  it('merges rate into pending config and transitions step to success', async () => {
    mockFetch.mockResolvedValueOnce(makeConfig({ hourlyRate: 0 }));
    const { get } = mountHook();
    await act(async () => { await get().submitCredentials('u', 'p'); });
    expect(get().step).toBe('setup');
    expect(get().pendingConfig?.hourlyRate).toBe(0);

    await act(async () => { await get().submitRate(75); });
    expect(get().step).toBe('success');
    expect(get().isLoading).toBe(false);
    expect(get().pendingConfig?.hourlyRate).toBe(75);
  });

  it('is a no-op when called without a prior submitCredentials (no pendingConfig)', async () => {
    const { get } = mountHook();
    expect(get().pendingConfig).toBeNull();
    await act(async () => { await get().submitRate(75); });
    expect(get().step).toBe('welcome'); // step should not change
    expect(get().pendingConfig).toBeNull();
  });
});
