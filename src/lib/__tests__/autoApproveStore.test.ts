// Tests: autoApproveStore — 1.2 manager auto-approve, the auto_approve_v1 store.
// Owner scoping (another manager or environment reads empty, and a write never drops
// another owner's entry), corrupt JSON, malformed rules / entries, the log cap and order,
// setAutoApproveRule's reject-when-not-saved contract, appendAutoApproveLog's never-reject
// contract, the sign-out and switch races, and the clearAll() wipe.
//
// Mocks: the in-memory AsyncStorage __mocks__ (reset per test), `loadConfig` (the owner is
// checked twice per write) and ../log. The clearAll case uses the real config module.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTO_APPROVE_LOG_CAP,
  AUTO_APPROVE_STORE_KEY,
  appendAutoApproveLog,
  autoApproveOwnerKey,
  clearAutoApprove,
  readAutoApprove,
  setAutoApproveRule,
} from '../autoApproveStore';
import type { AutoApproveLogEntry } from '../autoApprove';
import { loadConfig } from '../../store/config';
import type { CrossoverConfig } from '../../types/config';

jest.mock('../../store/config', () => ({
  ...jest.requireActual('../../store/config'),
  loadConfig: jest.fn(),
}));

jest.mock('../log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const actualConfig = jest.requireActual<typeof import('../../store/config')>('../../store/config');
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Manager Name',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [],
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  assignmentId: '79996',
  lastRoleCheck: '2026-10-01T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-10-01T00:00:00.000Z',
};

const OWNER = '2362707|prod';
const QA_OWNER = '2362707|qa';
const OTHER_OWNER = '9999999|prod';

function entry(n: number, overrides: Partial<AutoApproveLogEntry> = {}): AutoApproveLogEntry {
  return {
    id: `mt-${n}`,
    personId: '1190001',
    name: 'Ana Ruiz',
    category: 'MANUAL',
    durationMinutes: 60,
    startDateTime: '2026-10-20T10:00:00Z',
    at: new Date(Date.UTC(2026, 9, 26, 12, 0, n)).toISOString(),
    outcome: 'approved',
    ...overrides,
  };
}

async function stored(): Promise<any> {
  const raw = await AsyncStorage.getItem(AUTO_APPROVE_STORE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  mockAsyncStorage._reset();
  jest.clearAllMocks();
  mockLoadConfig.mockReset();
  mockLoadConfig.mockResolvedValue(CONFIG);
});

// ─── autoApproveOwnerKey ─────────────────────────────────────────────────────

describe('autoApproveOwnerKey', () => {
  it('is `${userId}|prod` or `${userId}|qa`', () => {
    expect(autoApproveOwnerKey(CONFIG)).toBe(OWNER);
    expect(autoApproveOwnerKey({ ...CONFIG, useQA: true })).toBe(QA_OWNER);
  });

  it('is null without a config or userId', () => {
    expect(autoApproveOwnerKey(null)).toBeNull();
    expect(autoApproveOwnerKey(undefined)).toBeNull();
    expect(autoApproveOwnerKey({ ...CONFIG, userId: '' })).toBeNull();
  });
});

// ─── Read ────────────────────────────────────────────────────────────────────

