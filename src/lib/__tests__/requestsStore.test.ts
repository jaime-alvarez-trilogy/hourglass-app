// Tests: requestsStore — features/app/durable-data spec 02-requests-store FR3 (DD2.26-DD2.39)
// The my_requests_v1 store: readRequestsStore (never throws; ok | empty | unreadable),
// updateRequestsStore (serialized re-read → merge → prune → owner pre-check → setItem →
// owner verify; never rejects), pruneDays, buildRequestsView, composeRequestsView, and the
// clearAll() wipe.
//
// Mocks: the in-memory AsyncStorage __mocks__ (reset per test), `loadConfig` (the owner is
// checked twice per write, so the default is mockResolvedValue, not ...Once) and ../log. The
// clearAll and sign-out race cases use the real config module via jest.requireActual.
//
// The store takes `today` as an argument, so no case depends on the system clock or the
// host time zone.

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  REQUESTS_STORE_KEY,
  REQUESTS_STORE_VERSION,
  REQUESTS_RETENTION_WEEKS,
  readRequestsStore,
  updateRequestsStore,
  pruneDays,
  buildRequestsView,
  composeRequestsView,
} from '../requestsStore';
import type { MyRequestsStore, RequestsStoreOwner, StoredRequestDay } from '../requestsStore';
import { REQUESTS_RETENTION_WEEKS as PLANNER_RETENTION_WEEKS } from '../requestsPlanner';
import { loadConfig } from '../../store/config';
import { log } from '../log';
import type { CrossoverConfig } from '../../types/config';
import type { ManualRequestEntry, ManualRequestStatus } from '../../types/requests';

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
const mockWarn = log.warn as jest.Mock;

/** The view's prior-data parameter (MyRequestsData | undefined). */
type Prior = Parameters<typeof composeRequestsView>[2];

const STORE_FILE = path.resolve(__dirname, '../requestsStore.ts');
const KEY = 'my_requests_v1';

// ─── Dates ───────────────────────────────────────────────────────────────────

// A Wednesday. Its windows: currentMonday 2026-03-09, catchUpStart 2026-02-23 (the Monday
// two weeks earlier) and retentionStart 2025-09-29 (23 weeks before currentMonday, so 24
// weeks are kept).
const TODAY = '2026-03-11';
const CATCH_UP_START = '2026-02-23';
const RETENTION_START = '2025-09-29';
const BEFORE_RETENTION = '2025-09-28';

// fetchedAt values, as new Date(nowMs).toISOString() writes them.
const MON_EVENING = '2026-03-09T21:00:00.000Z';
const TUE_EVENING = '2026-03-10T21:00:00.000Z';
const WED_MORNING = '2026-03-11T14:00:00.000Z';
const WED_NOON = '2026-03-11T17:00:00.000Z';
const WED_EVENING = '2026-03-11T22:00:00.000Z';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OWNER: RequestsStoreOwner = { assignmentId: '79996', useQA: false };
const QA_OWNER: RequestsStoreOwner = { assignmentId: '79996', useQA: true };
const OTHER_OWNER: RequestsStoreOwner = { assignmentId: '80001', useQA: false };

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [{ id: '4584', name: 'Team Alpha', company: 'Acme Corp' }],
  hourlyRate: 25,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-03-08T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
};

const configFor = (owner: RequestsStoreOwner): CrossoverConfig => ({
  ...CONFIG,
  assignmentId: owner.assignmentId,
  useQA: owner.useQA,
});

function entry(date: string, memo: string, status: ManualRequestStatus = 'APPROVED'): ManualRequestEntry {
  return {
    id: `${date}|${memo}`,
    date,
    durationMinutes: 30,
    memo,
    status,
    rejectionReason: status === 'REJECTED' ? 'Not billable' : null,
  };
}

function day(
  date: string,
  fetchedAt: string,
  entries: ManualRequestEntry[] = [],
  settled = false,
): StoredRequestDay {
  return { date, fetchedAt, entries, settled };
}

function byDate(...days: StoredRequestDay[]): Record<string, StoredRequestDay> {
  return Object.fromEntries(days.map((d) => [d.date, d]));
}

