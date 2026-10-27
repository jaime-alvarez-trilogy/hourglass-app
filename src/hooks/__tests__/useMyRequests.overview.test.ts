// Tests: useMyRequests — 1.2 WorkSmart dashboard parity: My Requests from the hours overview.
// One hours-overview call carries this and last UTC week's manual entries, so
// buildMyRequestsQueryFn takes every planned LOCAL date whose whole local day lies inside its
// UTC window [weekStart − 7 d, weekStart + 7 d) from it, each entry on the local date of its
// UTC start, and sends only the rest (older days and a partly covered edge day) to the work
// diary. A failed overview call falls back to the work diary for every planned date (the
// pre-1.2 path, which useMyRequests.test.ts pins with the overview rejected). No ctx → no
// overview call.
//
// Like useMyRequests.test.ts, the cases run the real planner and the real my_requests_v1 store
// against the in-memory AsyncStorage __mocks__ (reset before every case), with
// `fetchWorkDiary`, `loadConfig` / `loadCredentials` and ../../lib/log mocked, and
// `fetchCurrentHoursOverview` mocked at the hook module (never the network). The overview is
// the live-shaped fixture (week of Mon 2026-10-19, so it covers 2026-10-12..2026-10-25) and
// `today` is its Sunday. The run's clock is a local wall-clock time; which planned dates the
// overview covers, and the local date of each entry, depend on the host time zone (jest does
// not pin TZ), so expectations come from oracles on local Date getters (coveredBy,
// localDateOfUtc) and the cases hold in any host time zone. api/client is the real one: the
// auth-generation cases call invalidateAuthToken() as a sign-out would.

// ─── Imports ──────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { loadConfig, loadCredentials } from '../../store/config';
import { fetchWorkDiary } from '../../api/workDiary';
import { fetchCurrentHoursOverview } from '../../hooks/useHoursOverview';
import { invalidateAuthToken } from '../../api/client';
import { ApiError, AuthError, AuthResetError, NetworkError } from '../../api/errors';
import { UNEXPECTED_SHAPE } from '../../api/hoursOverview';
import { log } from '../../lib/log';
import { normalizeHoursOverview, type HoursOverview } from '../../lib/hoursOverview';
import { groupOverviewEntries } from '../../lib/requestsUtils';
import { HOURS_OVERVIEW_RAW } from '../../__fixtures__/hoursOverview';
import { buildMyRequestsQueryFn, markMyRequestsForcedRefresh } from '../../hooks/useMyRequests';
import type { MyRequestsStore, StoredRequestDay } from '../../lib/requestsStore';
import type { CrossoverConfig } from '../../types/config';
import type { WorkDiarySlot } from '../../types/api';
import type { ManualRequestEntry, MyRequestsData } from '../../types/requests';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// babel-jest hoists these above the imports.

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

jest.mock('../../hooks/useHoursOverview', () => ({
  fetchCurrentHoursOverview: jest.fn(),
}));

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;
const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockFetchWorkDiary = fetchWorkDiary as jest.MockedFunction<typeof fetchWorkDiary>;
const mockOverview = fetchCurrentHoursOverview as jest.MockedFunction<typeof fetchCurrentHoursOverview>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockInfo = log.info as jest.Mock;
const mockWarn = log.warn as jest.Mock;

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY = 'my_requests_v1';
const QUERY_KEY = ['myRequests', '79996'];
const PROD_KEY = '79996|prod';
const CREDS = { username: 'user@example.com', password: 'pass123' };

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
  lastRoleCheck: '2026-10-01T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
};

const OVERVIEW: HoursOverview = normalizeHoursOverview(HOURS_OVERVIEW_RAW)!;

// The fixture's Sunday. currentMonday 2026-10-19, catchUpStart 2026-10-05: an empty store
// plans the 21 dates 2026-10-05..2026-10-25. The overview's window is
// [2026-10-12T00:00Z, 2026-10-26T00:00Z): it covers 2026-10-13..2026-10-24 in every zone, and
// the edge days 2026-10-12 / 2026-10-25 only where their local day lies inside it.
const TODAY = '2026-10-25';
const YESTERDAY = '2026-10-24';
const CATCH_UP = '2026-10-05';
const COVER_START = '2026-10-12';
const UNCOVERED_END = '2026-10-11';

// ─── Calendar oracle (independent of the module under test) ─────────────────