describe('readAutoApprove', () => {
  it('reads an absent key as an empty store for the owner', async () => {
    expect(await readAutoApprove(OWNER)).toEqual({ version: 1, ownerKey: OWNER, rules: {}, log: [] });
  });

  it('reads corrupt JSON as empty', async () => {
    await AsyncStorage.setItem(AUTO_APPROVE_STORE_KEY, '{not json');
    expect(await readAutoApprove(OWNER)).toEqual({ version: 1, ownerKey: OWNER, rules: {}, log: [] });
  });

  it('reads a wrong version or a non-object as empty', async () => {
    await AsyncStorage.setItem(
      AUTO_APPROVE_STORE_KEY,
      JSON.stringify({ version: 2, ownerKey: OWNER, rules: { '1': { manual: true, overtime: true } }, log: [] }),
    );
    expect((await readAutoApprove(OWNER)).rules).toEqual({});
    await AsyncStorage.setItem(AUTO_APPROVE_STORE_KEY, JSON.stringify([1, 2]));
    expect((await readAutoApprove(OWNER)).rules).toEqual({});
  });

  it('another manager or the other environment never sees the rules', async () => {
    await setAutoApproveRule(OWNER, '1190001', { manual: true });
    expect((await readAutoApprove(OWNER)).rules).toEqual({ '1190001': { manual: true, overtime: false } });
    expect((await readAutoApprove(OTHER_OWNER)).rules).toEqual({});
    expect((await readAutoApprove(QA_OWNER)).rules).toEqual({});
  });

  it('drops malformed rules and log entries, keeping the rest', async () => {
    await AsyncStorage.setItem(
      AUTO_APPROVE_STORE_KEY,
      JSON.stringify({
        version: 1,
        ownerKey: OWNER,
        rules: { good: { manual: true, overtime: 'yes' }, bad: null, alsoBad: 3 },
        log: [entry(1), { id: 'x' }, null, entry(2, { outcome: 'exploded' as never })],
      }),
    );
    const store = await readAutoApprove(OWNER);
    expect(store.rules).toEqual({ good: { manual: true, overtime: false } });
    expect(store.log).toEqual([entry(1)]);
  });

  it('keeps entries of every outcome, \'retrying\' included', async () => {
    const outcomes = ['approved', 'over_limit', 'deadline_passed', 'retrying', 'failed'] as const;
    const log = outcomes.map((outcome, n) => entry(n, { outcome }));
    await AsyncStorage.setItem(
      AUTO_APPROVE_STORE_KEY,
      JSON.stringify({ version: 1, ownerKey: OWNER, rules: {}, log }),
    );
    expect((await readAutoApprove(OWNER)).log.map((e) => e.outcome)).toEqual([...outcomes]);
  });

  it('reads as empty, without throwing, when getItem throws', async () => {
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await readAutoApprove(OWNER)).toEqual({ version: 1, ownerKey: OWNER, rules: {}, log: [] });
  });
});

// ─── setAutoApproveRule ──────────────────────────────────────────────────────