function storeOf(days: StoredRequestDay[], owner: RequestsStoreOwner = OWNER): MyRequestsStore {
  return { version: 1, owner, days: byDate(...days) };
}

/** Writes a raw blob under my_requests_v1, as an earlier run left it; returns the exact string. */
async function seedRaw(raw: string): Promise<string> {
  await AsyncStorage.setItem(KEY, raw);
  mockAsyncStorage.setItem.mockClear();
  return raw;
}

function seedStore(days: StoredRequestDay[], owner: RequestsStoreOwner = OWNER): Promise<string> {
  return seedRaw(JSON.stringify(storeOf(days, owner)));
}

async function persisted(): Promise<MyRequestsStore | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as MyRequestsStore);
}

const storeWrites = () => mockAsyncStorage.setItem.mock.calls.filter(([k]) => k === KEY).length;

beforeEach(() => {
  jest.clearAllMocks();
  // Drop any unconsumed ...Once implementation, then restore the in-memory behaviour.
  mockAsyncStorage.getItem.mockReset();
  mockAsyncStorage.setItem.mockReset();
  mockAsyncStorage.removeItem.mockReset();
  mockAsyncStorage.multiRemove.mockReset();
  mockAsyncStorage._reset();
  mockLoadConfig.mockReset();
  mockLoadConfig.mockResolvedValue(CONFIG);
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe('FR3: constants', () => {
  it('the key is my_requests_v1 and the version is 1', () => {
    expect(REQUESTS_STORE_KEY).toBe('my_requests_v1');
    expect(REQUESTS_STORE_VERSION).toBe(1);
  });

  it('REQUESTS_RETENTION_WEEKS (24) is re-exported from the planner (C15)', () => {
    expect(REQUESTS_RETENTION_WEEKS).toBe(24);
    expect(REQUESTS_RETENTION_WEEKS).toBe(PLANNER_RETENTION_WEEKS);
  });
});

// ─── readRequestsStore / updateRequestsStore ─────────────────────────────────

describe('DD2.26 — round trip', () => {
  it('an update with 2 days, then a read → ok with both days, field for field', async () => {
    const tue = day('2026-03-10', TUE_EVENING, [
      entry('2026-03-10', 'Fix login bug', 'PENDING'),
      entry('2026-03-10', 'Code review', 'REJECTED'),
    ]);
    const mon = day('2026-03-09', TUE_EVENING, [entry('2026-03-09', 'Sprint planning')]);
    const expected = storeOf([tue, mon]);

    await expect(updateRequestsStore(OWNER, [tue, mon], TODAY)).resolves.toEqual(expected);
    expect(await persisted()).toEqual(expected);
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'ok', store: expected });
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it('a day with entries: [] survives the round trip as a recorded empty day', async () => {
    const emptyOpen = day('2026-03-10', TUE_EVENING, [], false);
    const emptySettled = day('2026-03-01', TUE_EVENING, [], true);

    await updateRequestsStore(OWNER, [emptyOpen, emptySettled], TODAY);

    const read = await readRequestsStore(OWNER);
    expect(read).toEqual({ status: 'ok', store: storeOf([emptyOpen, emptySettled]) });
    if (read.status !== 'ok') throw new Error('expected ok');
    expect(read.store.days['2026-03-10']).toEqual({
      date: '2026-03-10',
      fetchedAt: TUE_EVENING,
      entries: [],
      settled: false,
    });
    expect(read.store.days['2026-03-01'].settled).toBe(true);
  });

  it('an absent key reads as empty', async () => {
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'empty' });
  });
});

describe('DD2.27 — merge per date', () => {
  it('stored {d1, d2} plus fetched {d2′} → {d1, d2′}: the fetched record replaces the whole day', async () => {
    const d1 = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);
    const d2 = day('2026-03-10', TUE_EVENING, [
      entry('2026-03-10', 'Fix login bug', 'PENDING'),
      entry('2026-03-10', 'Pairing', 'PENDING'),
    ]);
    const d2Fresh = day('2026-03-10', WED_MORNING, [entry('2026-03-10', 'Fix login bug', 'APPROVED')]);
    await seedStore([d1, d2]);

    const result = await updateRequestsStore(OWNER, [d2Fresh], TODAY);

    expect(result).toEqual(storeOf([d1, d2Fresh]));
    expect(await persisted()).toEqual(storeOf([d1, d2Fresh]));
    expect(JSON.stringify((await persisted())!.days['2026-03-09'])).toBe(JSON.stringify(d1));
  });
});