/** `date` + `n` days (UTC arithmetic on the strings). */
function shift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive `from..to`, newest first (the planner's order). */
function desc(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = to; d >= from; d = shift(d, -1)) out.push(d);
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local YYYY-MM-DD of `d`, from local Date getters. */
const localYmd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The host's local YYYY-MM-DD of a UTC wall time "YYYY-MM-DDTHH:mm". */
const localDateOfUtc = (wallTime: string): string => localYmd(new Date(Date.parse(`${wallTime}:00Z`)));

/**
 * The `dates` an overview of `weekStart` covers: those whose whole local day lies inside
 * [weekStart − 7 d, weekStart + 7 d) UTC, read from the host's local time at the two edge
 * instants. The last whole day is the one before the end edge's local date; the first is the
 * start edge's local date when that edge is a local midnight, else the day after. So west of
 * UTC the local day still running at the end edge goes to the work diary, east of UTC the
 * one already running at the start edge does; at UTC neither.
 */
function coveredBy(weekStart: string, dates: readonly string[]): string[] {
  const start = new Date(Date.parse(`${shift(weekStart, -7)}T00:00:00Z`));
  const end = new Date(Date.parse(`${shift(weekStart, 7)}T00:00:00Z`));
  const startIsMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const first = startIsMidnight ? localYmd(start) : shift(localYmd(start), 1);
  const last = shift(localYmd(end), -1);
  return dates.filter((d) => d >= first && d <= last);
}

/** Epoch ms of a local wall-clock time, e.g. local('2026-10-25T08:00'). */
const local = (wallClock: string): number => Date.parse(`${wallClock}:00`);

/** A `fetchedAt` as the queryFn writes it: new Date(nowMs).toISOString(). */
const isoAt = (wallClock: string): string => new Date(local(wallClock)).toISOString();

/** `nowMs` defaults to local noon of `todayOverride` when no `nowOverride` is given. */
const NOON = isoAt(`${TODAY}T12:00`);

/** Every date an empty store plans on TODAY, newest first. */
const PLANNED = desc(CATCH_UP, TODAY);
/** The planned dates the fixture overview covers, newest first. */
const COVERED = coveredBy(OVERVIEW.weekStart, PLANNED);
/** The planned dates left to the work diary: the older week, plus a partly covered edge day. */
const DIARY = PLANNED.filter((d) => !COVERED.includes(d));

const minutesOf = (xs: readonly { durationMinutes: number }[]): number =>
  xs.reduce((n, e) => n + e.durationMinutes, 0);

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The fixture's entries of `date`, as groupOverviewEntries groups them. */
function overviewEntries(date: string): ManualRequestEntry[] {
  return groupOverviewEntries(OVERVIEW.manualEntries, [date]).get(date)!;
}

/** The overview of another week, same entries (coverage is read from `weekStart`). */
const overviewOfWeek = (weekStart: string): HoursOverview => ({ ...OVERVIEW, weekStart });

function makeSlot(overrides: Partial<WorkDiarySlot>): WorkDiarySlot {
  return {
    tags: [],
    autoTracker: false,
    status: 'APPROVED',
    memo: '',
    actions: [],
    date: '2026-10-19T12:00:00Z',
    time: '12:00:00',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    ...overrides,
  };
}

/**
 * The work diary of local `date` the fixture describes: the manual entries whose UTC start
 * falls on it locally, as 10-min slots, plus tracked time.
 */
function diaryOf(date: string): WorkDiarySlot[] {
  const manual = OVERVIEW.manualEntries
    .filter((e) => localDateOfUtc(e.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((e) =>
      Array.from({ length: e.durationMinutes / 10 }, () =>
        makeSlot({
          memo: e.description,
          status: e.status,
          actions:
            e.status === 'REJECTED'
              ? [{ actionType: 'REJECT_MANUAL_TIME', comment: e.rejectionReason ?? '', actionMadeBy: 1, createdDate: '' }]
              : [],
        }),
      ),
    );
  return [makeSlot({ autoTracker: true, memo: 'tracked' }), ...manual];
}

/** Every date in catchUpStart..today recorded at local `wallClock`, with no entries. */
function windowRecords(wallClock: string, today: string = TODAY): StoredRequestDay[] {
  return desc(CATCH_UP, today).map((date) => ({
    date,
    fetchedAt: isoAt(wallClock),
    entries: [],
    // Closed weeks fetched after their Tuesday (2026-10-13, 2026-10-20) are settled
    settled: date < '2026-10-19',
  }));
}

async function seedStore(days: StoredRequestDay[]): Promise<string> {
  const store: MyRequestsStore = {
    version: 1,
    owner: { assignmentId: '79996', useQA: false },
    days: Object.fromEntries(days.map((d) => [d.date, d])),
  };
  const raw = JSON.stringify(store);
  await AsyncStorage.setItem(KEY, raw);
  mockAsyncStorage.setItem.mockClear();
  return raw;
}

async function readStore(): Promise<MyRequestsStore | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as MyRequestsStore);
}

function storeWrites(): unknown[][] {
  return mockAsyncStorage.setItem.mock.calls.filter(([k]) => k === KEY);
}

/** Dates passed to fetchWorkDiary, in call order. */
function calledDates(): string[] {
  return mockFetchWorkDiary.mock.calls.map((c) => c[1] as string);
}

/** maxAgeMs of every fetchCurrentHoursOverview call. */
function overviewMaxAges(): number[] {
  return mockOverview.mock.calls.map((c) => c[2]);
}

function logged(fn: jest.Mock, category: string): unknown[] {
  return fn.mock.calls.filter(([c]) => c === category).map(([, meta]) => meta);
}

function signedIn(config: CrossoverConfig = CONFIG): void {
  mockLoadConfig.mockResolvedValue(config);
  mockLoadCredentials.mockResolvedValue(CREDS);
}

let clients: QueryClient[] = [];

function newClient(prior?: MyRequestsData): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (prior !== undefined) client.setQueryData(QUERY_KEY, prior);
  clients.push(client);
  return client;
}

