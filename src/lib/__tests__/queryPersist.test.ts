// Tests: queryPersist — features/app/durable-data spec 03-keep-last-good FR5 (DD3.32-DD3.36)
// The HOURGLASS_QUERY_CACHE persist predicate: shouldDehydrateQuery keeps success queries
// and errored queries that still hold data (the last good values survive a restart), and
// never keeps a query whose data carries spec 02's manager-preview stamp (ownerKey 'dev-mock').
//
// Real QueryClient, dehydrate and hydrate. Every query state is reached the way the app
// reaches it: setQueryData (success), a rejecting fetchQuery (error, with or without
// previous data) and queryCache.build (pending). The round trip goes through
// JSON.stringify/parse, as the AsyncStorage persister does.
//
// Mocks: ../../store/config only, so that DD3.35 can run spec 02's real
// buildMyRequestsQueryFn with devManagerView on; ../../api/workDiary is stubbed as a guard
// so no case can reach the network. The DD3.36 module-load case borrows the partial
// @tanstack/react-query mock of app/__tests__/layout-notifications.test.tsx.

import * as fs from 'fs';
import * as path from 'path';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import type { Query, QueryKey } from '@tanstack/react-query';
import { stripComments } from '../../../__tests__/helpers/stripComments';
import { DEV_MOCK_OWNER_KEY, shouldDehydrateQuery } from '../queryPersist';
import { MOCK_MY_REQUESTS } from '../devMock';
import { NetworkError } from '../../api/errors';
import { loadConfig } from '../../store/config';
import { buildMyRequestsQueryFn } from '../../hooks/useMyRequests';
import type { TimesheetResponse } from '../hours';
import type { TeamAggregateData } from '../../hooks/useTeamAggregateData';
import type { CrossoverConfig } from '../../types/config';
import type { MyRequestsData } from '../../types/requests';

jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

const mockLoadConfig = loadConfig as jest.MockedFunction<typeof loadConfig>;

const ROOT = path.resolve(__dirname, '../../..');
const PERSIST_FILE = path.join(ROOT, 'src', 'lib', 'queryPersist.ts');
const MY_REQUESTS_FILE = path.join(ROOT, 'src', 'hooks', 'useMyRequests.ts');
const LAYOUT_FILE = path.join(ROOT, 'app', '_layout.tsx');

/** Source with comments removed, so a pattern named in prose never satisfies a static check. */
const codeOf = (file: string) => stripComments(fs.readFileSync(file, 'utf8'));

// ─── Keys and fixtures ───────────────────────────────────────────────────────

// The app's real query keys (useMyRequests, useTimesheet, usePayments, useTeamAggregateData)
const REQUESTS_KEY = ['myRequests', '79996'];
const TIMESHEET_KEY = ['timesheet', '2026-10-19', '2362707'];
const PAYMENTS_KEY = ['payments', '2026-10-19', '2362707'];
const TEAM_KEY = ['teamAggregate', '4584', '2026-10-19'];

/** Spec 02's manager-preview view, as buildMyRequestsQueryFn stamps it. */
const DEV_MOCK_VIEW: MyRequestsData = {
  entries: [MOCK_MY_REQUESTS[0]],
  error: null,
  ownerKey: 'dev-mock',
};

/** A real contributor's view of the same screen. */
const OWNER_VIEW: MyRequestsData = {
  entries: [MOCK_MY_REQUESTS[1]],
  error: null,
  staleDates: [],
  updatedAt: '2026-10-21T21:00:00.000Z',
  ownerKey: '79996|prod',
};

const TIMESHEET_ROW: TimesheetResponse = {
  totalHours: 31.5,
  hourWorked: 31.5,
  manualHourWorked: 1.5,
  averageHoursPerDay: 7.88,
  stats: [
    { date: '2026-10-19', hours: 8.5 },
    { date: '2026-10-20', hours: 7.5 },
  ],
};

