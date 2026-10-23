// Tests: useRequestsBackfill — features/app/durable-data spec 05-requests-backfill
// FR2 (DD5.9-DD5.23): runRequestsBackfill, the week-by-week runner. Each loop plans the
// newest week with missing dates (planBackfillWeek), checks the owner, fetches those dates,
// merges the days that came back through updateRequestsStore, then pauses. It stops on a
// fully failed week, a non-retryable AuthError, a 429, a sign-out or owner change, an
// unreadable store or the session cap, and never writes a failed day.
// FR3 (DD5.24-DD5.34): startRequestsBackfillOnce, the session gate. At most one run per
// JS session per owner (assignmentId|env), never for a signed-out user, the dev-mock
// manager preview or a missing keychain entry, and it never rejects. After each stored
// week it rebuilds the visible ['myRequests', assignmentId] view, but only a successful
// same-owner (or legacy) one, keeping its error state and dataUpdatedAt.
// FR4 (DD5.35): useRequestsBackfill, the Requests screen's hook. It schedules the gate
// BACKFILL_START_DELAY_MS after mount, or after the owner changes while mounted, never for a
// signed-out user or the preview; unmounting clears a pending timer, a started run continues.
//
// The runner is driven against the real planner and the real my_requests_v1 store on the
// in-memory AsyncStorage __mocks__ (reset before every case), with `fetchWorkDiary`,
// `loadConfig` / `loadCredentials` and ../../lib/log mocked. `loadConfig` uses
// mockResolvedValue (not ...Once): the runner checks the owner before every week and the
// store checks it twice per write. `today`, `nowMs` and `sleep` are injected, so no case
// waits, reads the system clock or depends on the host time zone (expected dates come from
// the UTC calendar helpers below, independent of the module under test). The gate cases use
// a real QueryClient (no retries, no GC timers) and clear the session flag before each case.
// The hook cases render a probe component under a QueryClientProvider with
// react-test-renderer, with `useConfig` mocked and fake timers whose clock is local noon of
// TODAY (the hook passes the gate no deps, so it plans from the system clock and pauses with
// the default setTimeout-based sleep).

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../useConfig', () => ({
  useConfig: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { loadConfig, loadCredentials } from '../../store/config';
import { useConfig } from '../useConfig';
import { fetchWorkDiary } from '../../api/workDiary';
import { ApiError, AuthError, NetworkError, AUTH_HTML_500, AUTH_LOGIN_LATCHED } from '../../api/errors';
import { log } from '../../lib/log';
import * as planner from '../../lib/requestsPlanner';
import { invalidateAuthToken } from '../../api/client';
import {
  BACKFILL_START_DELAY_MS,
  BACKFILL_WEEK_PAUSE_MS,
  __resetBackfillSessionForTests,
  runRequestsBackfill,
  startRequestsBackfillOnce,
  useRequestsBackfill,
} from '../useRequestsBackfill';
import type { BackfillDeps, BackfillResult } from '../useRequestsBackfill';
import type { MyRequestsStore, RequestsStoreOwner, StoredRequestDay } from '../../lib/requestsStore';
import type { WorkDiarySlot } from '../../types/api';
import type { CrossoverConfig } from '../../types/config';
import type { ManualRequestEntry, ManualRequestStatus, MyRequestsData } from '../../types/requests';

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;
const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockUseConfig = useConfig as jest.MockedFunction<typeof useConfig>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockInfo = log.info as jest.Mock;
const mockError = log.error as jest.Mock;

// ─── Owner and config ────────────────────────────────────────────────────────

const KEY = 'my_requests_v1';
const CREDS = { username: 'user@example.com', password: 'pass123' };

const OWNER: RequestsStoreOwner = { assignmentId: '79996', useQA: false };
const QA_OWNER: RequestsStoreOwner = { assignmentId: '79996', useQA: true };

const CONFIG: CrossoverConfig = {
  userId: '1190137',
  fullName: 'Test User',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [{ id: '4584', name: 'Team Alpha', company: 'Acme Corp' }],
  hourlyRate: 30,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-10-19T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
};
const QA_CONFIG: CrossoverConfig = { ...CONFIG, useQA: true };
const OTHER_CONFIG: CrossoverConfig = { ...CONFIG, assignmentId: '80001' };

// ─── Calendar oracle (UTC arithmetic, host-zone independent) ─────────────────

/** `date` shifted by `n` calendar days. */
function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive `from..to`, oldest first. */
function asc(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shift(d, 1)) out.push(d);
  return out;
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shift(date, -(dow === 0 ? 6 : dow - 1));
}

/** The Mon-Sun week starting at `monday`, ascending. */
const weekOf = (monday: string): string[] => asc(monday, shift(monday, 6));

/** The Mondays in `from..to`, newest first (the backfill's week order). */
const mondaysIn = (from: string, to: string): string[] =>
  asc(from, to).filter((d) => mondayOf(d) === d).reverse();

// ─── Dates and clock ─────────────────────────────────────────────────────────

// A Wednesday. catchUpStart 2026-10-05 and retentionStart 2026-05-11, so the backfill range
// 2026-05-11..2026-10-04 holds 21 weeks (147 days), newest Monday 2026-09-28.
const TODAY = '2026-10-21';
const NEWEST_MONDAY = '2026-09-28';
const SECOND_MONDAY = '2026-09-21';
const OLDEST_MONDAY = '2026-05-11';
const LAST_BACKFILL_DAY = '2026-10-04';
const ALL_BACKFILL_DATES = asc(OLDEST_MONDAY, LAST_BACKFILL_DAY);
const BACKFILL_MONDAYS = mondaysIn(OLDEST_MONDAY, NEWEST_MONDAY);
/** Thursday of the newest backfill week. */
const WEEK1_THU = '2026-10-01';

/** The injected clock: local noon of TODAY. Every fetchedAt the runner writes comes from it. */
const NOW_MS = Date.parse(`${TODAY}T12:00:00`);
const FETCHED_AT = new Date(NOW_MS).toISOString();
/** fetchedAt of records an earlier run left behind. */
const SEEDED_AT = new Date(Date.parse('2026-10-20T09:00:00')).toISOString();

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal WorkDiarySlot: only the fields groupSlotsIntoEntries reads are varied. */
function makeSlot(overrides: Pick<WorkDiarySlot, 'autoTracker' | 'status' | 'memo' | 'actions'>): WorkDiarySlot {
  return {
    tags: [],
    date: '2026-09-29T12:00:00Z',
    time: '12:00:00',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    ...overrides,
  };
}

/** A 10-minute manual-time slot. */
function manual(memo: string, status: ManualRequestStatus): WorkDiarySlot {
  return makeSlot({ autoTracker: false, status, memo, actions: [] });
}

/** A rejected manual-time slot carrying the manager's comment. */
function rejected(memo: string, comment: string): WorkDiarySlot {
  return makeSlot({
    autoTracker: false,
    status: 'REJECTED',
    memo,
    actions: [{ actionType: 'REJECT_MANUAL_TIME', comment, actionMadeBy: 2372227, createdDate: '2026-06-04T10:00:00Z' }],
  });
}

/** Tracked (non-manual) time: never a request. */
function tracked(): WorkDiarySlot {
  return makeSlot({ autoTracker: true, status: 'APPROVED', memo: '', actions: [] });
}

/** An entry as groupSlotsIntoEntries builds it from `slots` 10-minute slots of one memo. */
function entry(
  date: string,
  memo: string,
  status: ManualRequestStatus,
  slots = 1,
  rejectionReason: string | null = null,
): ManualRequestEntry {
  return { id: `${date}|${memo}`, date, durationMinutes: slots * 10, memo, status, rejectionReason };
}

/** A recorded day with no requests, as the runner stores a resolved `[]` (or as seeded). */
function emptyDay(date: string, fetchedAt: string = FETCHED_AT): StoredRequestDay {
  return { date, fetchedAt, entries: [], settled: true };
}

const byDate = (days: StoredRequestDay[]): Record<string, StoredRequestDay> =>
  Object.fromEntries(days.map((d) => [d.date, d]));

// ─── Store helpers ───────────────────────────────────────────────────────────

/** Writes my_requests_v1 as an earlier run left it; returns the exact string. */
async function seedStore(days: StoredRequestDay[], owner: RequestsStoreOwner = OWNER): Promise<string> {
  const store: MyRequestsStore = { version: 1, owner, days: byDate(days) };
  const raw = JSON.stringify(store);
  await AsyncStorage.setItem(KEY, raw);
  mockAsyncStorage.setItem.mockClear();
  return raw;
}