const ctxOf = (client: QueryClient) => ({ client, queryKey: QUERY_KEY });

beforeEach(() => {
  jest.clearAllMocks();
  mockAsyncStorage._reset();
  mockOverview.mockReset();
  mockFetchWorkDiary.mockReset();
});

afterEach(() => {
  clients.forEach((c) => c.clear());
  clients = [];
});

// ─── The overview covers what it can ─────────────────────────────────────────

describe('useMyRequests — the hours overview covers this and last UTC week', () => {
  it('an empty store: the covered dates come from the overview, the older week (and an edge day) from the work diary', async () => {
    signedIn();
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockResolvedValue([]);
    const client = newClient();

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(client));

    expect(mockOverview).toHaveBeenCalledTimes(1);
    expect(mockOverview).toHaveBeenCalledWith(
      client,
      { assignmentId: '79996', useQA: false },
      60_000,
      expect.any(Date),
    );
    // The run's own clock, so a midnight rollover cannot split the run
    expect((mockOverview.mock.calls[0][3] as Date).getTime()).toBe(local(`${TODAY}T12:00`));
    expect(calledDates()).toEqual(DIARY);
    expect(logged(mockInfo, 'requests.overview_used')).toEqual([
      { coveredDays: COVERED.length, workDiaryDays: DIARY.length },
    ]);
    expect(logged(mockWarn, 'requests.overview_failed')).toEqual([]);

    const stored = (await readStore())!;
    expect(Object.keys(stored.days).sort()).toEqual([...PLANNED].reverse());
    for (const date of PLANNED) {
      expect(stored.days[date]).toEqual({
        date,
        fetchedAt: NOON,
        // The work diary (mocked empty) has the uncovered dates
        entries: COVERED.includes(date) ? overviewEntries(date) : [],
        // isDaySettled: last week fetched after its Tuesday with nothing PENDING
        settled: date < '2026-10-19',
      });
    }
    // Every fixture entry is stored on the covered local date of its UTC start, minutes kept
    for (const date of COVERED) {
      const ofDate = OVERVIEW.manualEntries.filter((e) => localDateOfUtc(e.start) === date);
      expect(minutesOf(stored.days[date].entries)).toBe(minutesOf(ofDate));
    }
    const researchDate = localDateOfUtc('2026-10-14T09:00');
    expect(stored.days[researchDate].entries.find((e) => e.memo === 'Research')).toEqual({
      id: `${researchDate}|Research`,
      date: researchDate,
      durationMinutes: 30,
      memo: 'Research',
      status: 'REJECTED',
      rejectionReason: 'Please add detail',
    });
    expect(stored.days[UNCOVERED_END]).toEqual({ date: UNCOVERED_END, fetchedAt: NOON, entries: [], settled: true });

    expect(result).toEqual({
      entries: COVERED.flatMap(overviewEntries),
      error: null,
      staleDates: [],
      updatedAt: NOON,
      ownerKey: PROD_KEY,
    });
  });

  it('writes the same records the work diary would for the same server data', async () => {
    signedIn();
    mockFetchWorkDiary.mockImplementation(async (_id, date) => diaryOf(date));

    // Pre-1.2 path: no ctx, every planned date from the work diary
    await buildMyRequestsQueryFn(TODAY)();
    const fromDiary = (await readStore())!;
    expect(calledDates()).toHaveLength(21);

    mockAsyncStorage._reset();
    mockFetchWorkDiary.mockClear();
    mockOverview.mockResolvedValue(OVERVIEW);
    await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));
    const fromOverview = (await readStore())!;

    expect(calledDates()).toEqual(DIARY);
    expect(fromOverview).toEqual(fromDiary);
  });

  it('a partly covered edge day goes to the work diary; the overview entries on it are dropped', async () => {
    // West of UTC the local Sunday TODAY still runs at the window's end (2026-10-26T00:00Z),
    // east of it the local Monday COVER_START began before its start (2026-10-12T00:00Z). At
    // UTC no day is partial, so there the case only pins the covered dates.
    signedIn();
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockImplementation(async (_id, date) => [makeSlot({ memo: `diary ${date}` })]);

    await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    // The oracle, cross-checked from the host's UTC offsets at the two edges
    const westEdge = new Date(Date.UTC(2026, 9, 26)).getTimezoneOffset() > 0;
    const eastEdge = new Date(Date.UTC(2026, 9, 12)).getTimezoneOffset() < 0;
    const edges = desc(COVER_START, TODAY).filter(
      (d) => (westEdge && d === TODAY) || (eastEdge && d === COVER_START),
    );
    expect(COVERED).toEqual(desc(COVER_START, TODAY).filter((d) => !edges.includes(d)));
    expect(calledDates()).toEqual([...edges, ...desc(CATCH_UP, UNCOVERED_END)]);

    const stored = (await readStore())!;
    for (const date of edges) {
      expect(stored.days[date].entries.map((e) => e.memo)).toEqual([`diary ${date}`]);
    }
    for (const date of COVERED) {
      expect(stored.days[date].entries).toEqual(overviewEntries(date));
    }
  });

  it('coverage follows the overview weekStart: a week ahead of local today covers the whole local Sunday', async () => {
    // Local Sunday evening west of UTC, when UTC is already Monday 2026-10-26: the window
    // [2026-10-19Z, 2026-11-02Z) holds all of local Sunday TODAY in every zone
    signedIn();
    mockOverview.mockResolvedValue(overviewOfWeek('2026-10-26'));
    mockFetchWorkDiary.mockResolvedValue([]);

    await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    const covered = coveredBy('2026-10-26', PLANNED);
    expect(covered[0]).toBe(TODAY);
    expect(covered).toEqual(expect.arrayContaining(desc('2026-10-20', TODAY)));
    expect(calledDates()).toEqual(PLANNED.filter((d) => !covered.includes(d)));
    expect(logged(mockInfo, 'requests.overview_used')).toEqual([
      { coveredDays: covered.length, workDiaryDays: PLANNED.length - covered.length },
    ]);
  });

  it('every planned date covered → no work-diary call; covered dates that were not planned are not rewritten', async () => {
    // Thursday: today and yesterday lie whole inside the overview's window in every zone
    const today = '2026-10-22';
    signedIn();
    const before = windowRecords(`${today}T08:00`, today);
    await seedStore(before);
    mockOverview.mockResolvedValue(OVERVIEW);

    // Noon: today, plus yesterday (fetched 4 h ago) by the 60-min rule
    const result = await buildMyRequestsQueryFn(today)(ctxOf(newClient()));

    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(logged(mockInfo, 'requests.overview_used')).toEqual([{ coveredDays: 2, workDiaryDays: 0 }]);
    const stored = (await readStore())!;
    expect(stored.days[today].entries).toEqual(overviewEntries(today));
    expect(stored.days['2026-10-21'].fetchedAt).toBe(isoAt(`${today}T12:00`));
    // The local date of the fixture's Monday 12:00Z entry has overview entries, but its
    // record was fetched today and not planned
    const notPlanned = localDateOfUtc('2026-10-19T12:00');
    expect(overviewEntries(notPlanned)).not.toEqual([]);
    expect(stored.days[notPlanned]).toEqual(before.find((d) => d.date === notPlanned));
    expect(result.entries).toEqual([today, '2026-10-21'].flatMap(overviewEntries));
    expect(result.staleDates).toEqual([]);
  });

  it('asks for the configured environment', async () => {
    signedIn({ ...CONFIG, useQA: true });
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockResolvedValue([]);

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    expect(mockOverview.mock.calls[0][1]).toEqual({ assignmentId: '79996', useQA: true });
    expect(mockFetchWorkDiary).toHaveBeenCalledWith('79996', UNCOVERED_END, CREDS, true);
    expect(result.ownerKey).toBe('79996|qa');
  });
});