const TEAM_DATA: TeamAggregateData = {
  weekHours: 61.5,
  weekAiPct: 42,
  weekBrainliftHours: 3.5,
  reportCount: 2,
  breakdown: [
    {
      member: {
        assignmentId: '80001',
        candidateId: '3000001',
        userId: null,
        managerId: '2362707',
        teamId: '4584',
        teamName: 'Platform',
        name: 'Ana Ruiz',
        isManager: false,
      },
      hours: 32,
      aiPct: 45,
      brainliftHours: 2,
      fetchFailed: false,
    },
    {
      member: {
        assignmentId: '80002',
        candidateId: '3000002',
        userId: null,
        managerId: '2362707',
        teamId: '4584',
        teamName: 'Platform',
        name: 'Ben Okafor',
        isManager: false,
      },
      hours: 29.5,
      aiPct: 38,
      brainliftHours: 1.5,
      fetchFailed: false,
    },
  ],
};

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [{ id: '4584', name: 'Platform', company: 'Crossover' }],
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  assignmentId: '79996',
  lastRoleCheck: '2026-10-19T08:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-01-05T08:00:00.000Z',
};

// ─── Query-state builders ────────────────────────────────────────────────────

/** No retries and no GC timers, so every case is synchronous with the cache it built. */
function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function queryAt(client: QueryClient, queryKey: QueryKey): Query {
  const query = client.getQueryCache().find({ queryKey, exact: true });
  if (!query) throw new Error(`no query at ${JSON.stringify(queryKey)}`);
  return query;
}

/** A query that has never fetched (status 'pending'), as the cache builds it on first use. */
function buildQuery(client: QueryClient, queryKey: QueryKey): Query {
  return client.getQueryCache().build(client, { queryKey });
}

/** A query whose last fetch succeeded with `data`. */
function seedSuccess(client: QueryClient, queryKey: QueryKey, data: unknown): Query {
  client.setQueryData(queryKey, data);
  const query = queryAt(client, queryKey);
  expect(query.state.status).toBe('success');
  return query;
}

/**
 * A refresh that rejects (the throw-on-failure path of this spec and spec 02). TanStack
 * keeps whatever data the query already held and sets status 'error'.
 */
async function failRefresh(client: QueryClient, queryKey: QueryKey): Promise<Query> {
  await expect(
    client.fetchQuery({
      queryKey,
      queryFn: () => Promise.reject(new NetworkError('Network request failed')),
    }),
  ).rejects.toBeInstanceOf(NetworkError);
  const query = queryAt(client, queryKey);
  expect(query.state.status).toBe('error');
  expect(query.state.fetchStatus).toBe('idle');
  return query;
}

/** Keys of the dehydrated snapshot, order-independent. */
function snapshotKeys(state: ReturnType<typeof dehydrate>): string[] {
  return state.queries.map((q) => JSON.stringify(q.queryKey)).sort();
}

function keysOf(...queryKeys: QueryKey[]): string[] {
  return queryKeys.map((k) => JSON.stringify(k)).sort();
}

let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  client = newClient();
});

afterEach(() => {
  client.clear();
});

// ─── DD3.32: status rule ─────────────────────────────────────────────────────

