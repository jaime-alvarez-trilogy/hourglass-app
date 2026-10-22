// FR6 Tests: fetchWorkDiary
// Written BEFORE implementation (TDD red phase)

import {
  fetchWorkDiary,
  WORK_DIARY_CONCURRENCY,
  __resetWorkDiaryInFlightForTests,
} from '../../src/api/workDiary';
import { AuthError, NetworkError } from '../../src/api/errors';
import type { Credentials } from '../../src/types/config';
import type { WorkDiarySlot } from '../../src/types/api';

// Mock the API client module so we can intercept calls
// getAuthGeneration (02-requests-store FR1) is part of the in-flight sharing key.
jest.mock('../../src/api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
  getAuthGeneration: jest.fn(() => 0),
}));

import { getAuthToken, apiGet, getAuthGeneration } from '../../src/api/client';

const mockGetAuthToken = getAuthToken as jest.Mock;
const mockApiGet = apiGet as jest.Mock;
const mockGetAuthGeneration = getAuthGeneration as jest.Mock;

const CREDENTIALS: Credentials = {
  username: 'user@example.com',
  password: 'secret',
};

const MOCK_TOKEN = '1190137:token123';

const MOCK_SLOTS: WorkDiarySlot[] = [
  {
    date: '2026-03-04T13:00:00Z',
    time: '13:00:00',
    activityLevel: 100,
    intensityScore: 100,
    productivityCategory: 'PRODUCTIVE',
    activities: ['AI', 'PURE_AI'],
    secondBrainDeepDive: null,
    tags: ['ai_usage'],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  },
  {
    date: '2026-03-04T14:00:00Z',
    time: '14:00:00',
    activityLevel: 90,
    intensityScore: 85,
    productivityCategory: 'PRODUCTIVE',
    activities: ['AI'],
    secondBrainDeepDive: null,
    tags: ['second_brain'],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
  },
  {
    date: '2026-03-04T15:00:00Z',
    time: '15:00:00',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
    tags: [],
    autoTracker: false,
    status: 'PENDING',
    memo: 'Fix login bug',
    actions: [
      {
        actionType: 'ADD_MANUAL_TIME',
        comment: 'Fix',
        actionMadeBy: 2362707,
        createdDate: '2026-03-04T10:00:00Z',
      },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockResolvedValue(MOCK_TOKEN);
  mockApiGet.mockResolvedValue(MOCK_SLOTS);
  // clearAllMocks keeps implementations, so undo DD2.8's generation bump here.
  mockGetAuthGeneration.mockReturnValue(0);
});

describe('FR6: fetchWorkDiary', () => {
  it('calls getAuthToken with credentials and useQA flag', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(mockGetAuthToken).toHaveBeenCalledWith('user@example.com', 'secret', false);
  });

  it('calls apiGet with correct path /api/timetracking/workdiaries', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/timetracking/workdiaries',
      expect.any(Object),
      MOCK_TOKEN,
      false,
      { username: 'user@example.com', password: 'secret', useQA: false },
    );
  });

  it('passes assignmentId (NOT userId) in query params', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    const [, params] = mockApiGet.mock.calls[0];
    expect(params).toHaveProperty('assignmentId', '79996');
    expect(params).not.toHaveProperty('userId');
  });

  it('passes date as-is in YYYY-MM-DD format', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    const [, params] = mockApiGet.mock.calls[0];
    expect(params).toHaveProperty('date', '2026-03-04');
  });

  it('returns the typed WorkDiarySlot array from apiGet', async () => {
    const result = await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(result).toEqual(MOCK_SLOTS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('uses QA flag: passes useQA=true through to getAuthToken and apiGet', async () => {
    await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, true);
    expect(mockGetAuthToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      MOCK_TOKEN,
      true,
      { username: 'user@example.com', password: 'secret', useQA: true },
    );
  });

  it('propagates AuthError from getAuthToken to caller', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new AuthError(401));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('propagates AuthError from apiGet to caller', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(403));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('propagates NetworkError from getAuthToken to caller', async () => {
    mockGetAuthToken.mockRejectedValueOnce(new NetworkError('No connection'));
    await expect(
      fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('returns empty array when apiGet returns []', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    const result = await fetchWorkDiary('79996', '2026-03-04', CREDENTIALS, false);
    expect(result).toEqual([]);
  });
});

// durable-data 01-auth-renewal FR4: fetchWorkDiary keeps its signature and builds the
// creds itself, so every caller (useAIData, useTeamAggregateData, fetchFreshData,
// useMyRequests) can renew an expired token without passing anything new.
describe('DD1 FR4: fetchWorkDiary passes renewal creds to apiGet', () => {
  it('passes {username, password, useQA} as the 5th apiGet argument', async () => {
    await fetchWorkDiary('79996', '2026-03-09', { username: 'u', password: 'p' }, false);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/timetracking/workdiaries',
      { assignmentId: '79996', date: '2026-03-09' },
      MOCK_TOKEN,
      false,
      { username: 'u', password: 'p', useQA: false },
    );
  });
});

// ─── durable-data 02-requests-store FR1 ────────────────────────────────────────
// fetchWorkDiary runs its body (token + apiGet) inside one app-wide limiter of
// WORK_DIARY_CONCURRENCY, and concurrent calls with the same
// generation|env|assignmentId|date key share one in-flight promise. Nothing is
// memoised once that promise settles.

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

/** A promise whose settlement the test controls (holds a work-diary request open). */
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every queued continuation run (limiter hand-offs, token awaits, apiGet starts). */
function flush(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}

/** A fresh slots array for `date`, so each response can be told apart by identity. */
function slotsFor(date: string): WorkDiarySlot[] {
  return [{ ...MOCK_SLOTS[0], date: `${date}T13:00:00Z` }];
}

/** Every request held by holdApiGet in the current test (settled in afterEach). */
const heldRequests: Deferred<WorkDiarySlot[]>[] = [];

/**
 * Holds every apiGet open until the test settles it. `requests` is in start order;
 * `open` counts started-but-unsettled requests and `maxOpen` is its high-water mark.
 */
function holdApiGet() {
  const state = {
    requests: [] as {
      assignmentId: string;
      date: string;
      useQA: boolean;
      d: Deferred<WorkDiarySlot[]>;
    }[],
    open: 0,
    maxOpen: 0,
  };
  mockApiGet.mockImplementation(
    (_path: string, params: { assignmentId: string; date: string }, _token: string, useQA: boolean) => {
      const d = deferred<WorkDiarySlot[]>();
      state.open++;
      state.maxOpen = Math.max(state.maxOpen, state.open);
      const done = () => {
        state.open--;
      };
      d.promise.then(done, done);
      heldRequests.push(d);
      state.requests.push({ assignmentId: params.assignmentId, date: params.date, useQA, d });
      return d.promise;
    },
  );
  return state;
}

/** Records whether (and how) a promise has settled, without leaving a rejection unhandled. */
function track<T>(promise: Promise<T>) {
  const t = { settled: false, value: undefined as T | undefined, error: undefined as unknown };
  promise.then(
    (v) => {
      t.settled = true;
      t.value = v;
    },
    (e: unknown) => {
      t.settled = true;
      t.error = e;
    },
  );
  return t;
}

function fetchDay(date: string, useQA = false, assignmentId = '79996') {
  return fetchWorkDiary(assignmentId, date, CREDENTIALS, useQA);
}

describe('DD2 FR1: fetchWorkDiary concurrency limit and in-flight sharing', () => {
  beforeEach(() => {
    // A request a test leaves open must not be joined by the next test.
    __resetWorkDiaryInFlightForTests();
  });

  afterEach(async () => {
    // The limiter is module-level too: settle whatever a failed assertion left open,
    // and the queued calls each freed slot then starts, so the next test gets every
    // slot back (one failure reports only itself).
    while (heldRequests.length > 0) {
      for (const d of heldRequests.splice(0)) d.resolve([]);
      await flush();
    }
  });

  it('DD2.4: 10 concurrent calls for distinct dates keep at most 4 requests open, and all 10 resolve', async () => {
    const api = holdApiGet();
    const dates = Array.from({ length: 10 }, (_, i) => `2026-10-${String(12 + i).padStart(2, '0')}`);

    const calls = dates.map((date) => fetchDay(date));
    await flush();
    expect(WORK_DIARY_CONCURRENCY).toBe(4);
    expect(api.requests).toHaveLength(4);

    // Each settled request frees one slot for exactly one queued date.
    for (let i = 0; i < dates.length; i++) {
      api.requests[i].d.resolve(slotsFor(api.requests[i].date));
      await flush();
      expect(api.requests).toHaveLength(Math.min(dates.length, 4 + i + 1));
    }

    const results = await Promise.all(calls);
    expect(api.maxOpen).toBe(4);
    expect(api.requests.map((r) => r.date).sort()).toEqual(dates);
    // Every caller gets its own date's response.
    expect(results.map((slots) => slots[0].date.slice(0, 10))).toEqual(dates);
  });

  it('DD2.5: two concurrent calls with the same key make one token call and one request, and share the array', async () => {
    const api = holdApiGet();

    const first = fetchDay('2026-10-21');
    const second = fetchDay('2026-10-21');
    await flush();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);

    const slots = slotsFor('2026-10-21');
    api.requests[0].d.resolve(slots);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(slots);
    expect(b).toBe(a);
  });

  describe('DD2.6: the date, the environment and the assignment are all part of the key', () => {
    it('different dates: one request per date, each shared by that date’s callers', async () => {
      const api = holdApiGet();

      const day21 = [fetchDay('2026-10-21'), fetchDay('2026-10-21')];
      const day20 = [fetchDay('2026-10-20'), fetchDay('2026-10-20')];
      await flush();
      expect(api.requests.map((r) => r.date)).toEqual(['2026-10-21', '2026-10-20']);

      const slots21 = slotsFor('2026-10-21');
      const slots20 = slotsFor('2026-10-20');
      api.requests[0].d.resolve(slots21);
      api.requests[1].d.resolve(slots20);
      for (const r of await Promise.all(day21)) expect(r).toBe(slots21);
      for (const r of await Promise.all(day20)) expect(r).toBe(slots20);
    });

    it('same date with useQA false and true: one request per environment, never crossed', async () => {
      const api = holdApiGet();

      const prod = [fetchDay('2026-10-21', false), fetchDay('2026-10-21', false)];
      const qa = [fetchDay('2026-10-21', true), fetchDay('2026-10-21', true)];
      await flush();
      expect(api.requests.map((r) => r.useQA)).toEqual([false, true]);

      const prodSlots = slotsFor('2026-10-21');
      const qaSlots = slotsFor('2026-10-21');
      api.requests[0].d.resolve(prodSlots);
      api.requests[1].d.resolve(qaSlots);
      for (const r of await Promise.all(prod)) expect(r).toBe(prodSlots);
      for (const r of await Promise.all(qa)) expect(r).toBe(qaSlots);
    });

    it('same date for two assignments (team fan-out): one request per assignment, never crossed', async () => {
      const api = holdApiGet();

      const mine = [fetchDay('2026-10-21', false, '79996'), fetchDay('2026-10-21', false, '79996')];
      const member = [fetchDay('2026-10-21', false, '80001'), fetchDay('2026-10-21', false, '80001')];
      await flush();
      expect(api.requests.map((r) => r.assignmentId)).toEqual(['79996', '80001']);

      const mySlots = slotsFor('2026-10-21');
      const memberSlots = slotsFor('2026-10-21');
      api.requests[0].d.resolve(mySlots);
      api.requests[1].d.resolve(memberSlots);
      for (const r of await Promise.all(mine)) expect(r).toBe(mySlots);
      for (const r of await Promise.all(member)) expect(r).toBe(memberSlots);
    });
  });

  it('DD2.7: no memo — once the shared request settles, the next same-key call fetches again', async () => {
    const api = holdApiGet();

    const joined = [fetchDay('2026-10-21'), fetchDay('2026-10-21')];
    await flush();
    expect(api.requests).toHaveLength(1);
    api.requests[0].d.resolve(slotsFor('2026-10-21'));
    await Promise.all(joined);

    const again = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);
    const fresh = slotsFor('2026-10-21');
    api.requests[1].d.resolve(fresh);
    await expect(again).resolves.toBe(fresh);
  });

  it('DD2.8: after an auth reset a call never joins the earlier request, and the earlier one settling keeps the new entry', async () => {
    const api = holdApiGet();

    const before = fetchDay('2026-10-21');
    await flush();
    mockGetAuthGeneration.mockReturnValue(1); // as after invalidateAuthToken()
    const after = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);

    const oldSlots = slotsFor('2026-10-21');
    api.requests[0].d.resolve(oldSlots);
    await expect(before).resolves.toBe(oldSlots);

    const joiner = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);

    const newSlots = slotsFor('2026-10-21');
    api.requests[1].d.resolve(newSlots);
    await expect(after).resolves.toBe(newSlots);
    await expect(joiner).resolves.toBe(newSlots);
  });

  it('DD2.8: a request dropped by __resetWorkDiaryInFlightForTests does not evict the newer same-key entry when it settles', async () => {
    const api = holdApiGet();

    const dropped = fetchDay('2026-10-21');
    await flush();
    __resetWorkDiaryInFlightForTests();
    const current = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);

    api.requests[0].d.resolve(slotsFor('2026-10-21'));
    await dropped;
    const joiner = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);

    const slots = slotsFor('2026-10-21');
    api.requests[1].d.resolve(slots);
    await expect(current).resolves.toBe(slots);
    await expect(joiner).resolves.toBe(slots);
  });

  it('DD2.9: a join of an in-flight request bypasses the limiter queue', async () => {
    const api = holdApiGet();
    const dates = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'];

    const calls = dates.map((date) => fetchDay(date));
    const outcomes = calls.map((p) => track(p));
    await flush();
    // The limiter is full: #1-#4 are in flight and #5 is queued.
    expect(api.requests.map((r) => r.date)).toEqual(dates.slice(0, 4));

    const join = track(fetchDay(dates[1]));
    await flush();
    expect(api.requests).toHaveLength(4);

    const second = slotsFor(dates[1]);
    api.requests[1].d.resolve(second);
    await flush();
    // The join resolves with #2 even though #1, #3 and #4 are still open and #5
    // was queued ahead of it.
    expect(join.settled).toBe(true);
    expect(join.value).toBe(second);
    expect([outcomes[0], outcomes[2], outcomes[3]].map((o) => o.settled)).toEqual([false, false, false]);

    // #2's slot went to #5; settle everything else.
    for (const i of [0, 2, 3, 4]) api.requests[i].d.resolve(slotsFor(api.requests[i].date));
    await Promise.all(calls);
    expect(mockApiGet).toHaveBeenCalledTimes(5);
    expect(api.requests.map((r) => r.date)).toEqual(dates);
  });

  it('DD2.10: a shared NetworkError rejects every joined caller with that error, and the next call fetches again', async () => {
    const api = holdApiGet();

    const first = track(fetchDay('2026-10-21'));
    const second = track(fetchDay('2026-10-21'));
    await flush();
    expect(api.requests).toHaveLength(1);

    const offline = new NetworkError('offline');
    api.requests[0].d.reject(offline);
    await flush();
    expect(first.error).toBe(offline);
    expect(second.error).toBe(offline);

    const again = fetchDay('2026-10-21');
    await flush();
    expect(api.requests).toHaveLength(2);
    const slots = slotsFor('2026-10-21');
    api.requests[1].d.resolve(slots);
    await expect(again).resolves.toBe(slots);
    // jest-circus fails the running test on an unhandledRejection (e.g. from a
    // `.finally` cleanup chain); this turn is where Node would report one.
    await flush();
  });
});