describe('DD2.28 — 24-week retention', () => {
  const ancient = day(BEFORE_RETENTION, MON_EVENING, [entry(BEFORE_RETENTION, 'Ancient request')], true);
  const edge = day(RETENTION_START, MON_EVENING, [entry(RETENTION_START, 'Oldest kept')], true);
  const mon = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);

  it('a stored day before retentionStart is gone after the next update; retentionStart itself is kept', async () => {
    await seedStore([ancient, edge, mon]);
    const wed = day(TODAY, WED_MORNING);

    const result = await updateRequestsStore(OWNER, [wed], TODAY);

    expect(result).toEqual(storeOf([edge, mon, wed]));
    expect(await persisted()).toEqual(storeOf([edge, mon, wed]));
  });

  it('a fetched day before retentionStart is not stored either (prune runs after the merge)', async () => {
    const wed = day(TODAY, WED_MORNING);

    const result = await updateRequestsStore(OWNER, [ancient, wed], TODAY);

    expect(result).toEqual(storeOf([wed]));
    expect(Object.keys((await persisted())!.days)).toEqual([TODAY]);
  });

  it('pruneDays drops exactly the dates before retentionStart', () => {
    const pruned = pruneDays(byDate(ancient, edge, mon), TODAY);
    expect(pruned).toEqual(byDate(edge, mon));
  });

  it('buildRequestsView ignores out-of-retention days even before any write', () => {
    const view = buildRequestsView(byDate(ancient, edge, mon), TODAY);
    expect(view.entries).toEqual([...mon.entries, ...edge.entries]);
    expect(view.entries.map((e) => e.date)).not.toContain(BEFORE_RETENTION);
    expect(storeWrites()).toBe(0);
  });
});

describe('DD2.29 — owner isolation', () => {
  const d1 = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);
  const d2 = day('2026-03-10', TUE_EVENING, [entry('2026-03-10', 'Fix login bug', 'PENDING')]);

  it('the owner that wrote the store reads it as ok (control)', async () => {
    await seedStore([d1, d2]);
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'ok', store: storeOf([d1, d2]) });
  });

  it.each([
    ['another assignmentId', OTHER_OWNER],
    ['the other environment (useQA)', QA_OWNER],
  ])('a store owned by 79996|prod reads as empty for %s', async (_label, other) => {
    await seedStore([d1, d2]);
    await expect(readRequestsStore(other)).resolves.toEqual({ status: 'empty' });
  });

  it.each([
    ['another assignmentId', OTHER_OWNER],
    ['the other environment (useQA)', QA_OWNER],
  ])('an update by %s holds only the new owner’s fetched days', async (_label, other) => {
    await seedStore([d1, d2]);
    mockLoadConfig.mockResolvedValue(configFor(other));
    const fetched = day(TODAY, WED_MORNING, [entry(TODAY, 'QA smoke test', 'PENDING')]);

    const result = await updateRequestsStore(other, [fetched], TODAY);

    expect(result).toEqual(storeOf([fetched], other));
    expect(await persisted()).toEqual(storeOf([fetched], other));
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'empty' });
  });
});