async function readRaw(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

async function readStore(): Promise<MyRequestsStore | null> {
  const raw = await readRaw();
  return raw === null ? null : (JSON.parse(raw) as MyRequestsStore);
}

async function storedDates(): Promise<string[]> {
  return Object.keys((await readStore())?.days ?? {}).sort();
}

/** The strings written to my_requests_v1, in order. */
function storeWrites(): string[] {
  return mockAsyncStorage.setItem.mock.calls.filter(([k]) => k === KEY).map(([, v]) => v as string);
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

/** Dates passed to fetchWorkDiary, in call order. */
function calledDates(): string[] {
  return mockFetchWorkDiary.mock.calls.map((c) => c[1] as string);
}

/** The Monday of each fetched date in call order, consecutive repeats collapsed: one per week fetched. */
function fetchedMondays(): string[] {
  return calledDates()
    .map(mondayOf)
    .filter((m, i, all) => i === 0 || all[i - 1] !== m);
}

type DayResult = WorkDiarySlot[] | Error | undefined | null | Record<string, unknown>;

/** fetchWorkDiary per date (else `[]`): an Error rejects, anything else resolves as given. */
function serveDiary(results: Record<string, DayResult>): void {
  mockFetchWorkDiary.mockImplementation(async (_id, date) => {
    const r = Object.prototype.hasOwnProperty.call(results, date) ? results[date] : [];
    if (r instanceof Error) throw r;
    return r as WorkDiarySlot[];
  });
}

/** `{ [date]: result }` for every date in `dates`. */
const each = (dates: string[], result: DayResult): Record<string, DayResult> =>
  Object.fromEntries(dates.map((d) => [d, result]));

// ─── Runner helpers ──────────────────────────────────────────────────────────

// Resolves on the next macrotask, not at once: a runaway loop then still lets jest's timeout fire.
const sleep = jest.fn((_ms: number): Promise<void> => new Promise<void>((r) => setImmediate(r)));
const onWeekStored = jest.fn((_store: MyRequestsStore): void => {});

function deps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return { today: TODAY, nowMs: () => NOW_MS, sleep, onWeekStored, ...overrides };
}

function run(overrides: Partial<BackfillDeps> = {}, owner: RequestsStoreOwner = OWNER): Promise<BackfillResult> {
  return runRequestsBackfill(owner, CREDS, deps(overrides));
}

const result = (
  weeksStored: number,
  daysStored: number,
  daysFailed: number,
  stopReason: BackfillResult['stopReason'],
): BackfillResult => ({ weeksStored, daysStored, daysFailed, stopReason });

const COMPLETE_RUN = result(21, 147, 0, 'complete');

/** Meta of every log.info('requests.backfill_done', …) call. */
function doneLogs(): unknown[] {
  return mockInfo.mock.calls.filter(([c]) => c === 'requests.backfill_done').map(([, meta]) => meta);
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  settled: boolean;
}

function deferred<T>(): Deferred<T> {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    settle = r;
  });
  const d: Deferred<T> = {
    promise,
    settled: false,
    resolve: (value) => {
      d.settled = true;
      settle(value);
    },
  };
  return d;
}

/** Lets every pending promise chain run (the AsyncStorage and config mocks resolve on microtasks). */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAsyncStorage._reset();
  mockLoadConfig.mockReset();
  mockLoadConfig.mockResolvedValue(CONFIG);
  mockFetchWorkDiary.mockReset();
  mockFetchWorkDiary.mockResolvedValue([]);
});

// ─── FR2 ─────────────────────────────────────────────────────────────────────

describe('FR2: constants', () => {
  it('starts 5 s after mount and pauses 500 ms between weeks', () => {
    expect(BACKFILL_START_DELAY_MS).toBe(5_000);
    expect(BACKFILL_WEEK_PAUSE_MS).toBe(500);
  });
});

describe('DD5.9 — an empty store is backfilled week by week, newest first, to retentionStart', () => {
  it('every fetch resolving [] → 21 weeks, 147 days, nothing failed, complete', async () => {
    await expect(run()).resolves.toEqual(COMPLETE_RUN);
  });

  it('stores all 147 days of 2026-05-11..2026-10-04 as settled empty days stamped with nowMs', async () => {
    await run();

    const stored = await readStore();
    expect(stored).not.toBeNull();
    expect(stored!.version).toBe(1);
    expect(stored!.owner).toEqual(OWNER);
    expect(stored!.days).toEqual(byDate(ALL_BACKFILL_DATES.map((d) => emptyDay(d))));
  });

  it('fetches each date once, one whole week at a time, from the 2026-09-28 week down to the 2026-05-11 week', async () => {
    await run();

    // Each date exactly once; a week's dates are contiguous (one collapsed Monday per week)
    expect([...calledDates()].sort()).toEqual(ALL_BACKFILL_DATES);
    expect(fetchedMondays()).toEqual(BACKFILL_MONDAYS);
  });

  it.each<[string, RequestsStoreOwner, CrossoverConfig]>([
    ['prod', OWNER, CONFIG],
    ['QA', QA_OWNER, QA_CONFIG],
  ])("%s: every fetch gets the owner's assignmentId, the credentials and the owner's environment", async (_label, owner, config) => {
    mockLoadConfig.mockResolvedValue(config);
    serveDiary(each(weekOf(NEWEST_MONDAY), undefined)); // one week is enough here

    await run({}, owner);

    expect(mockFetchWorkDiary.mock.calls).toEqual(
      weekOf(NEWEST_MONDAY).map((d) => [owner.assignmentId, d, CREDS, owner.useQA]),
    );
  });

  it('pauses BACKFILL_WEEK_PAUSE_MS after each of the 21 weeks', async () => {
    await run();
    expect(sleep.mock.calls).toEqual(Array.from({ length: 21 }, () => [BACKFILL_WEEK_PAUSE_MS]));
  });

  it('hands onWeekStored the merged store after each week has been written', async () => {
    const writesSeen: number[] = [];
    const seen = jest.fn((_store: MyRequestsStore) => {
      writesSeen.push(storeWrites().length);
    });

    await run({ onWeekStored: seen });

    expect(seen).toHaveBeenCalledTimes(21);
    // Called once per week, after that week's write
    expect(writesSeen).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    // Each call carries the whole merged store: 7 more days every week
    expect(seen.mock.calls.map(([s]) => Object.keys(s.days).length)).toEqual(
      Array.from({ length: 21 }, (_, i) => 7 * (i + 1)),
    );
    expect(Object.keys(seen.mock.calls[0][0].days).sort()).toEqual(weekOf(NEWEST_MONDAY));
    expect(seen.mock.calls[20][0]).toEqual(await readStore());
  });

  it('runs without an onWeekStored (it is optional)', async () => {
    await expect(run({ onWeekStored: undefined })).resolves.toEqual(COMPLETE_RUN);
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES);
  });
});

describe('DD5.10 — backfilled days keep their requests, and settle unless one is PENDING', () => {
  it('PENDING → stored with that entry and settled: false; APPROVED or REJECTED → settled: true', async () => {
    serveDiary({
      '2026-09-29': [manual('Backfilled pending', 'PENDING'), manual('Backfilled pending', 'PENDING'), tracked()],
      '2026-07-15': [manual('Backfilled approved', 'APPROVED'), tracked()],
      '2026-06-03': [rejected('Backfilled rejected', 'Not billable')],
    });

    await expect(run()).resolves.toEqual(COMPLETE_RUN);

    const { days } = (await readStore())!;
    expect(days['2026-09-29']).toEqual({
      date: '2026-09-29',
      fetchedAt: FETCHED_AT,
      entries: [entry('2026-09-29', 'Backfilled pending', 'PENDING', 2)],
      settled: false,
    });
    expect(days['2026-07-15']).toEqual({
      date: '2026-07-15',
      fetchedAt: FETCHED_AT,
      entries: [entry('2026-07-15', 'Backfilled approved', 'APPROVED')],
      settled: true,
    });
    expect(days['2026-06-03']).toEqual({
      date: '2026-06-03',
      fetchedAt: FETCHED_AT,
      entries: [entry('2026-06-03', 'Backfilled rejected', 'REJECTED', 1, 'Not billable')],
      settled: true,
    });
  });
});