// ─── Fallback ────────────────────────────────────────────────────────────────

describe('useMyRequests — the overview fails: the work diary for every planned date', () => {
  it.each<[string, () => Error, 'auth' | 'network']>([
    ['NetworkError', () => new NetworkError('offline'), 'network'],
    ['ApiError(UNEXPECTED_SHAPE)', () => new ApiError(200, 'shape', { errorCode: UNEXPECTED_SHAPE }), 'network'],
    ['AuthError(403)', () => new AuthError(403), 'auth'],
  ])('%s → all 21 dates from the work diary, as without the overview', async (_label, makeErr, kind) => {
    signedIn();
    mockOverview.mockRejectedValue(makeErr());
    mockFetchWorkDiary.mockImplementation(async (_id, date) => diaryOf(date));

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    expect(calledDates()).toEqual(PLANNED);
    expect(logged(mockWarn, 'requests.overview_failed')).toEqual([{ kind }]);
    expect(logged(mockInfo, 'requests.overview_used')).toEqual([]);
    expect(result.entries).toEqual(PLANNED.flatMap(overviewEntries));
    expect(result.staleDates).toEqual([]);
    expect(Object.keys((await readStore())!.days)).toHaveLength(21);
  });

  it('the overview and every work-diary date failing is a total failure: rejects, writes nothing, seeds a cold cache', async () => {
    signedIn();
    const raw = await seedStore(windowRecords(`${TODAY}T08:00`));
    mockOverview.mockRejectedValue(new NetworkError('overview offline'));
    const err = new NetworkError('diary offline');
    mockFetchWorkDiary.mockRejectedValue(err);
    const client = newClient();

    await expect(buildMyRequestsQueryFn(TODAY)(ctxOf(client))).rejects.toBe(err);

    expect(calledDates()).toEqual([TODAY, YESTERDAY]);
    expect(logged(mockWarn, 'requests.refresh_failed')).toEqual([
      { plannedDays: 2, failedDays: 2, kind: 'network' },
    ]);
    expect(await AsyncStorage.getItem(KEY)).toBe(raw);
    expect(storeWrites()).toHaveLength(0);
    expect(client.getQueryData<MyRequestsData>(QUERY_KEY)?.staleDates).toEqual([TODAY, YESTERDAY]);
  });

  it('no ctx → the overview is never asked and every planned date goes to the work diary', async () => {
    signedIn();
    mockFetchWorkDiary.mockResolvedValue([]);

    await buildMyRequestsQueryFn(TODAY)();

    expect(mockOverview).not.toHaveBeenCalled();
    expect(calledDates()).toEqual(desc(CATCH_UP, TODAY));
  });

  it('the dev-mock manager preview never asks for the overview', async () => {
    signedIn({ ...CONFIG, devManagerView: true });

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    expect(result.ownerKey).toBe('dev-mock');
    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
  });

  it('null credentials → rejects before the overview is asked', async () => {
    mockLoadConfig.mockResolvedValue(CONFIG);
    mockLoadCredentials.mockResolvedValue(null);

    await expect(buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()))).rejects.toBeInstanceOf(AuthError);

    expect(mockOverview).not.toHaveBeenCalled();
  });
});