describe('DD2.30 — unknown version and malformed data read as empty', () => {
  const d1 = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);

  it.each([
    ['version 2', JSON.stringify({ version: 2, owner: OWNER, days: byDate(d1) })],
    ['no version', JSON.stringify({ owner: OWNER, days: byDate(d1) })],
    ['corrupt JSON', '{"version":1,"owner":{"assignmentId":"79996"'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['no days object', JSON.stringify({ version: 1, owner: OWNER })],
    ['days: null', JSON.stringify({ version: 1, owner: OWNER, days: null })],
    ['no owner', JSON.stringify({ version: 1, days: byDate(d1) })],
  ])('%s → empty, without throwing', async (_label, raw) => {
    await seedRaw(raw);
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'empty' });
  });

  it.each([
    ['version 2', JSON.stringify({ version: 2, owner: OWNER, days: byDate(d1) })],
    ['corrupt JSON', '{"version":1,"owner":{"assignmentId":"79996"'],
  ])('%s: the next update overwrites it with a version-1 store of the fetched days', async (_label, raw) => {
    await seedRaw(raw);
    const fetched = day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes')]);

    const result = await updateRequestsStore(OWNER, [fetched], TODAY);

    expect(result).toEqual(storeOf([fetched]));
    expect(storeWrites()).toBe(1);
    expect(await persisted()).toEqual(storeOf([fetched]));
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'ok', store: storeOf([fetched]) });
  });

  // Review fix: the planner and the view builders read entries/fetchedAt/settled unguarded.
  const d2 = day('2026-03-10', TUE_EVENING, [entry('2026-03-10', 'Retro notes', 'PENDING')]);
  const { entries: _entries, ...noEntries } = d2;

  it.each([
    ['no entries', noEntries],
    ['entries: null', { ...d2, entries: null }],
    ['a null entry', { ...d2, entries: [null] }],
    ['fetchedAt not a string', { ...d2, fetchedAt: 0 }],
    ['no settled', { ...d2, settled: undefined }],
    ['no date', { ...d2, date: undefined }],
    ['a null day', null],
    ['a string day', 'corrupt'],
  ])('a malformed day record (%s) is dropped; the other days still read', async (_label, bad) => {
    await seedRaw(JSON.stringify({ version: 1, owner: OWNER, days: { ...byDate(d1), [d2.date]: bad } }));

    const read = await readRequestsStore(OWNER);

    expect(read).toEqual({ status: 'ok', store: storeOf([d1]) });
    if (read.status !== 'ok') throw new Error('expected ok');
    expect(() => buildRequestsView(read.store.days, TODAY)).not.toThrow();
  });

  it('the next update rewrites the store without the malformed day', async () => {
    await seedRaw(JSON.stringify({ version: 1, owner: OWNER, days: { ...byDate(d1), [d2.date]: {} } }));
    const fetched = day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes')]);

    await expect(updateRequestsStore(OWNER, [fetched], TODAY)).resolves.toEqual(storeOf([d1, fetched]));
    expect(await persisted()).toEqual(storeOf([d1, fetched]));
  });
});

describe('DD2.31 — serialized writes', () => {
  const stored = day('2026-03-02', MON_EVENING, [entry('2026-03-02', 'Retro notes')], true);
  const mon = day('2026-03-09', WED_MORNING, [entry('2026-03-09', 'Sprint planning')]);
  const wed = day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes', 'PENDING')]);

  it('two concurrent updates with different days both persist (no lost update)', async () => {
    await seedStore([stored]);

    const [first, second] = await Promise.all([
      updateRequestsStore(OWNER, [mon], TODAY),
      updateRequestsStore(OWNER, [wed], TODAY),
    ]);

    expect(await persisted()).toEqual(storeOf([stored, mon, wed]));
    // Applied in call order: the second re-read the first one's write.
    expect(first).toEqual(storeOf([stored, mon]));
    expect(second).toEqual(storeOf([stored, mon, wed]));
  });

  it('concurrent updates of the same date apply in call order: the last call wins', async () => {
    const pending = day(TODAY, WED_MORNING, [entry(TODAY, 'Pairing', 'PENDING')]);
    const approved = day(TODAY, WED_NOON, [entry(TODAY, 'Pairing', 'APPROVED')]);

    await Promise.all([
      updateRequestsStore(OWNER, [pending], TODAY),
      updateRequestsStore(OWNER, [approved], TODAY),
    ]);

    expect((await persisted())!.days[TODAY]).toEqual(approved);
  });

  it('a link whose setItem throws does not block the next write', async () => {
    mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

    const [first, second] = await Promise.all([
      updateRequestsStore(OWNER, [mon], TODAY),
      updateRequestsStore(OWNER, [wed], TODAY),
    ]);

    expect(first).toEqual(storeOf([mon])); // merged, but not persisted
    expect(second).toEqual(storeOf([wed]));
    expect(await persisted()).toEqual(storeOf([wed]));
  });

  it('a link whose owner pre-check throws does not block the next write', async () => {
    mockLoadConfig.mockRejectedValueOnce(new Error('config read failed'));

    const [first, second] = await Promise.all([
      updateRequestsStore(OWNER, [mon], TODAY),
      updateRequestsStore(OWNER, [wed], TODAY),
    ]);

    expect(first).toBeNull();
    expect(second).toEqual(storeOf([wed]));
    expect(await persisted()).toEqual(storeOf([wed]));
  });
});