describe('setAutoApproveRule', () => {
  it('merges a patch into the existing rule and resolves with the saved store', async () => {
    await setAutoApproveRule(OWNER, '1190001', { manual: true });
    const saved = await setAutoApproveRule(OWNER, '1190001', { overtime: true });
    expect(saved.rules).toEqual({ '1190001': { manual: true, overtime: true } });
    expect((await stored()).owners).toEqual({
      [OWNER]: { rules: { '1190001': { manual: true, overtime: true } }, log: [] },
    });
  });

  it('keeps other reports\' rules and the log', async () => {
    await setAutoApproveRule(OWNER, '1190001', { manual: true });
    await appendAutoApproveLog(OWNER, [entry(1)]);
    await setAutoApproveRule(OWNER, '1190002', { overtime: true });
    const store = await readAutoApprove(OWNER);
    expect(store.rules).toEqual({
      '1190001': { manual: true, overtime: false },
      '1190002': { manual: false, overtime: true },
    });
    expect(store.log).toEqual([entry(1)]);
  });

  it('removes a rule once both toggles are off', async () => {
    await setAutoApproveRule(OWNER, '1190001', { manual: true });
    await setAutoApproveRule(OWNER, '1190001', { manual: false });
    expect((await readAutoApprove(OWNER)).rules).toEqual({});
  });

  it('keeps every other owner\'s rules and log (the other environment, another manager)', async () => {
    // Prod: rules for two reports, and a run logged
    await setAutoApproveRule(OWNER, '1190001', { manual: true, overtime: true });
    await setAutoApproveRule(OWNER, '1190002', { manual: true });
    await appendAutoApproveLog(OWNER, [entry(1)]);
    // Switched to QA: one QA toggle, and a QA run
    mockLoadConfig.mockResolvedValue({ ...CONFIG, useQA: true });
    await setAutoApproveRule(QA_OWNER, '5550001', { manual: true });
    await appendAutoApproveLog(QA_OWNER, [entry(2)]);
    // Another manager on this device
    mockLoadConfig.mockResolvedValue({ ...CONFIG, userId: '9999999' });
    await setAutoApproveRule(OTHER_OWNER, '1', { overtime: true });

    // Each used to replace the one stored owner: prod's toggles were all off again
    expect(await readAutoApprove(OWNER)).toEqual({
      version: 1,
      ownerKey: OWNER,
      rules: { '1190001': { manual: true, overtime: true }, '1190002': { manual: true, overtime: false } },
      log: [entry(1)],
    });
    expect(await readAutoApprove(QA_OWNER)).toMatchObject({
      rules: { '5550001': { manual: true, overtime: false } },
      log: [entry(2)],
    });
    expect((await readAutoApprove(OTHER_OWNER)).rules).toEqual({ '1': { manual: false, overtime: true } });
  });

  it('a one-owner record of an earlier build reads as that owner\'s, and is kept when another owner writes', async () => {
    await AsyncStorage.setItem(
      AUTO_APPROVE_STORE_KEY,
      JSON.stringify({ version: 1, ownerKey: OWNER, rules: { a: { manual: true, overtime: false } }, log: [entry(1)] }),
    );
    mockLoadConfig.mockResolvedValue({ ...CONFIG, useQA: true });
    await setAutoApproveRule(QA_OWNER, 'b', { manual: true });
    expect(await readAutoApprove(OWNER)).toMatchObject({ rules: { a: { manual: true, overtime: false } }, log: [entry(1)] });
    expect((await readAutoApprove(QA_OWNER)).rules).toEqual({ b: { manual: true, overtime: false } });
  });

  it('serializes concurrent writes (no lost update)', async () => {
    await Promise.all([
      setAutoApproveRule(OWNER, 'a', { manual: true }),
      setAutoApproveRule(OWNER, 'b', { overtime: true }),
      setAutoApproveRule(OWNER, 'a', { overtime: true }),
    ]);
    expect((await readAutoApprove(OWNER)).rules).toEqual({
      a: { manual: true, overtime: true },
      b: { manual: false, overtime: true },
    });
  });

  it('rejects, without writing, when the store is unreadable', async () => {
    await setAutoApproveRule(OWNER, 'a', { manual: true });
    mockAsyncStorage.setItem.mockClear();
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(setAutoApproveRule(OWNER, 'b', { manual: true })).rejects.toThrow();
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    expect((await readAutoApprove(OWNER)).rules).toEqual({ a: { manual: true, overtime: false } });
  });

  it('rejects when ownerKey is not the configured account (signed out or switched)', async () => {
    mockLoadConfig.mockResolvedValue(null);
    await expect(setAutoApproveRule(OWNER, 'a', { manual: true })).rejects.toThrow();
    mockLoadConfig.mockResolvedValue({ ...CONFIG, useQA: true });
    await expect(setAutoApproveRule(OWNER, 'a', { manual: true })).rejects.toThrow();
    expect(await stored()).toBeNull();
  });

  it('rejects when setItem fails (the toggle the user sees must be the one saved)', async () => {
    mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('full'));
    await expect(setAutoApproveRule(OWNER, 'a', { manual: true })).rejects.toThrow();
  });

  it('a write racing sign-out does not survive it', async () => {
    // Configured for the pre-check, signed out by the post-write verify.
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValue(null);
    await expect(setAutoApproveRule(OWNER, 'a', { manual: true })).rejects.toThrow();
    expect(await stored()).toBeNull();
  });

  it('a write racing a switch to the other environment never removes that environment\'s rules', async () => {
    mockLoadConfig.mockResolvedValue({ ...CONFIG, useQA: true });
    await setAutoApproveRule(QA_OWNER, 'q', { manual: true });
    // Prod for the pre-check, switched to QA by the post-write verify
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValue({ ...CONFIG, useQA: true });
    await expect(setAutoApproveRule(OWNER, 'a', { manual: true })).rejects.toThrow();
    expect((await readAutoApprove(QA_OWNER)).rules).toEqual({ q: { manual: true, overtime: false } });
  });
});