// ─── Owner and auth-generation guards ────────────────────────────────────────

describe('useMyRequests — the overview keeps the owner and auth-generation guards', () => {
  it('an AuthResetError from the overview → no work-diary call; rejects with it and writes nothing', async () => {
    signedIn();
    const raw = await seedStore(windowRecords(`${TODAY}T08:00`));
    mockOverview.mockRejectedValue(new AuthResetError());

    const thrown = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient())).then(
      () => 'resolved',
      (e: unknown) => e,
    );

    expect(thrown).toBeInstanceOf(AuthResetError);
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(logged(mockWarn, 'requests.refresh_failed')).toEqual([
      { plannedDays: 2, failedDays: 2, kind: 'network' },
    ]);
    expect(await AsyncStorage.getItem(KEY)).toBe(raw);
    expect(storeWrites()).toHaveLength(0);
  });

  it('a sign-out (invalidateAuthToken) while the overview is in flight → the uncovered dates are never fetched', async () => {
    signedIn();
    mockOverview.mockImplementation(async () => {
      invalidateAuthToken();
      return OVERVIEW;
    });
    mockFetchWorkDiary.mockResolvedValue([]);

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    // They fail as fetchWorkDiary's queued calls do (AuthResetError), so they are stale
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(result.staleDates).toEqual(DIARY);
  });

  it('signed out by the time the store checks the owner → the overview days are not written', async () => {
    signedIn();
    // The run starts signed in; by the time the store checks the owner, clearAll() has run
    mockLoadConfig.mockReset();
    mockLoadConfig.mockResolvedValueOnce(CONFIG).mockResolvedValue(null);
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockResolvedValue([]);

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    expect(result.entries).toEqual(COVERED.flatMap(overviewEntries));
    expect(storeWrites()).toHaveLength(0);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('an unreadable store is never written, the view still uses the overview days', async () => {
    signedIn();
    mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('disk I/O'));
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockResolvedValue([]);

    const result = await buildMyRequestsQueryFn(TODAY)(ctxOf(newClient()));

    expect(result.entries).toEqual(COVERED.flatMap(overviewEntries));
    expect(result.updatedAt).toBe(NOON);
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// ─── Forced refresh ──────────────────────────────────────────────────────────
// Last in the file: the flag is module state, so a case that fails before consuming it
// cannot leak a forced plan into the cases above.

describe('useMyRequests — forced refresh and the overview', () => {
  it('a forced run asks for a fresh overview (maxAgeMs 0); the next run may reuse one up to 60 s old', async () => {
    signedIn();
    await seedStore(windowRecords(`${TODAY}T08:00`));
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockResolvedValue([]);

    markMyRequestsForcedRefresh();
    await buildMyRequestsQueryFn(TODAY, () => local(`${TODAY}T08:05`))(ctxOf(newClient()));

    // The whole 3-week window is planned; the overview covers its newest 13 or 14 days
    expect(overviewMaxAges()).toEqual([0]);
    expect(calledDates()).toEqual(DIARY);

    // Only today is planned: from the overview, or from the work diary where it is an edge day
    mockFetchWorkDiary.mockClear();
    await buildMyRequestsQueryFn(TODAY, () => local(`${TODAY}T08:10`))(ctxOf(newClient()));
    expect(overviewMaxAges()).toEqual([0, 60_000]);
    expect(calledDates()).toEqual(COVERED.includes(TODAY) ? [] : [TODAY]);
  });

  it('overview days count as fetched: every work-diary date failing still settles the forced refresh', async () => {
    signedIn();
    await seedStore(windowRecords(`${TODAY}T08:00`));
    mockOverview.mockResolvedValue(OVERVIEW);
    mockFetchWorkDiary.mockRejectedValue(new NetworkError('offline'));

    markMyRequestsForcedRefresh();
    const result = await buildMyRequestsQueryFn(TODAY, () => local(`${TODAY}T08:05`))(ctxOf(newClient()));

    // A partial success, not a total failure
    expect(result.staleDates).toEqual(DIARY);
    expect(result.entries).toEqual(COVERED.flatMap(overviewEntries));
    expect(logged(mockWarn, 'requests.refresh_failed')).toEqual([]);

    // The mark is consumed: the next run is normal (today only, from the overview)
    mockFetchWorkDiary.mockReset();
    mockFetchWorkDiary.mockResolvedValue([]);
    await buildMyRequestsQueryFn(TODAY, () => local(`${TODAY}T08:10`))();
    expect(calledDates()).toEqual([TODAY]);
  });

  it('a forced run whose overview fails re-checks the whole window through the work diary', async () => {
    signedIn();
    await seedStore(windowRecords(`${TODAY}T08:00`));
    mockOverview.mockRejectedValue(new NetworkError('offline'));
    mockFetchWorkDiary.mockResolvedValue([]);

    markMyRequestsForcedRefresh();
    await buildMyRequestsQueryFn(TODAY, () => local(`${TODAY}T08:05`))(ctxOf(newClient()));

    expect(overviewMaxAges()).toEqual([0]);
    expect(calledDates()).toEqual(PLANNED);
  });
});