describe('DD5.11 — dates that already have a record are never requested', () => {
  it('the 10 newest backfill weeks prefilled → only the other 11 weeks are fetched (77 calls)', async () => {
    const prefilled = asc('2026-07-27', LAST_BACKFILL_DAY);
    expect(prefilled).toHaveLength(70);
    await seedStore(prefilled.map((d) => emptyDay(d, SEEDED_AT)));

    await expect(run()).resolves.toEqual(result(11, 77, 0, 'complete'));

    expect(calledDates()).toHaveLength(77);
    expect([...calledDates()].sort()).toEqual(asc(OLDEST_MONDAY, '2026-07-26'));
    expect(calledDates().filter((d) => prefilled.includes(d))).toEqual([]);
    expect(fetchedMondays()).toEqual(mondaysIn(OLDEST_MONDAY, '2026-07-20'));
    // The prefilled records are kept as they were, not re-stamped
    const { days } = (await readStore())!;
    for (const d of prefilled) expect(days[d]).toEqual(emptyDay(d, SEEDED_AT));
  });

  it('every backfill date already recorded → no request, no write, no pause (the steady state, C11)', async () => {
    const raw = await seedStore(ALL_BACKFILL_DATES.map((d) => emptyDay(d, SEEDED_AT)));

    await expect(run()).resolves.toEqual(result(0, 0, 0, 'complete'));

    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(storeWrites()).toEqual([]);
    expect(await readRaw()).toBe(raw);
    expect(sleep).not.toHaveBeenCalled();
    expect(onWeekStored).not.toHaveBeenCalled();
  });

  it("another owner's records do not count (an environment switch, C10): every date is fetched for the new owner", async () => {
    await seedStore(ALL_BACKFILL_DATES.map((d) => emptyDay(d, SEEDED_AT)), OWNER);
    mockLoadConfig.mockResolvedValue(QA_CONFIG);

    await expect(run({}, QA_OWNER)).resolves.toEqual(COMPLETE_RUN);

    expect([...calledDates()].sort()).toEqual(ALL_BACKFILL_DATES);
    expect(mockFetchWorkDiary.mock.calls.every(([, , , useQA]) => useQA === true)).toBe(true);
    // The prod records were replaced, not merged: the store is now the QA owner's, stamped by this run
    const stored = (await readStore())!;
    expect(stored.owner).toEqual(QA_OWNER);
    expect(stored.days).toEqual(byDate(ALL_BACKFILL_DATES.map((d) => emptyDay(d))));
  });
});

describe('DD5.12 — a partial week stores what came back and the run moves on', () => {
  const FAILED = ['2026-09-30', '2026-10-02'];

  it('2 dates reject NetworkError → the other 5 are stored, daysFailed: 2, and the run completes', async () => {
    serveDiary(each(FAILED, new NetworkError('Connection reset')));

    await expect(run()).resolves.toEqual(result(21, 145, 2, 'complete'));

    // The failed dates have no record; every other date does
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES.filter((d) => !FAILED.includes(d)));
    // The first week's write held its 5 fulfilled days, and the next week followed
    expect(Object.keys(onWeekStored.mock.calls[0][0].days).sort()).toEqual(
      weekOf(NEWEST_MONDAY).filter((d) => !FAILED.includes(d)),
    );
    expect(fetchedMondays()).toEqual(BACKFILL_MONDAYS);
    expect(sleep).toHaveBeenCalledTimes(21);
  });

  it('a second run (new session, same store) requests exactly those 2 dates and nothing else', async () => {
    serveDiary(each(FAILED, new NetworkError('Connection reset')));
    await run();
    jest.clearAllMocks();
    mockFetchWorkDiary.mockResolvedValue([]);

    await expect(run()).resolves.toEqual(result(1, 2, 0, 'complete'));

    expect([...calledDates()].sort()).toEqual(FAILED);
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES);
  });

  it("one failed date in every week → 'complete' (nothing left to try this session, C5), not 'cap'", async () => {
    const wednesdays = BACKFILL_MONDAYS.map((m) => shift(m, 2));
    serveDiary(each(wednesdays, new NetworkError('Connection reset')));

    await expect(run()).resolves.toEqual(result(21, 126, 21, 'complete'));

    expect(calledDates()).toHaveLength(147);
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES.filter((d) => !wednesdays.includes(d)));
  });
});

describe('DD5.13 — a day that resolves without a slot array is a failed day, never written', () => {
  it('3 dates resolve undefined (empty body) and 4 resolve [] → the 4 are stored as empty days, the 3 have no record', async () => {
    const EMPTY_BODY = ['2026-09-28', '2026-09-30', '2026-10-03'];
    const CONFIRMED = ['2026-09-29', '2026-10-01', '2026-10-02', '2026-10-04'];
    serveDiary(each(EMPTY_BODY, undefined));

    await expect(run()).resolves.toEqual(result(21, 144, 3, 'complete'));

    const { days } = (await readStore())!;
    for (const d of CONFIRMED) expect(days[d]).toEqual(emptyDay(d));
    for (const d of EMPTY_BODY) expect(days).not.toHaveProperty(d);
  });

  it('null or a non-array object counts as failed too', async () => {
    serveDiary({ '2026-09-28': null, '2026-09-29': { content: [] } });

    await expect(run()).resolves.toEqual(result(21, 145, 2, 'complete'));

    const { days } = (await readStore())!;
    expect(days).not.toHaveProperty('2026-09-28');
    expect(days).not.toHaveProperty('2026-09-29');
  });
});

describe("DD5.14 — a week where no day comes back stops the run with 'week-failed', writing nothing", () => {
  it.each<[string, DayResult]>([
    ['all 7 reject NetworkError', new NetworkError('Network request failed')],
    ['all 7 resolve undefined (empty body)', undefined],
  ])('%s in the second week → earlier weeks kept, store byte-identical, no later week fetched', async (_label, failure) => {
    serveDiary(each(weekOf(SECOND_MONDAY), failure));

    await expect(run()).resolves.toEqual(result(1, 7, 7, 'week-failed'));

    // Only week 1 was ever written, and the store still holds exactly that write
    const writes = storeWrites();
    expect(writes).toHaveLength(1);
    expect(await readRaw()).toBe(writes[0]);
    expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY));
    // Weeks 1 and 2 were requested, nothing after
    expect(calledDates()).toHaveLength(14);
    expect(fetchedMondays()).toEqual([NEWEST_MONDAY, SECOND_MONDAY]);
    expect(onWeekStored).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('the very first week failing → nothing is written at all', async () => {
    serveDiary(each(weekOf(NEWEST_MONDAY), new NetworkError('Network request failed')));

    await expect(run()).resolves.toEqual(result(0, 0, 7, 'week-failed'));

    expect(storeWrites()).toEqual([]);
    expect(await readRaw()).toBeNull();
    expect(calledDates()).toHaveLength(7);
    expect(onWeekStored).not.toHaveBeenCalled();
  });
});

describe("DD5.15 — a non-retryable AuthError stops the run with 'auth' after storing the week", () => {
  it.each<[string, AuthError]>([
    ['AuthError(401)', new AuthError(401)],
    ['AuthError(403)', new AuthError(403)],
    ['a latched login', new AuthError(401, 'Login latched', { errorCode: AUTH_LOGIN_LATCHED })],
  ])('one date rejects %s → the 6 fulfilled days are stored, no further fetch', async (_label, err) => {
    serveDiary({ [WEEK1_THU]: err });

    await expect(run()).resolves.toEqual(result(1, 6, 1, 'auth'));

    expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY).filter((d) => d !== WEEK1_THU));
    expect(calledDates()).toHaveLength(7);
    expect(onWeekStored).toHaveBeenCalledTimes(1);
  });

  it("every date rejecting AuthError(401) → 'auth' (not 'week-failed'), nothing written", async () => {
    serveDiary(each(weekOf(NEWEST_MONDAY), new AuthError(401)));

    await expect(run()).resolves.toEqual(result(0, 0, 7, 'auth'));

    expect(storeWrites()).toEqual([]);
    expect(calledDates()).toHaveLength(7);
  });

  it('an AuthError with AUTH_HTML_500 (an outage, retryable) on one date does not stop the run', async () => {
    serveDiary({ [WEEK1_THU]: new AuthError(401, 'HTML 500', { errorCode: AUTH_HTML_500 }) });

    await expect(run()).resolves.toEqual(result(21, 146, 1, 'complete'));

    expect(calledDates()).toHaveLength(147);
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES.filter((d) => d !== WEEK1_THU));
  });
});