describe('DD2.32 — getItem throws: unreadable, never overwritten', () => {
  it('readRequestsStore resolves unreadable and logs requests.store_read_failed without the error text', async () => {
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR manifest.json'));

    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'unreadable' });

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toBe('requests.store_read_failed');
    expect(JSON.stringify(mockWarn.mock.calls[0].slice(1))).not.toContain('SQLITE');
  });

  it('updateRequestsStore resolves null, never calls setItem, and leaves the stored data in place', async () => {
    const seeded = await seedStore([day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')])]);
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR'));

    await expect(
      updateRequestsStore(OWNER, [day(TODAY, WED_MORNING)], TODAY),
    ).resolves.toBeNull();

    expect(storeWrites()).toBe(0);
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBe(seeded);
  });
});

describe('DD2.33 — setItem throws', () => {
  it('returns the merged, pruned store and logs requests.store_write_failed; the old store is kept', async () => {
    const ancient = day(BEFORE_RETENTION, MON_EVENING, [], true);
    const mon = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);
    const seeded = await seedStore([ancient, mon]);
    const wed = day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes', 'PENDING')]);
    mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

    const result = await updateRequestsStore(OWNER, [wed], TODAY);

    expect(result).toEqual(storeOf([mon, wed]));
    expect(mockWarn).toHaveBeenCalledWith('requests.store_write_failed', {});
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(KEY)).toBe(seeded);
  });
});

describe('DD2.34 — owner pre-check before the write', () => {
  const mon = day('2026-03-09', MON_EVENING, [entry('2026-03-09', 'Sprint planning')]);
  const wed = day(TODAY, WED_MORNING);

  it.each([
    ['null (signed out mid-flight)', null],
    ['another assignmentId', configFor(OTHER_OWNER)],
    ['the other environment (useQA)', configFor(QA_OWNER)],
  ])('loadConfig → %s → null, no setItem, the stored data untouched', async (_label, config) => {
    const seeded = await seedStore([mon]);
    mockLoadConfig.mockResolvedValue(config);

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(storeWrites()).toBe(0);
    expect(await AsyncStorage.getItem(KEY)).toBe(seeded);
  });

  it('loadConfig throws → null (fail closed, C7), no setItem, never rejects', async () => {
    const seeded = await seedStore([mon]);
    mockLoadConfig.mockRejectedValue(new Error('config read failed'));

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(storeWrites()).toBe(0);
    expect(await AsyncStorage.getItem(KEY)).toBe(seeded);
  });

  it('a persisted config without useQA counts as prod (C12): a prod owner writes, a QA owner does not', async () => {
    const { useQA: _useQA, ...withoutUseQA } = CONFIG;
    mockLoadConfig.mockResolvedValue(withoutUseQA as CrossoverConfig);

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toEqual(storeOf([wed]));
    const afterProd = await AsyncStorage.getItem(KEY);
    mockAsyncStorage.setItem.mockClear();

    await expect(updateRequestsStore(QA_OWNER, [mon], TODAY)).resolves.toBeNull();
    expect(storeWrites()).toBe(0);
    expect(await AsyncStorage.getItem(KEY)).toBe(afterProd);
  });
});