// ─── appendAutoApproveLog ────────────────────────────────────────────────────

describe('appendAutoApproveLog', () => {
  it('stores entries newest first (entries are given oldest first)', async () => {
    await appendAutoApproveLog(OWNER, [entry(1), entry(2)]);
    await appendAutoApproveLog(OWNER, [entry(3)]);
    expect((await readAutoApprove(OWNER)).log.map((e) => e.id)).toEqual(['mt-3', 'mt-2', 'mt-1']);
  });

  it(`caps the log at ${AUTO_APPROVE_LOG_CAP}, dropping the oldest`, async () => {
    const first = Array.from({ length: 40 }, (_, i) => entry(i));
    const second = Array.from({ length: 20 }, (_, i) => entry(100 + i));
    await appendAutoApproveLog(OWNER, first);
    const saved = await appendAutoApproveLog(OWNER, second);
    expect(saved?.log).toHaveLength(AUTO_APPROVE_LOG_CAP);
    expect(saved?.log[0].id).toBe('mt-119');
    expect(saved?.log[AUTO_APPROVE_LOG_CAP - 1].id).toBe('mt-10');
    expect((await stored()).owners[OWNER].log).toHaveLength(AUTO_APPROVE_LOG_CAP);
  });

  it('keeps the rules', async () => {
    await setAutoApproveRule(OWNER, 'a', { manual: true });
    await appendAutoApproveLog(OWNER, [entry(1)]);
    expect((await readAutoApprove(OWNER)).rules).toEqual({ a: { manual: true, overtime: false } });
  });

  it('keeps simulated: true on preview entries', async () => {
    await appendAutoApproveLog(OWNER, [entry(1, { simulated: true })]);
    expect((await readAutoApprove(OWNER)).log[0].simulated).toBe(true);
  });

  it('resolves null, without writing, when the owner is not configured', async () => {
    mockLoadConfig.mockResolvedValue(null);
    await expect(appendAutoApproveLog(OWNER, [entry(1)])).resolves.toBeNull();
    expect(await stored()).toBeNull();
  });

  it('resolves null, without overwriting, when the store is unreadable', async () => {
    await setAutoApproveRule(OWNER, 'a', { manual: true });
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(appendAutoApproveLog(OWNER, [entry(1)])).resolves.toBeNull();
    expect((await readAutoApprove(OWNER)).rules).toEqual({ a: { manual: true, overtime: false } });
  });

  it('never rejects when setItem fails (resolves the unpersisted store)', async () => {
    mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('full'));
    const saved = await appendAutoApproveLog(OWNER, [entry(1)]);
    expect(saved?.log).toEqual([entry(1)]);
    expect(await stored()).toBeNull();
  });

  it('never rejects even when loadConfig throws', async () => {
    mockLoadConfig.mockRejectedValue(new Error('boom'));
    await expect(appendAutoApproveLog(OWNER, [entry(1)])).resolves.toBeNull();
  });
});

// ─── Clearing ────────────────────────────────────────────────────────────────

describe('clearing', () => {
  it('clearAutoApprove removes the key', async () => {
    await setAutoApproveRule(OWNER, 'a', { manual: true });
    await clearAutoApprove();
    expect(await stored()).toBeNull();
  });

  it('sign-out (clearAll) removes the key', async () => {
    await setAutoApproveRule(OWNER, 'a', { manual: true });
    await actualConfig.clearAll();
    expect(await stored()).toBeNull();
    expect(mockAsyncStorage.multiRemove.mock.calls[0][0]).toContain(AUTO_APPROVE_STORE_KEY);
  });
});