describe("DD5.16 — a 429 stops the run with 'throttled' after storing the week", () => {
  it("one date rejects ApiError(429) → the fulfilled days are stored, no further fetch", async () => {
    serveDiary({ [WEEK1_THU]: new ApiError(429) });

    await expect(run()).resolves.toEqual(result(1, 6, 1, 'throttled'));

    expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY).filter((d) => d !== WEEK1_THU));
    expect(calledDates()).toHaveLength(7);
  });

  it("every date rejecting ApiError(429) → 'throttled' (not 'week-failed'), nothing written", async () => {
    serveDiary(each(weekOf(NEWEST_MONDAY), new ApiError(429)));

    await expect(run()).resolves.toEqual(result(0, 0, 7, 'throttled'));

    expect(storeWrites()).toEqual([]);
    expect(calledDates()).toHaveLength(7);
  });

  it("an AuthError(401) and a 429 in the same week → 'auth' (checked first)", async () => {
    serveDiary({ '2026-09-29': new ApiError(429), [WEEK1_THU]: new AuthError(401) });

    await expect(run()).resolves.toEqual(result(1, 5, 2, 'auth'));
  });

  it.each<[string, ApiError]>([
    ['ApiError(503)', new ApiError(503)],
    ['a per-date ApiError(400) CROS-0400', new ApiError(400, 'Bad request', { errorCode: 'CROS-0400' })],
  ])('one date rejecting %s is a failed day only: the run continues', async (_label, err) => {
    serveDiary({ [WEEK1_THU]: err });

    await expect(run()).resolves.toEqual(result(21, 146, 1, 'complete'));
    expect(calledDates()).toHaveLength(147);
  });
});

describe("DD5.17 — a sign-out or owner change stops the run with 'signed-out' before the next fetch", () => {
  it.each<[string, CrossoverConfig | null | Error]>([
    ['another assignment', OTHER_CONFIG],
    ['signed out (null config)', null],
    ['the environment switched (useQA flipped)', QA_CONFIG],
    ['config unreadable (loadConfig rejects)', new Error('AsyncStorage failure')],
  ])('loadConfig switches to %s after week 1 → no second-week fetch, no further write', async (_label, after) => {
    let switched = false;
    mockLoadConfig.mockImplementation(async () => {
      if (!switched) return CONFIG;
      if (after instanceof Error) throw after;
      return after;
    });
    const switchAfterWeek = jest.fn((_store: MyRequestsStore) => {
      switched = true;
    });

    await expect(run({ onWeekStored: switchAfterWeek })).resolves.toEqual(result(1, 7, 0, 'signed-out'));

    expect(calledDates()).toHaveLength(7);
    expect(fetchedMondays()).toEqual([NEWEST_MONDAY]);
    expect(storeWrites()).toHaveLength(1);
  });

  it('an owner that is not configured when the run starts → no fetch and no write', async () => {
    mockLoadConfig.mockResolvedValue(null);

    await expect(run()).resolves.toEqual(result(0, 0, 0, 'signed-out'));

    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(storeWrites()).toEqual([]);
  });

  it('a sign-out while a week is in flight → that week is not written (the store refuses it), no further fetch', async () => {
    let signedOut = false;
    mockLoadConfig.mockImplementation(async () => (signedOut ? null : CONFIG));
    mockFetchWorkDiary.mockImplementation(async (_id, date) => {
      if (mondayOf(date) === SECOND_MONDAY) signedOut = true;
      return [];
    });

    await expect(run()).resolves.toEqual(result(1, 7, 0, 'signed-out'));

    expect(fetchedMondays()).toEqual([NEWEST_MONDAY, SECOND_MONDAY]);
    expect(calledDates()).toHaveLength(14);
    expect(storeWrites()).toHaveLength(1);
    expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY));
    expect(onWeekStored).toHaveBeenCalledTimes(1);
  });
});