describe('DD2.35 — sign-out race: write, then verify the owner', () => {
  const wed = day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes', 'PENDING')]);

  it('owner at the pre-check, null at the verify → null, removeItem(my_requests_v1), nothing left', async () => {
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValueOnce(null);

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('my_requests_v1');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('owner at the pre-check, another owner at the verify → null, the write is removed', async () => {
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValueOnce(configFor(OTHER_OWNER));

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('my_requests_v1');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('the verify throws → null, the write is removed (fail closed, C7)', async () => {
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockRejectedValueOnce(new Error('config read failed'));

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('my_requests_v1');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('the verify fails and removeItem throws too → still resolves null and logs requests.store_write_failed', async () => {
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValueOnce(null);
    mockAsyncStorage.removeItem.mockRejectedValueOnce(new Error('locked'));

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(mockWarn).toHaveBeenCalledWith('requests.store_write_failed', {});
  });

  it.each([
    ['just before setItem', 'before'],
    ['just after setItem', 'after'],
  ])('a real clearAll() landing %s leaves neither config nor store behind', async (_label, when) => {
    mockLoadConfig.mockImplementation(actualConfig.loadConfig);
    await actualConfig.saveConfig(CONFIG);
    mockAsyncStorage.setItem.mockImplementationOnce(async (key: string, value: string) => {
      if (when === 'before') await actualConfig.clearAll();
      await AsyncStorage.setItem(key, value);
      if (when === 'after') await actualConfig.clearAll();
    });

    await expect(updateRequestsStore(OWNER, [wed], TODAY)).resolves.toBeNull();

    expect(await AsyncStorage.getItem('crossover_config')).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

describe('DD2.36 — clearAll() wipes my_requests_v1', () => {
  it('the real clearAll() after a write → getItem(my_requests_v1) is null', async () => {
    await updateRequestsStore(OWNER, [day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes')])], TODAY);
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull();

    await actualConfig.clearAll();

    expect(await AsyncStorage.getItem('my_requests_v1')).toBeNull();
    await expect(readRequestsStore(OWNER)).resolves.toEqual({ status: 'empty' });
  });
});

// ─── View ────────────────────────────────────────────────────────────────────

describe('DD2.37 — buildRequestsView', () => {
  it('flattens the days newest first and keeps each day’s in-day order', () => {
    // Keys deliberately out of date order; in-day order deliberately not alphabetical.
    const days = byDate(
      day('2026-02-24', MON_EVENING, [entry('2026-02-24', 'Onboarding docs'), entry('2026-02-24', 'Bug bash')], true),
      day('2026-03-10', TUE_EVENING, [entry('2026-03-10', 'Zeta sync', 'PENDING'), entry('2026-03-10', 'Alpha review')]),
      day('2026-01-12', MON_EVENING, [entry('2026-01-12', 'Backfilled January')], true),
      day('2026-03-09', TUE_EVENING, []),
      day('2026-03-02', MON_EVENING, [entry('2026-03-02', 'Retro notes', 'REJECTED')]),
    );

    const view = buildRequestsView(days, TODAY);

    expect(view.entries.map((e) => e.id)).toEqual([
      '2026-03-10|Zeta sync',
      '2026-03-10|Alpha review',
      '2026-03-02|Retro notes',
      '2026-02-24|Onboarding docs',
      '2026-02-24|Bug bash',
      '2026-01-12|Backfilled January',
    ]);
    expect(view.entries[0]).toEqual(entry('2026-03-10', 'Zeta sync', 'PENDING'));
  });

  it('updatedAt is the max fetchedAt in catchUpStart..today; a newer fetch of an older backfilled day is ignored', () => {
    const days = byDate(
      day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes')]),
      day('2026-03-10', WED_NOON, []), // the newest window fetch is an empty day: it still counts
      day('2026-03-02', MON_EVENING, [entry('2026-03-02', 'Retro notes')]),
      day('2026-01-12', WED_EVENING, [entry('2026-01-12', 'Backfilled January')], true),
    );

    expect(buildRequestsView(days, TODAY).updatedAt).toBe(WED_NOON);
  });

  it('updatedAt counts catchUpStart itself, not the day before it', () => {
    const days = byDate(
      day(CATCH_UP_START, WED_NOON, [], true),
      day('2026-02-22', WED_EVENING, [], true),
      day('2026-03-09', MON_EVENING, []),
    );

    expect(buildRequestsView(days, TODAY).updatedAt).toBe(WED_NOON);
  });

  it('updatedAt is null when no day falls in the catch-up window', () => {
    expect(buildRequestsView({}, TODAY)).toEqual({ entries: [], updatedAt: null });

    const onlyOlder = byDate(day('2026-01-12', WED_EVENING, [entry('2026-01-12', 'Backfilled January')], true));
    expect(buildRequestsView(onlyOlder, TODAY)).toEqual({
      entries: [entry('2026-01-12', 'Backfilled January')],
      updatedAt: null,
    });
  });

  it('a stored day dated after today is outside the view (entries and updatedAt)', () => {
    const days = byDate(
      day('2026-03-12', WED_EVENING, [entry('2026-03-12', 'From a skewed clock')]),
      day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes')]),
    );

    expect(buildRequestsView(days, TODAY)).toEqual({
      entries: [entry(TODAY, 'Standup notes')],
      updatedAt: WED_MORNING,
    });
  });
});

describe('DD2.38 — composeRequestsView (view-only carry-forward)', () => {
  const days = byDate(
    day(TODAY, WED_MORNING, [entry(TODAY, 'Standup notes', 'PENDING')]),
    day('2026-03-10', WED_MORNING, []), // fetched OK, no manual slots any more
    day('2026-03-09', WED_MORNING, [entry('2026-03-09', 'Fix login bug', 'APPROVED')]),
  );

  // A legacy 1.1 blob: no ownerKey, and its own (ascending) order.
  const prior: Prior = {
    entries: [
      entry(BEFORE_RETENTION, 'Ancient request'),
      entry(RETENTION_START, 'Oldest kept'),
      entry('2026-02-25', 'Carried A', 'PENDING'),
      entry('2026-02-25', 'Carried B'),
      entry('2026-03-03', 'Carried C', 'REJECTED'),
      entry('2026-03-09', 'Fix login bug', 'PENDING'),
      entry('2026-03-10', 'Deleted request', 'PENDING'),
    ],
    error: null,
  };

  it('keeps prior entries whose date has no record, re-sorted by date desc with in-day order kept', () => {
    const ids = composeRequestsView(days, TODAY, prior).map((e) => e.id);

    expect(ids).toEqual([
      `${TODAY}|Standup notes`,
      '2026-03-09|Fix login bug',
      '2026-03-03|Carried C',
      '2026-02-25|Carried A',
      '2026-02-25|Carried B',
      `${RETENTION_START}|Oldest kept`,
    ]);
  });

  it('drops a prior entry whose date has a record, even an empty one: the stored record wins', () => {
    const result = composeRequestsView(days, TODAY, prior);

    expect(result.filter((e) => e.date === '2026-03-10')).toEqual([]);
    expect(result.filter((e) => e.date === '2026-03-09')).toEqual([
      entry('2026-03-09', 'Fix login bug', 'APPROVED'),
    ]);
  });

  it('drops a prior entry older than retentionStart; retentionStart itself is kept', () => {
    const dates = composeRequestsView(days, TODAY, prior).map((e) => e.date);

    expect(dates).not.toContain(BEFORE_RETENTION);
    expect(dates).toContain(RETENTION_START);
  });

  it('with no prior → exactly buildRequestsView(days, today).entries', () => {
    expect(composeRequestsView(days, TODAY, undefined)).toEqual(buildRequestsView(days, TODAY).entries);
    expect(composeRequestsView(days, TODAY, undefined).map((e) => e.id)).toEqual([
      `${TODAY}|Standup notes`,
      '2026-03-09|Fix login bug',
    ]);
  });

  it('is view-only: the days passed in gain no carried entries', () => {
    const before = JSON.stringify(days);
    composeRequestsView(days, TODAY, prior);
    expect(JSON.stringify(days)).toBe(before);
  });
});

// ─── Source check ────────────────────────────────────────────────────────────

describe('DD2.39 — source check', () => {
  it('requestsStore.ts sorts the view (takes over SC12)', () => {
    const source = fs.readFileSync(STORE_FILE, 'utf8');
    expect(source).toMatch(/sort/);
  });
});