describe('shouldDehydrateQuery — status rule (DD3.32)', () => {
  it('DD3.32 — keeps a success query', () => {
    const query = seedSuccess(client, TIMESHEET_KEY, TIMESHEET_ROW);
    expect(shouldDehydrateQuery(query)).toBe(true);
  });

  it('DD3.32 — keeps an errored query that still holds its last good data', async () => {
    seedSuccess(client, TEAM_KEY, TEAM_DATA);
    const query = await failRefresh(client, TEAM_KEY);
    expect(query.state.data).toEqual(TEAM_DATA);

    expect(shouldDehydrateQuery(query)).toBe(true);
  });

  it('DD3.32 — drops an errored query with no data (first fetch failed)', async () => {
    const query = await failRefresh(client, PAYMENTS_KEY);
    expect(query.state.data).toBeUndefined();

    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('DD3.32 — drops a pending query', () => {
    const query = buildQuery(client, TIMESHEET_KEY);
    expect(query.state.status).toBe('pending');

    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it('DD3.32 — keeps a success query whose data is undefined (the default rule)', () => {
    const query = buildQuery(client, TIMESHEET_KEY);
    query.setState({ status: 'success', data: undefined, dataUpdatedAt: Date.now() });
    expect(query.state.status).toBe('success');
    expect(query.state.data).toBeUndefined();

    expect(shouldDehydrateQuery(query)).toBe(true);
  });
});

// ─── DD3.33: dev-mock rule ───────────────────────────────────────────────────

describe('shouldDehydrateQuery — the dev-mock view is never kept (DD3.33)', () => {
  it("DD3.33 — drops a success query whose data is stamped ownerKey 'dev-mock'", () => {
    const query = seedSuccess(client, REQUESTS_KEY, DEV_MOCK_VIEW);
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it("DD3.33 — drops an errored query that still holds the 'dev-mock' view", async () => {
    seedSuccess(client, REQUESTS_KEY, DEV_MOCK_VIEW);
    const query = await failRefresh(client, REQUESTS_KEY);
    expect(query.state.data).toEqual(DEV_MOCK_VIEW);

    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it("DD3.33 — the rule is on the data's stamp, not the key: a 'dev-mock' stamp elsewhere is dropped too", () => {
    const query = seedSuccess(client, TIMESHEET_KEY, { ...TIMESHEET_ROW, ownerKey: 'dev-mock' });
    expect(shouldDehydrateQuery(query)).toBe(false);
  });

  it("DD3.33 — keeps the owner's own view (ownerKey '79996|prod')", () => {
    const query = seedSuccess(client, REQUESTS_KEY, OWNER_VIEW);
    expect(shouldDehydrateQuery(query)).toBe(true);
  });

  it("DD3.33 — keeps the owner's own view after a failed refresh (errored, '79996|prod')", async () => {
    seedSuccess(client, REQUESTS_KEY, OWNER_VIEW);
    const query = await failRefresh(client, REQUESTS_KEY);
    expect(shouldDehydrateQuery(query)).toBe(true);
  });

  it('DD3.33 — keeps a legacy view with no ownerKey', () => {
    const query = seedSuccess(client, REQUESTS_KEY, { entries: [MOCK_MY_REQUESTS[2]], error: null });
    expect(shouldDehydrateQuery(query)).toBe(true);
  });

  it.each([
    ['an array', [1, 2]],
    ['a number', 5],
    ['null', null],
  ])('DD3.33 — keeps a success query whose data is %s, without throwing', (_label, data) => {
    const query = seedSuccess(client, ['nonObject', String(data)], data);
    expect(query.state.data).toEqual(data);

    expect(shouldDehydrateQuery(query)).toBe(true);
  });
});

// ─── DD3.34: round trip ──────────────────────────────────────────────────────

describe('dehydrate → JSON → hydrate round trip (DD3.34)', () => {
  async function seedAppCache(): Promise<void> {
    seedSuccess(client, REQUESTS_KEY, DEV_MOCK_VIEW);
    seedSuccess(client, TIMESHEET_KEY, TIMESHEET_ROW);
    seedSuccess(client, TEAM_KEY, TEAM_DATA);
    await failRefresh(client, TEAM_KEY);
    await failRefresh(client, PAYMENTS_KEY);
  }

  it('DD3.34 — the snapshot holds the timesheet row and the errored team query, and no myRequests entry', async () => {
    await seedAppCache();

    const state = dehydrate(client, { shouldDehydrateQuery });

    expect(snapshotKeys(state)).toEqual(keysOf(TIMESHEET_KEY, TEAM_KEY));
    expect(state.queries.some((q) => q.queryKey[0] === 'myRequests')).toBe(false);
  });

  it("DD3.34 — after a restart the team query is back as 'error' with the same data, idle", async () => {
    await seedAppCache();
    const persisted = JSON.parse(JSON.stringify(dehydrate(client, { shouldDehydrateQuery })));

    const restored = newClient();
    hydrate(restored, persisted);

    const team = restored.getQueryState(TEAM_KEY);
    expect(team?.status).toBe('error');
    expect(team?.data).toEqual(TEAM_DATA);
    expect(team?.fetchStatus).toBe('idle');

    expect(restored.getQueryState(TIMESHEET_KEY)?.status).toBe('success');
    expect(restored.getQueryData(TIMESHEET_KEY)).toEqual(TIMESHEET_ROW);
    expect(restored.getQueryState(REQUESTS_KEY)).toBeUndefined();
    expect(restored.getQueryState(PAYMENTS_KEY)).toBeUndefined();
    restored.clear();
  });
});

// ─── DD3.35: cross-spec contract (behavioural) ───────────────────────────────

describe("cross-spec contract: spec 02's real dev-mock view is not persisted (DD3.35)", () => {
  it('DD3.35 — buildMyRequestsQueryFn with devManagerView stamps DEV_MOCK_OWNER_KEY, and dehydrate drops it', async () => {
    mockLoadConfig.mockResolvedValue({ ...CONFIG, devManagerView: true });

    const data = await buildMyRequestsQueryFn('2026-10-22')();
    expect(data.ownerKey).toBe(DEV_MOCK_OWNER_KEY);

    client.setQueryData(REQUESTS_KEY, data);
    seedSuccess(client, TIMESHEET_KEY, TIMESHEET_ROW);
    const state = dehydrate(client, { shouldDehydrateQuery });

    expect(snapshotKeys(state)).toEqual(keysOf(TIMESHEET_KEY));
  });
});

// ─── DD3.36: static and module-shape checks ──────────────────────────────────

/** Module specifiers of every import / re-export / require in `code` (comments already stripped). */
function moduleSpecifiers(code: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((re) => Array.from(code.matchAll(re), (m) => m[1]));
}

/** The object literal passed as `persistOptions={{ … }}`, brace-matched ('' if absent). */
function persistOptionsOf(source: string): string {
  const start = source.indexOf('persistOptions={');
  if (start < 0) return '';
  let depth = 0;
  for (let i = start + 'persistOptions='.length; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

describe('queryPersist wiring and the shared literal (DD3.36)', () => {
  it("DD3.36 — DEV_MOCK_OWNER_KEY is 'dev-mock', the same literal useMyRequests.ts stamps", () => {
    expect(DEV_MOCK_OWNER_KEY).toBe('dev-mock');
    expect(codeOf(MY_REQUESTS_FILE)).toMatch(
      /\bDEV_MOCK_OWNER_KEY\s*=\s*'dev-mock'/,
    );
  });

  it('DD3.36 — queryPersist.ts imports nothing but @tanstack/react-query', () => {
    const specifiers = moduleSpecifiers(codeOf(PERSIST_FILE));
    expect(Array.from(new Set(specifiers))).toEqual(['@tanstack/react-query']);
  });

  it("DD3.36 — loads under the layout tests' partial @tanstack/react-query mock (nothing runs at module load)", () => {
    try {
      jest.isolateModules(() => {
        // The same shape as app/__tests__/layout-notifications.test.tsx: no dehydrate helpers
        jest.doMock('@tanstack/react-query', () => ({
          QueryClient: jest.fn(() => ({ defaultOptions: {} })),
          QueryClientProvider: jest.fn(),
          focusManager: { setEventListener: jest.fn() },
        }));
        let mod: typeof import('../queryPersist') | undefined;
        expect(() => {
          mod = jest.requireActual<typeof import('../queryPersist')>('../queryPersist');
        }).not.toThrow();
        expect(typeof mod?.shouldDehydrateQuery).toBe('function');
      });
    } finally {
      jest.dontMock('@tanstack/react-query');
    }
  });

  it("DD3.36 — app/_layout.tsx imports shouldDehydrateQuery from '@/src/lib/queryPersist' and passes it as persistOptions.dehydrateOptions", () => {
    const layout = codeOf(LAYOUT_FILE);
    expect(layout).toMatch(
      /import\s*\{[^}]*\bshouldDehydrateQuery\b[^}]*\}\s*from\s*'@\/src\/lib\/queryPersist'/,
    );
    expect(persistOptionsOf(layout)).toMatch(/\bdehydrateOptions:\s*\{\s*shouldDehydrateQuery\s*\}/);
  });

  it('DD3.36 — the persister, its key and the 24 h maxAge are unchanged, and there is no buster', () => {
    const layout = codeOf(LAYOUT_FILE);
    const options = persistOptionsOf(layout);
    expect(options).toMatch(/\bpersister:\s*asyncStoragePersister\b/);
    expect(options).toMatch(/\bmaxAge:\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24\b/);
    expect(layout).toMatch(/key:\s*'HOURGLASS_QUERY_CACHE'/);
    expect(layout).not.toMatch(/\bbuster\b/);
  });
});