describe("DD5.18 — an unreadable store stops the run with 'unreadable' before any fetch", () => {
  it('AsyncStorage.getItem rejects → no fetch and no write', async () => {
    mockAsyncStorage.getItem.mockRejectedValue(new Error('disk I/O error'));

    await expect(run()).resolves.toEqual(result(0, 0, 0, 'unreadable'));

    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    expect(onWeekStored).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("DD5.19 — the session cap (C4) stops a runaway planner with 'cap'", () => {
  it('a planner that ignores skip (always the same week) → stops after exactly 21 attempted weeks', async () => {
    // It gives up after 30 plans, so a runner without the cap ends 'complete' instead of spinning
    let plans = 0;
    const spy = jest
      .spyOn(planner, 'planBackfillWeek')
      .mockImplementation(() => (++plans > 30 ? null : { monday: NEWEST_MONDAY, dates: weekOf(NEWEST_MONDAY) }));
    try {
      const capped = result(21, 147, 0, 'cap');
      await expect(run()).resolves.toEqual(capped);

      expect(calledDates()).toHaveLength(21 * 7);
      expect(new Set(calledDates())).toEqual(new Set(weekOf(NEWEST_MONDAY)));
      expect(doneLogs()).toEqual([capped]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('DD5.20 — weeks never overlap', () => {
  it('the next week starts only after every fetch of this one settled, was merged and the pause ended', async () => {
    const fetches: { date: string; d: Deferred<WorkDiarySlot[] | undefined> }[] = [];
    let maxPending = 0;
    mockFetchWorkDiary.mockImplementation((_id, date) => {
      const d = deferred<WorkDiarySlot[] | undefined>();
      fetches.push({ date, d });
      maxPending = Math.max(maxPending, fetches.filter((f) => !f.d.settled).length);
      return d.promise as Promise<WorkDiarySlot[]>;
    });
    const pauses: Deferred<void>[] = [];
    const pause = jest.fn((_ms: number) => {
      const d = deferred<void>();
      pauses.push(d);
      return d.promise;
    });

    const done = run({ sleep: pause });
    await flush();

    // Week 1: all 7 dates requested together
    expect(fetches.map((f) => f.date).sort()).toEqual(weekOf(NEWEST_MONDAY));

    // 6 of 7 settled: still waiting on the last one
    fetches.slice(0, 6).forEach((f) => f.d.resolve([]));
    await flush();
    expect(fetches).toHaveLength(7);
    expect(storeWrites()).toHaveLength(0);
    expect(pause).not.toHaveBeenCalled();

    // All 7 settled: merged, then the pause; week 2 waits for it
    fetches[6].d.resolve([]);
    await flush();
    expect(storeWrites()).toHaveLength(1);
    expect(pause.mock.calls).toEqual([[BACKFILL_WEEK_PAUSE_MS]]);
    await flush();
    expect(fetches).toHaveLength(7);

    // The pause ends: week 2 starts
    pauses[0].resolve();
    await flush();
    expect(fetches).toHaveLength(14);
    expect(fetches.slice(7).map((f) => f.date).sort()).toEqual(weekOf(SECOND_MONDAY));

    // Week 2 fails entirely, which ends the run
    fetches.slice(7).forEach((f) => f.d.resolve(undefined));
    await expect(done).resolves.toEqual(result(1, 7, 7, 'week-failed'));
    expect(maxPending).toBe(7);
  });
});

describe('DD5.21 — a later session plans from the moved windows', () => {
  const NEXT_TODAY = '2026-10-28'; // catchUpStart 2026-10-12, retentionStart 2026-05-18
  const UNCOVERED_MONDAY = '2026-10-05';

  it('today one week later → only the newly uncovered 2026-10-05 week is fetched, nothing below retentionStart', async () => {
    await expect(run()).resolves.toEqual(COMPLETE_RUN);
    jest.clearAllMocks();
    mockFetchWorkDiary.mockResolvedValue([]);

    await expect(run({ today: NEXT_TODAY })).resolves.toEqual(result(1, 7, 0, 'complete'));

    expect([...calledDates()].sort()).toEqual(weekOf(UNCOVERED_MONDAY));
    // The write pruned the week that fell out of retention; it is not re-fetched
    expect(await storedDates()).toEqual(asc('2026-05-18', '2026-10-11'));
  });

  it('the foreground window already filled the uncovered week → no request at all', async () => {
    const raw = await seedStore(asc(OLDEST_MONDAY, '2026-10-27').map((d) => emptyDay(d, SEEDED_AT)));

    await expect(run({ today: NEXT_TODAY })).resolves.toEqual(result(0, 0, 0, 'complete'));

    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(await readRaw()).toBe(raw);
  });

  it('plans and stamps from deps.today and deps.nowMs, never the system clock', async () => {
    jest.useFakeTimers({
      now: new Date(2031, 0, 15, 12, 0),
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    try {
      await expect(run()).resolves.toEqual(COMPLETE_RUN);
    } finally {
      jest.useRealTimers();
    }

    expect([...calledDates()].sort()).toEqual(ALL_BACKFILL_DATES);
    expect((await readStore())!.days).toEqual(byDate(ALL_BACKFILL_DATES.map((d) => emptyDay(d))));
  });
});

describe('DD5.22 — one requests.backfill_done event per run, carrying the result', () => {
  it.each<[string, () => void, BackfillResult]>([
    ['complete', () => {}, COMPLETE_RUN],
    ['week-failed', () => serveDiary(each(weekOf(NEWEST_MONDAY), undefined)), result(0, 0, 7, 'week-failed')],
    ['auth', () => serveDiary({ [WEEK1_THU]: new AuthError(401) }), result(1, 6, 1, 'auth')],
    ['throttled', () => serveDiary({ [WEEK1_THU]: new ApiError(429) }), result(1, 6, 1, 'throttled')],
    ['signed-out', () => mockLoadConfig.mockResolvedValue(null), result(0, 0, 0, 'signed-out')],
    [
      'unreadable',
      () => mockAsyncStorage.getItem.mockRejectedValue(new Error('disk I/O error')),
      result(0, 0, 0, 'unreadable'),
    ],
  ])('%s → log.info once with { weeksStored, daysStored, daysFailed, stopReason }', async (_label, setup, expected) => {
    setup();

    await expect(run()).resolves.toEqual(expected);

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith('requests.backfill_done', expected);
  });
});

describe('DD5.23 — a throwing onWeekStored never stops the backfill', () => {
  it('every view update throws → the run still completes with the same result and store', async () => {
    const throwing = jest.fn((_store: MyRequestsStore): void => {
      throw new Error('view update failed');
    });

    await expect(run({ onWeekStored: throwing })).resolves.toEqual(COMPLETE_RUN);

    expect(throwing).toHaveBeenCalledTimes(21);
    expect(calledDates()).toHaveLength(147);
    expect(await storedDates()).toEqual(ALL_BACKFILL_DATES);
    expect(doneLogs()).toEqual([COMPLETE_RUN]);
    // Visible, not silent: one requests.backfill_view_update_failed per run, class name only
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith('requests.backfill_view_update_failed', expect.any(Error));
  });

  it('a non-Error throw logs UnknownError', async () => {
    const throwing = jest.fn((_store: MyRequestsStore): void => {
      throw 'view update failed';
    });

    await expect(run({ onWeekStored: throwing })).resolves.toEqual(COMPLETE_RUN);

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith('requests.backfill_view_update_failed', 'UnknownError');
  });

  it('a view update that does not throw logs no error', async () => {
    await expect(run({ onWeekStored: jest.fn() })).resolves.toEqual(COMPLETE_RUN);

    expect(mockError).not.toHaveBeenCalled();
  });
});

// ─── FR3 ─────────────────────────────────────────────────────────────────────

describe('FR3: startRequestsBackfillOnce', () => {
  /** What loadCredentials returns (the keychain): every gated run fetches with these. */
  const KEYCHAIN_CREDS = { username: 'keychain@example.com', password: 'keychain-pass' };

  const QUERY_KEY = ['myRequests', '79996'] as const;
  const PROD_KEY = '79996|prod';
  const QA_KEY = '79996|qa';
  /** dataUpdatedAt of a seeded view: when the foreground refresh built it, not the backfill. */
  const VIEW_UPDATED_MS = Date.parse('2026-10-21T08:00:00');

  /** A short gated run: the newest week answers with empty bodies, so it stops after 7 requests. */
  const ONE_WEEK_FAILED = result(0, 0, 7, 'week-failed');
  /** Week 1 stored, week 2 failed (serveWeekThenFail). */
  const ONE_WEEK_STORED = result(1, 7, 7, 'week-failed');

  let clients: QueryClient[] = [];

  /** A real QueryClient: no retries, and no GC timers left behind. */
  function newClient(): QueryClient {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    clients.push(client);
    return client;
  }

  /** The gate with today, the clock and the pause injected (the hook passes none of them). */
  function start(
    client: QueryClient,
    overrides: Partial<Omit<BackfillDeps, 'onWeekStored'>> = {},
  ): Promise<BackfillResult | null> {
    return startRequestsBackfillOnce(client, { today: TODAY, nowMs: () => NOW_MS, sleep, ...overrides });
  }

  /** fetchWorkDiary calls sorted by date: [assignmentId, date, credentials, useQA]. */
  function callsByDate(): unknown[][] {
    return [...mockFetchWorkDiary.mock.calls].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }

  /** The calls one week of `owner` makes with the keychain credentials. */
  const weekCalls = (monday: string, owner: RequestsStoreOwner = OWNER): unknown[][] =>
    weekOf(monday).map((d) => [owner.assignmentId, d, KEYCHAIN_CREDS, owner.useQA]);

  /** Reads of my_requests_v1 (the runner's first step). */
  const storeReads = (): number => mockAsyncStorage.getItem.mock.calls.filter(([k]) => k === KEY).length;

  /** Week 1 answers (`week1` per date, else []), week 2 answers with empty bodies: one stored week. */
  function serveWeekThenFail(week1: Record<string, DayResult> = {}): void {
    serveDiary({ ...week1, ...each(weekOf(SECOND_MONDAY), undefined) });
  }

  beforeEach(() => {
    __resetBackfillSessionForTests();
    mockLoadCredentials.mockReset();
    mockLoadCredentials.mockResolvedValue(KEYCHAIN_CREDS);
    mockFetchWorkDiary.mockResolvedValue(undefined as unknown as WorkDiarySlot[]);
  });

  afterEach(() => {
    clients.forEach((c) => c.clear());
    clients = [];
  });

  // ─── The session gate ──────────────────────────────────────────────────────

  describe('DD5.24 — at most one run per owner per JS session', () => {
    it('two concurrent calls for the same owner → one run (one week of requests); the other resolves null', async () => {
      const client = newClient();

      const outcomes: (BackfillResult | null)[] = await Promise.all([start(client), start(client)]);

      expect(outcomes.filter((o) => o !== null)).toEqual([ONE_WEEK_FAILED]);
      expect(outcomes.filter((o) => o === null)).toHaveLength(1);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED]);
    });

    it('a call while the first run is still fetching → null, and no extra request', async () => {
      const client = newClient();
      const fetches: Deferred<WorkDiarySlot[] | undefined>[] = [];
      mockFetchWorkDiary.mockImplementation(() => {
        const d = deferred<WorkDiarySlot[] | undefined>();
        fetches.push(d);
        return d.promise as Promise<WorkDiarySlot[]>;
      });

      const first = start(client);
      await flush();
      expect(fetches).toHaveLength(7);

      await expect(start(client)).resolves.toBeNull();
      expect(fetches).toHaveLength(7);

      fetches.forEach((d) => d.resolve(undefined));
      await expect(first).resolves.toEqual(ONE_WEEK_FAILED);
      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(7);
    });

    it('a later call in the same session → null, with no request, no store read and no log', async () => {
      const client = newClient();
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      jest.clearAllMocks();

      await expect(start(client)).resolves.toBeNull();

      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(storeReads()).toBe(0);
      expect(mockInfo).not.toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
    });

    // Cross-spec review: an env switch (or sign-out) can overwrite / wipe my_requests_v1,
    // so a hard reset (invalidateAuthToken) re-opens the gate for every owner.
    it('after a hard reset (env switch and back, or sign-out and in) the same owner can run again', async () => {
      const client = newClient();
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      await expect(start(client)).resolves.toBeNull();
      jest.clearAllMocks();

      invalidateAuthToken();

      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(7);
    });
  });

  describe('DD5.25 — each owner (assignmentId|env) gets its own run', () => {
    it.each<[string, CrossoverConfig, RequestsStoreOwner]>([
      ['another assignmentId', OTHER_CONFIG, { assignmentId: '80001', useQA: false }],
      ['the same assignment with useQA flipped', QA_CONFIG, QA_OWNER],
    ])('%s → a new run, against that owner; the first owner stays marked', async (_label, next, owner) => {
      const client = newClient();
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY, OWNER));
      mockFetchWorkDiary.mockClear();
      mockLoadConfig.mockResolvedValue(next);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY, owner));

      mockFetchWorkDiary.mockClear();
      mockLoadConfig.mockResolvedValue(CONFIG);
      await expect(start(client)).resolves.toBeNull();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });

    it('a config without useQA (older install) is the prod owner: it runs against prod, and prod is then marked', async () => {
      const withoutEnv: Partial<CrossoverConfig> = { ...CONFIG };
      delete withoutEnv.useQA;
      mockLoadConfig.mockResolvedValue(withoutEnv as CrossoverConfig);
      const client = newClient();
      serveWeekThenFail();

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);
      expect(callsByDate()).toEqual([...weekCalls(SECOND_MONDAY), ...weekCalls(NEWEST_MONDAY)]);
      expect((await readStore())!.owner).toEqual(OWNER);

      mockFetchWorkDiary.mockClear();
      mockLoadConfig.mockResolvedValue(CONFIG);
      await expect(start(client)).resolves.toBeNull();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });
  });

  describe('DD5.26 — no run while signed out', () => {
    it.each<[string, CrossoverConfig | null]>([
      ['loadConfig → null', null],
      ['a config with an empty assignmentId', { ...CONFIG, assignmentId: '' }],
      ['a config without assignmentId', { ...CONFIG, assignmentId: undefined as unknown as string }],
    ])('%s → null, with no store read, no request and no log; the next call, signed in, runs', async (_label, config) => {
      mockLoadConfig.mockResolvedValue(config);
      const client = newClient();

      await expect(start(client)).resolves.toBeNull();

      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(storeReads()).toBe(0);
      expect(mockInfo).not.toHaveBeenCalled();

      mockLoadConfig.mockResolvedValue(CONFIG);
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
    });
  });

  describe('DD5.27 — never for the dev-mock manager preview', () => {
    it('devManagerView: true → null, with no keychain read, no store read and no request; the next call with it off runs', async () => {
      mockLoadConfig.mockResolvedValue({ ...CONFIG, devManagerView: true });
      const client = newClient();

      await expect(start(client)).resolves.toBeNull();

      expect(mockLoadCredentials).not.toHaveBeenCalled();
      expect(mockAsyncStorage.getItem).not.toHaveBeenCalledWith(KEY);
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(mockInfo).not.toHaveBeenCalled();

      // The preview did not use up the session's run
      mockLoadConfig.mockResolvedValue({ ...CONFIG, devManagerView: false });
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
    });
  });

  describe('DD5.28 — never without a keychain entry', () => {
    it('loadCredentials → null → null, with no store read and no request; the next call with credentials runs', async () => {
      mockLoadCredentials.mockResolvedValue(null);
      const client = newClient();

      await expect(start(client)).resolves.toBeNull();

      expect(storeReads()).toBe(0);
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(mockInfo).not.toHaveBeenCalled();

      // The owner was not marked
      mockLoadCredentials.mockResolvedValue(KEYCHAIN_CREDS);
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
    });
  });

  describe('DD5.29 — the gate never rejects', () => {
    it.each<[string, (err: Error) => void]>([
      ['loadConfig rejects', (err) => mockLoadConfig.mockRejectedValue(err)],
      ['loadCredentials rejects (keychain locked)', (err) => mockLoadCredentials.mockRejectedValue(err)],
    ])('%s → resolves null and logs requests.backfill_failed with the error; the next call runs', async (_label, fail) => {
      const err = new Error('storage unavailable');
      fail(err);
      const client = newClient();

      await expect(start(client)).resolves.toBeNull();

      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockError).toHaveBeenCalledWith('requests.backfill_failed', err);
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(mockInfo).not.toHaveBeenCalled();

      // Nothing was started, so the owner was not marked
      mockLoadConfig.mockResolvedValue(CONFIG);
      mockLoadCredentials.mockResolvedValue(KEYCHAIN_CREDS);
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
    });

    it.each<[string, unknown]>([
      ['a string', 'storage unavailable'],
      ['a plain object', { code: 'E_KEYCHAIN' }],
    ])('a non-Error rejection (%s) → resolves null and logs requests.backfill_failed as UnknownError', async (_label, reason) => {
      mockLoadCredentials.mockRejectedValue(reason);
      const client = newClient();

      await expect(start(client)).resolves.toBeNull();

      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockError).toHaveBeenCalledWith('requests.backfill_failed', 'UnknownError');
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    });
  });

  describe('FR3 — today, the clock and the pause: the injected ones, else the system (the hook injects none)', () => {
    it('plans from todayLocal(), stamps fetchedAt with Date.now and pauses 500 ms on a timer', async () => {
      const systemNow = new Date(2026, 9, 21, 12, 0); // local noon of TODAY
      jest.useFakeTimers({ now: systemNow, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
      try {
        serveWeekThenFail();
        const client = newClient();

        const done = startRequestsBackfillOnce(client);
        await flush();

        // TODAY's newest backfill week, stamped with the system clock
        expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
        expect((await readStore())!.days).toEqual(
          byDate(weekOf(NEWEST_MONDAY).map((d) => emptyDay(d, systemNow.toISOString()))),
        );

        // The pause holds week 2 back for BACKFILL_WEEK_PAUSE_MS
        jest.advanceTimersByTime(BACKFILL_WEEK_PAUSE_MS - 1);
        await flush();
        expect(mockFetchWorkDiary).toHaveBeenCalledTimes(7);

        jest.advanceTimersByTime(1);
        await flush();
        expect(mockFetchWorkDiary).toHaveBeenCalledTimes(14);

        await expect(done).resolves.toEqual(ONE_WEEK_STORED);
      } finally {
        jest.useRealTimers();
      }
    });

    it('an injected today and nowMs win over the system clock', async () => {
      jest.useFakeTimers({
        now: new Date(2031, 0, 15, 12, 0),
        doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
      });
      try {
        serveWeekThenFail();
        await expect(start(newClient())).resolves.toEqual(ONE_WEEK_STORED);
      } finally {
        jest.useRealTimers();
      }

      expect(fetchedMondays()).toEqual([NEWEST_MONDAY, SECOND_MONDAY]);
      expect((await readStore())!.days).toEqual(byDate(weekOf(NEWEST_MONDAY).map((d) => emptyDay(d))));
    });
  });

  describe('DD5.34 — __resetBackfillSessionForTests', () => {
    it('lets the same owner run again', async () => {
      const client = newClient();
      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      await expect(start(client)).resolves.toBeNull();
      mockFetchWorkDiary.mockClear();

      __resetBackfillSessionForTests();

      await expect(start(client)).resolves.toEqual(ONE_WEEK_FAILED);
      expect(callsByDate()).toEqual(weekCalls(NEWEST_MONDAY));
    });
  });

  // ─── The live view update (C8) ─────────────────────────────────────────────

  // The foreground refresh has stored the 3-week window (2026-10-05..TODAY) and built the
  // view from it, plus view-only entries carried from a 1.1 blob for dates it never stored.
  const CURRENT_MONDAY = '2026-10-19';
  const WINDOW_REQ = entry('2026-10-20', 'Window request', 'PENDING');
  /** Carried for a week-1 date; the backfill now gets the server's answer for it. */
  const SUPERSEDED = entry('2026-09-30', 'Before the backfill', 'PENDING');
  /** Carried for a week-1 date the server now confirms has no request. */
  const WITHDRAWN = entry('2026-10-01', 'Withdrawn request', 'APPROVED');
  /** Carried for a date of week 2, which fails: still unrecorded. */
  const UNRECORDED_WEEK2 = entry('2026-09-23', 'Week two request', 'APPROVED');
  /** Carried for a week the run never reaches. */
  const UNRECORDED_OLDER = entry('2026-08-12', 'Older request', 'REJECTED', 2, 'Not billable');
  /** The server's answer for 2026-09-30. */
  const SERVER_REQ = entry('2026-09-30', 'Server request', 'APPROVED');
  const WEEK1_ANSWERS: Record<string, DayResult> = { '2026-09-30': [manual('Server request', 'APPROVED')] };

  const CARRIED = [WINDOW_REQ, SUPERSEDED, WITHDRAWN, UNRECORDED_WEEK2, UNRECORDED_OLDER];
  /** The view after week 1 is stored: the window, week 1 as stored, the still-unrecorded carries. */
  const GROWN = [WINDOW_REQ, SERVER_REQ, UNRECORDED_WEEK2, UNRECORDED_OLDER];

  async function seedWindow(owner: RequestsStoreOwner = OWNER): Promise<void> {
    await seedStore(
      asc('2026-10-05', TODAY).map((d) => {
        const entries = d === WINDOW_REQ.date ? [WINDOW_REQ] : [];
        return { date: d, fetchedAt: SEEDED_AT, entries, settled: d < CURRENT_MONDAY };
      }),
      owner,
    );
  }

  /** A client holding `view` as a successful query, last updated at VIEW_UPDATED_MS. */
  function clientWithView(view: MyRequestsData): QueryClient {
    const client = newClient();
    client.setQueryData<MyRequestsData>(QUERY_KEY, view, { updatedAt: VIEW_UPDATED_MS });
    return client;
  }

  function storeBackedView(ownerKey: string): MyRequestsData {
    return { entries: [...CARRIED], error: null, staleDates: ['2026-10-19'], updatedAt: SEEDED_AT, ownerKey };
  }

  describe('DD5.30 — each stored week is shown at once in a successful same-owner view', () => {
    it("a prev entry in a still-unrecorded week is kept; one in the week just stored is replaced by that day's stored entries", async () => {
      await seedWindow();
      const client = clientWithView(storeBackedView(PROD_KEY));
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      const data = client.getQueryData<MyRequestsData>(QUERY_KEY)!;
      expect(data.entries).toEqual(GROWN);
      // The week-1 carries are gone: one answered, the other confirmed empty
      expect(data.entries).not.toContainEqual(SUPERSEDED);
      expect(data.entries).not.toContainEqual(WITHDRAWN);
    });

    it('freshness and error state are unchanged: dataUpdatedAt, status, error, staleDates and updatedAt; ownerKey set', async () => {
      await seedWindow();
      const client = clientWithView(storeBackedView(PROD_KEY));
      serveWeekThenFail(WEEK1_ANSWERS);

      await start(client);

      expect(client.getQueryData(QUERY_KEY)).toEqual({
        entries: GROWN,
        error: null,
        staleDates: ['2026-10-19'],
        updatedAt: SEEDED_AT,
        ownerKey: PROD_KEY,
      });
      const state = client.getQueryState(QUERY_KEY)!;
      expect(state.status).toBe('success');
      expect(state.error).toBeNull();
      expect(state.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
    });

    it.each<[string, MyRequestsData['error']]>([
      ['error: null', null],
      ["a persisted error: 'network'", 'network'],
    ])('a legacy prev (no ownerKey, %s) is updated, stamped with the owner and keeps its error', async (_label, error) => {
      await seedWindow();
      const client = clientWithView({ entries: [...CARRIED], error });
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      expect(client.getQueryData(QUERY_KEY)).toEqual({ entries: GROWN, error, ownerKey: PROD_KEY });
      expect(client.getQueryState(QUERY_KEY)!.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
    });

    it("a QA owner's QA-stamped view is updated too", async () => {
      mockLoadConfig.mockResolvedValue(QA_CONFIG);
      await seedWindow(QA_OWNER);
      const client = clientWithView(storeBackedView(QA_KEY));
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      expect(client.getQueryData<MyRequestsData>(QUERY_KEY)).toEqual({ ...storeBackedView(QA_KEY), entries: GROWN });
      expect(client.getQueryState(QUERY_KEY)!.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
    });

    it('the view grows after each stored week, while the run is still going', async () => {
      await seedWindow();
      const client = clientWithView(storeBackedView(PROD_KEY));
      const WEEK2_REQ = entry('2026-09-22', 'Second week request', 'PENDING');
      serveDiary({
        ...WEEK1_ANSWERS,
        '2026-09-22': [manual('Second week request', 'PENDING')],
        ...each(weekOf('2026-09-14'), undefined),
      });
      // Each pause comes right after a week was stored: capture the view there
      const seen: (MyRequestsData | undefined)[] = [];
      const pause = jest.fn(async (_ms: number) => {
        seen.push(client.getQueryData<MyRequestsData>(QUERY_KEY));
      });

      await expect(start(client, { sleep: pause })).resolves.toEqual(result(2, 14, 7, 'week-failed'));

      expect(seen.map((v) => v?.entries)).toEqual([
        GROWN,
        // Week 2 is now recorded too, so its carried entry is gone
        [WINDOW_REQ, SERVER_REQ, WEEK2_REQ, UNRECORDED_OLDER],
      ]);
      expect(client.getQueryState(QUERY_KEY)!.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
    });
  });

  describe('DD5.31 — a view of another owner is never touched', () => {
    it.each<[string, CrossoverConfig, string]>([
      ['a QA view while prod is configured', CONFIG, QA_KEY],
      ['a prod view while QA is configured', QA_CONFIG, PROD_KEY],
      ["the manager preview ('dev-mock')", CONFIG, 'dev-mock'],
    ])('%s → the same reference after a stored week; the week is still stored', async (_label, config, stamp) => {
      mockLoadConfig.mockResolvedValue(config);
      const prev: MyRequestsData = { entries: [...CARRIED], error: null, staleDates: [], updatedAt: null, ownerKey: stamp };
      const before = JSON.parse(JSON.stringify(prev)) as MyRequestsData;
      const client = clientWithView(prev);
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      expect(client.getQueryData(QUERY_KEY)).toBe(prev);
      expect(prev).toEqual(before);
      expect(client.getQueryState(QUERY_KEY)!.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
      // The backfill itself ran for the configured owner
      expect((await readStore())!.owner).toEqual({ assignmentId: '79996', useQA: config.useQA });
      expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY));
    });
  });

  describe('DD5.32 — an errored view is left as it is', () => {
    it("a query in status 'error' that still holds data keeps the same data, error and dataUpdatedAt; the week is stored", async () => {
      await seedWindow();
      const prev = storeBackedView(PROD_KEY);
      const client = clientWithView(prev);
      // The foreground refresh failed after the view was built (spec 04's "Can't sign in" state)
      const err = new AuthError(401);
      await expect(
        client.fetchQuery({ queryKey: QUERY_KEY, queryFn: () => Promise.reject(err), networkMode: 'always' }),
      ).rejects.toBe(err);
      expect(client.getQueryState(QUERY_KEY)!.status).toBe('error');
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      const state = client.getQueryState(QUERY_KEY)!;
      expect(client.getQueryData(QUERY_KEY)).toBe(prev);
      expect(state.status).toBe('error');
      expect(state.error).toBe(err);
      expect(state.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
      // Stored, so the next successful refresh shows it
      expect((await readStore())!.days['2026-09-30'].entries).toEqual([SERVER_REQ]);
    });
  });

  describe('DD5.33 — no view is created where there was none', () => {
    it('no cached data → still no ["myRequests", assignmentId] data after a stored week', async () => {
      const client = newClient();
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
      expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY));
    });

    it('a cold-start query still loading (pending, no data) is not given data by the backfill', async () => {
      const client = newClient();
      const foreground = deferred<MyRequestsData>();
      const loading = client.fetchQuery({ queryKey: QUERY_KEY, queryFn: () => foreground.promise, networkMode: 'always' });
      expect(client.getQueryState(QUERY_KEY)!.status).toBe('pending');
      serveWeekThenFail(WEEK1_ANSWERS);

      await expect(start(client)).resolves.toEqual(ONE_WEEK_STORED);

      expect(client.getQueryData(QUERY_KEY)).toBeUndefined();
      expect(client.getQueryState(QUERY_KEY)!.status).toBe('pending');

      foreground.resolve({ entries: [], error: null, ownerKey: PROD_KEY });
      await loading;
    });
  });
});

// ─── FR4 ─────────────────────────────────────────────────────────────────────

describe('FR4: useRequestsBackfill schedules the gate from the Requests screen', () => {
  const QUERY_KEY = ['myRequests', '79996'] as const;
  /** The fake system clock: local noon of TODAY. The hook injects nothing, so the gate plans from it. */
  const SYSTEM_NOW = new Date(2026, 9, 21, 12, 0);
  /** dataUpdatedAt of a seeded view (the foreground refresh's, not the backfill's). */
  const VIEW_UPDATED_MS = Date.parse('2026-10-21T08:00:00');
  /** One gated run: the newest week answers with empty bodies, so it stops after 7 requests. */
  const ONE_WEEK_FAILED = result(0, 0, 7, 'week-failed');
  /** Week 1 answers, week 2 answers with empty bodies. */
  const ONE_WEEK_STORED = result(1, 7, 7, 'week-failed');
  const PREVIEW_CONFIG: CrossoverConfig = { ...CONFIG, devManagerView: true };

  let clients: QueryClient[] = [];
  let trees: { renderer: ReactTestRenderer; mounted: boolean }[] = [];

  function newClient(): QueryClient {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    clients.push(client);
    return client;
  }

  /** What useConfig returns to the hook on its next render. */
  function configIs(config: CrossoverConfig | null, isLoading = false): void {
    mockUseConfig.mockReturnValue({ config, isLoading, refetch: jest.fn() });
  }

  /** useConfig and the stored config (the gate's loadConfig) agree, as after a real save. */
  function signIn(config: CrossoverConfig | null, isLoading = false): void {
    configIs(config, isLoading);
    mockLoadConfig.mockResolvedValue(config);
  }

  function Probe(): null {
    useRequestsBackfill();
    return null;
  }

  const screen = (client: QueryClient): React.ReactElement =>
    React.createElement(QueryClientProvider, { client }, React.createElement(Probe));

  /** Mounts the probe; `rerender` renders it again with whatever useConfig returns now. */
  function mount(client: QueryClient = newClient()): { rerender: () => void; unmount: () => void } {
    const tree = { renderer: undefined as unknown as ReactTestRenderer, mounted: true };
    act(() => {
      tree.renderer = create(screen(client));
    });
    trees.push(tree);
    return {
      rerender: () => act(() => tree.renderer.update(screen(client))),
      unmount: () => {
        tree.mounted = false;
        act(() => tree.renderer.unmount());
      },
    };
  }

  /** Lets pending work settle, moves the fake clock by `ms`, then lets the woken work run. */
  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await flush();
      jest.advanceTimersByTime(ms);
      await flush();
    });
  }

  /** fetchWorkDiary calls sorted by date: [assignmentId, date, credentials, useQA]. */
  function sortedCalls(): unknown[][] {
    return [...mockFetchWorkDiary.mock.calls].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }

  /** The calls one week of `owner` makes with the keychain credentials. */
  const weekCalls = (monday: string, owner: RequestsStoreOwner = OWNER): unknown[][] =>
    weekOf(monday).map((d) => [owner.assignmentId, d, CREDS, owner.useQA]);

  beforeEach(() => {
    jest.useFakeTimers({ now: SYSTEM_NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    __resetBackfillSessionForTests();
    signIn(CONFIG);
    mockLoadCredentials.mockReset();
    mockLoadCredentials.mockResolvedValue(CREDS);
    mockFetchWorkDiary.mockResolvedValue(undefined as unknown as WorkDiarySlot[]);
  });

  afterEach(() => {
    for (const tree of trees) if (tree.mounted) act(() => tree.renderer.unmount());
    trees = [];
    clients.forEach((c) => c.clear());
    clients = [];
    jest.useRealTimers();
  });

  describe('DD5.35 — the gate starts BACKFILL_START_DELAY_MS after mount', () => {
    it('signed in: nothing at 4 999 ms; at 5 000 ms one gated run for the configured owner, and no other', async () => {
      mount();

      await advance(BACKFILL_START_DELAY_MS - 1);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockLoadCredentials).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();

      await advance(1);
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED]);

      // Scheduled once: the mounted screen never calls the gate again
      const configReads = mockLoadConfig.mock.calls.length;
      await advance(60_000);
      expect(mockLoadConfig).toHaveBeenCalledTimes(configReads);
      expect(mockFetchWorkDiary).toHaveBeenCalledTimes(7);
      expect(doneLogs()).toHaveLength(1);
    });

    it.each<[string, CrossoverConfig]>([
      ['other config fields changed', { ...CONFIG, fullName: 'Renamed User', hourlyRate: 35 }],
      ['useQA missing (an older install is the same prod owner)', { ...CONFIG, useQA: undefined as unknown as boolean }],
    ])('a re-render for the same owner (%s) does not restart the delay', async (_label, sameOwner) => {
      const { rerender } = mount();
      await advance(3_000);

      configIs(sameOwner);
      rerender();
      await advance(BACKFILL_START_DELAY_MS - 3_000);

      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED]);
    });

    it("the run updates the provider's QueryClient: a stored week shows in its successful view", async () => {
      const client = newClient();
      const prev: MyRequestsData = { entries: [], error: null, ownerKey: '79996|prod' };
      client.setQueryData<MyRequestsData>(QUERY_KEY, prev, { updatedAt: VIEW_UPDATED_MS });
      serveDiary({ '2026-09-30': [manual('Server request', 'APPROVED')], ...each(weekOf(SECOND_MONDAY), undefined) });

      mount(client);
      await advance(BACKFILL_START_DELAY_MS);
      await advance(BACKFILL_WEEK_PAUSE_MS);

      expect(doneLogs()).toEqual([ONE_WEEK_STORED]);
      expect(client.getQueryData(QUERY_KEY)).toEqual({
        ...prev,
        entries: [entry('2026-09-30', 'Server request', 'APPROVED')],
      });
      expect(client.getQueryState(QUERY_KEY)!.dataUpdatedAt).toBe(VIEW_UPDATED_MS);
    });
  });

  describe('DD5.35 — unmounting clears a pending timer; a started run continues', () => {
    it('unmounting at 4 000 ms → the gate never runs', async () => {
      const { unmount } = mount();
      await advance(4_000);

      unmount();
      await advance(10_000);

      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockLoadCredentials).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(doneLogs()).toEqual([]);
    });

    it('unmounting while the first week is in flight → that week is still stored and the run ends normally', async () => {
      const week1: Deferred<WorkDiarySlot[] | undefined>[] = [];
      mockFetchWorkDiary.mockImplementation((_id, date) => {
        if (mondayOf(date) !== NEWEST_MONDAY) return Promise.resolve(undefined as unknown as WorkDiarySlot[]);
        const d = deferred<WorkDiarySlot[] | undefined>();
        week1.push(d);
        return d.promise as Promise<WorkDiarySlot[]>;
      });
      const { unmount } = mount();
      await advance(BACKFILL_START_DELAY_MS);
      expect(week1).toHaveLength(7);

      unmount();
      week1.forEach((d) => d.resolve([]));
      await advance(BACKFILL_WEEK_PAUSE_MS);

      expect(await storedDates()).toEqual(weekOf(NEWEST_MONDAY));
      expect(sortedCalls()).toEqual([...weekCalls(SECOND_MONDAY), ...weekCalls(NEWEST_MONDAY)]);
      expect(doneLogs()).toEqual([ONE_WEEK_STORED]);
    });
  });

  describe('DD5.35 — no timer without a real, signed-in owner', () => {
    it.each<[string, CrossoverConfig | null, boolean]>([
      ['the dev-mock manager preview (devManagerView: true)', PREVIEW_CONFIG, false],
      ['a config without assignmentId', { ...CONFIG, assignmentId: undefined as unknown as string }, false],
      ['a config with an empty assignmentId', { ...CONFIG, assignmentId: '' }, false],
      ['signed out (no config)', null, false],
      ['config still loading', null, true],
    ])('%s → no gate call after 10 000 ms; once a real owner is configured (same mount) it runs 5 000 ms later', async (_label, config, isLoading) => {
      signIn(config, isLoading);
      const { rerender } = mount();

      await advance(10_000);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockLoadCredentials).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();

      signIn(CONFIG);
      rerender();
      await advance(BACKFILL_START_DELAY_MS - 1);
      expect(mockLoadConfig).not.toHaveBeenCalled();

      await advance(1);
      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED]);
    });

    it.each<[string, CrossoverConfig | null]>([
      ['the preview switched on', PREVIEW_CONFIG],
      ['a sign-out', null],
    ])('%s before the timer fires cancels it: no gate call', async (_label, next) => {
      const { rerender } = mount();
      await advance(3_000);

      signIn(next);
      rerender();
      await advance(10_000);

      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();
      expect(doneLogs()).toEqual([]);
    });
  });

  describe('DD5.35 — an owner change on the same mount schedules a run for the new owner (C10)', () => {
    it.each<[string, CrossoverConfig, RequestsStoreOwner]>([
      ['useQA flipped (environment switch)', QA_CONFIG, QA_OWNER],
      ['another assignmentId (account switch)', OTHER_CONFIG, { assignmentId: '80001', useQA: false }],
    ])('%s after the first run → a second gated run, for the new owner, 5 000 ms after the change', async (_label, next, owner) => {
      const { rerender } = mount();
      await advance(BACKFILL_START_DELAY_MS);
      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY, OWNER));
      mockFetchWorkDiary.mockClear();
      mockLoadConfig.mockClear();

      signIn(next);
      rerender();

      await advance(BACKFILL_START_DELAY_MS - 1);
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();

      await advance(1);
      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY, owner));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED, ONE_WEEK_FAILED]);
    });

    it('an owner change before the timer fires replaces it: only the new owner runs, 5 000 ms after the change', async () => {
      const { rerender } = mount();
      await advance(3_000);

      signIn(QA_CONFIG);
      rerender();

      await advance(2_000); // 5 000 ms after mount: the prod timer is gone
      expect(mockLoadConfig).not.toHaveBeenCalled();
      expect(mockFetchWorkDiary).not.toHaveBeenCalled();

      await advance(3_000); // 5 000 ms after the change
      expect(sortedCalls()).toEqual(weekCalls(NEWEST_MONDAY, QA_OWNER));
      expect(doneLogs()).toEqual([ONE_WEEK_FAILED]);
    });
  });
});
