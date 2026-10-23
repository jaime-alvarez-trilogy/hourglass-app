// Tests: useRequestsBackfill — features/app/durable-data spec 05-requests-backfill
// FR2 (DD5.9-DD5.23): runRequestsBackfill, the week-by-week runner. Each loop plans the
// newest week with missing dates (planBackfillWeek), checks the owner, fetches those dates,
// merges the days that came back through updateRequestsStore, then pauses. It stops on a
// fully failed week, a non-retryable AuthError, a 429, a sign-out or owner change, an
// unreadable store or the session cap, and never writes a failed day.
//
// The runner is driven against the real planner and the real my_requests_v1 store on the
// in-memory AsyncStorage __mocks__ (reset before every case), with `fetchWorkDiary`,
// `loadConfig` / `loadCredentials` and ../../lib/log mocked. `loadConfig` uses
// mockResolvedValue (not ...Once): the runner checks the owner before every week and the
// store checks it twice per write. `today`, `nowMs` and `sleep` are injected, so no case
// waits, reads the system clock or depends on the host time zone (expected dates come from
// the UTC calendar helpers below, independent of the module under test).

import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ─── Imports ──────────────────────────────────────────────────────────────────

import { loadConfig } from '../../store/config';
import { fetchWorkDiary } from '../../api/workDiary';
import { ApiError, AuthError, NetworkError, AUTH_HTML_500, AUTH_LOGIN_LATCHED } from '../../api/errors';
import { log } from '../../lib/log';
import * as planner from '../../lib/requestsPlanner';
import {
  BACKFILL_START_DELAY_MS,
  BACKFILL_WEEK_PAUSE_MS,
  runRequestsBackfill,
} from '../useRequestsBackfill';
import type { BackfillDeps, BackfillResult } from '../useRequestsBackfill';
import type { MyRequestsStore, RequestsStoreOwner, StoredRequestDay } from '../../lib/requestsStore';
import type { WorkDiarySlot } from '../../types/api';
import type { CrossoverConfig } from '../../types/config';
import type { ManualRequestEntry, ManualRequestStatus } from '../../types/requests';

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockInfo = log.info as jest.Mock;

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

    expect(calledDates()).toHaveLength(147);
    expect([...calledDates()].sort()).toEqual(ALL_BACKFILL_DATES);
    expect(fetchedMondays()).toEqual(BACKFILL_MONDAYS);
    expect(calledDates().slice(0, 7).sort()).toEqual(weekOf(NEWEST_MONDAY));
    expect(calledDates().slice(-7).sort()).toEqual(weekOf(OLDEST_MONDAY));
  });

  it("passes the owner's assignmentId, the credentials and the owner's environment to every fetch", async () => {
    await run();
    for (const [assignmentId, , credentials, useQA] of mockFetchWorkDiary.mock.calls) {
      expect([assignmentId, credentials, useQA]).toEqual(['79996', CREDS, false]);
    }

    jest.clearAllMocks();
    mockAsyncStorage._reset();
    mockLoadConfig.mockResolvedValue(QA_CONFIG);
    serveDiary(each(weekOf(NEWEST_MONDAY), undefined)); // one week is enough here

    await run({}, QA_OWNER);
    expect(mockFetchWorkDiary.mock.calls).toEqual(weekOf(NEWEST_MONDAY).map((d) => ['79996', d, CREDS, true]));
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

    const outcome = await run();

    expect(outcome).toEqual(expected);
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith('requests.backfill_done', expected);
    expect(doneLogs()).toEqual([outcome]);
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
  });
});
