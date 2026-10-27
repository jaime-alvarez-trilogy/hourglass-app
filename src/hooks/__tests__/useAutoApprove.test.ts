// Tests: useAutoApprove — 1.2 manager auto-approve: runAutoApprovals (sequencing, error
// classification, simulated mode, per-item recheck), runAutoApproveCycle (lock, owner
// re-check, skip set, mid-run toggle-off / sign-out, outage retry), useAutoApproveRunner
// gating (contributor, roster error / loading, stale data, environment switch, sign-out,
// preview, overlap, invalidation), the work-diary proof of manual requests (the live case,
// no proof, the day either side, a failed read retried after AUTO_APPROVE_RETRY_MS, names
// never proof, whose diaries are read, UTC dates, no timeZoneId, no reads in the re-check
// or the preview), hand approve / reject during a run (with useApprovalItems), live-shape
// overtime requests (QA, 2026-10-27: overtimePeriod, no durationMinutes) fetched, approved
// and logged in minutes, useDirectReports (the v2 roster key), useManualOwners and
// useAutoApproveSettings.
//
// Rendered with react-test-renderer and a real QueryClient, as in
// __tests__/use-approval-items.test.ts. The network is never reached: the config store,
// getAuthToken, the approvals wrappers, the team API and fetchWorkDiary are mocked;
// AsyncStorage is the in-memory __mocks__ store. Approvals data is seeded with
// setQueryData(['approvals']). Manual requests carry legacy userIds (as the live pending
// response does) that match no roster id: only the mocked work diary ties them to people.

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AUTO_APPROVE_KEY,
  AUTO_APPROVE_RETRY_MS,
  __resetAutoApproveSession,
  runAutoApprovals,
  runAutoApproveCycle,
  useAutoApproveRunner,
  useAutoApproveSettings,
  useDirectReports,
  useManualOwners,
} from '../useAutoApprove';
import type { AutoApproveDeps } from '../useAutoApprove';
import { useApprovalItems } from '../useApprovalItems';
import { loadConfig, loadCredentials } from '../../store/config';
import { getAuthToken } from '../../api/client';
import {
  approveManual,
  approveOvertime,
  fetchPendingManual,
  fetchPendingOvertime,
  rejectManual,
} from '../../api/approvals';
import { fetchManagedAssignments, fetchMyTeams, fetchTeamRoster } from '../../api/team';
import { fetchWorkDiary } from '../../api/workDiary';
import { ApiError, NetworkError } from '../../api/errors';
import { log } from '../../lib/log';
import { redact } from '../../lib/redact';
import { readAutoApprove, setAutoApproveRule } from '../../lib/autoApproveStore';
import { MOCK_TEAM_ITEMS, MOCK_TEAM_ROSTER } from '../../lib/devMock';
import type { AutoApprovePlanItem, AutoApproveRules } from '../../lib/autoApprove';
import { getWeekStartDate, parseOvertimeItems } from '../../lib/approvals';
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem } from '../../lib/approvals';
import type { TeamMember, WorkDiarySlot } from '../../types/api';
import type { CrossoverConfig } from '../../types/config';
import { liveOvertime } from '../../__fixtures__/overtimeRequests';

// jest.mock calls are hoisted above the imports.
jest.mock('../../store/config', () => ({
  loadConfig: jest.fn(),
  loadCredentials: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
}));

jest.mock('../../api/approvals', () => ({
  fetchPendingManual: jest.fn(),
  fetchPendingOvertime: jest.fn(),
  approveManual: jest.fn(),
  rejectManual: jest.fn(),
  approveOvertime: jest.fn(),
  rejectOvertime: jest.fn(),
}));

// The roster is one fetchManagedAssignments() call; fetchMyTeams / fetchTeamRoster are
// mocked only to prove the roster never calls them.
jest.mock('../../api/team', () => ({
  fetchManagedAssignments: jest.fn(),
  fetchMyTeams: jest.fn(),
  fetchTeamRoster: jest.fn(),
}));

// The manual-ownership proof's only network call.
jest.mock('../../api/workDiary', () => ({
  fetchWorkDiary: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLoadConfig = loadConfig as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockGetAuthToken = getAuthToken as jest.Mock;
const mockApproveManual = approveManual as jest.Mock;
const mockApproveOvertime = approveOvertime as jest.Mock;
const mockRejectManual = rejectManual as jest.Mock;
const mockFetchPendingManual = fetchPendingManual as jest.Mock;
const mockFetchPendingOvertime = fetchPendingOvertime as jest.Mock;
const mockFetchManagedAssignments = fetchManagedAssignments as jest.Mock;
const mockFetchMyTeams = fetchMyTeams as jest.Mock;
const mockFetchTeamRoster = fetchTeamRoster as jest.Mock;
const mockFetchWorkDiary = fetchWorkDiary as jest.Mock;
const mockLogInfo = log.info as jest.Mock;
const mockAsyncStorage = AsyncStorage as typeof AsyncStorage & { _reset: () => void };

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MANAGER: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Manager Name',
  managerId: '2372227',
  primaryTeamId: '4584',
  assignmentId: '79996',
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  teams: [],
  lastRoleCheck: '2026-10-01T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-10-01T00:00:00.000Z',
  debugMode: false,
};
const CONTRIBUTOR: CrossoverConfig = { ...MANAGER, isManager: false };
const QA_MANAGER: CrossoverConfig = { ...MANAGER, useQA: true };
const PREVIEW: CrossoverConfig = { ...MANAGER, isManager: false, devManagerView: true };
const OWNER = '2362707|prod';

const CREDENTIALS = { username: 'manager@example.com', password: 'pass123' };
const CREDS_WITH_ENV = { ...CREDENTIALS, useQA: false };

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    assignmentId: '80001',
    candidateId: '3000001',
    userId: '1190001',
    managerId: MANAGER.userId,
    teamId: '4584',
    teamName: 'Platform',
    name: 'Ana Ruiz',
    isManager: false,
    ...overrides,
  };
}

const ANA = member({});
const BEN = member({ assignmentId: '80002', candidateId: '3000002', userId: '1190002', name: 'Ben Okafor' });
const SELF = member({ assignmentId: '79996', candidateId: MANAGER.userId, userId: '1190137', name: 'Manager Name' });
/** The live QA report (2026-10-27): assignment 80232, candidate.id 2374577, candidate.userId 1194942. */
const TEST_CC = member({ assignmentId: '80232', candidateId: '2374577', userId: '1194942', name: 'Test CC' });

function manualItem(
  id: string,
  userId: number,
  timecardIds: number[],
  startDateTime: string,
  overrides: Partial<ManualApprovalItem> = {},
): ManualApprovalItem {
  return {
    id,
    category: 'MANUAL',
    userId,
    fullName: 'Someone',
    durationMinutes: 60,
    hours: '1.0',
    description: 'Work',
    startDateTime,
    type: 'WEB',
    timecardIds,
    weekStartDate: '2026-10-19',
    fetchedFor: OWNER, // stamped by fetchAllApprovalItems
    ...overrides,
  };
}

function overtimeItem(overtimeId: number, assignmentId: number, personId: number): OvertimeApprovalItem {
  return {
    id: `ot-${overtimeId}`,
    category: 'OVERTIME',
    overtimeId,
    userId: 3000002,
    fullName: 'Someone',
    jobTitle: 'Engineer',
    durationMinutes: 120,
    hours: '2.0',
    cost: 100,
    description: 'Release',
    startDateTime: '2026-10-22T09:00:00Z',
    weekStartDate: '2026-10-19',
    assignmentId,
    personId,
    fetchedFor: OWNER,
  };
}

// Legacy userIds, as the pending-manual response sends them: they match nobody. The default
// diary (beforeEach) holds mt-11's timecard on Ana's assignment and mt-21-22's on Ben's.
const ANA_MANUAL = manualItem('mt-11', 36401, [11], '2026-10-20T10:00:00Z', { fullName: 'Ana Ruiz' });
const BEN_MANUAL = manualItem('mt-21-22', 36402, [21, 22], '2026-10-21T10:00:00Z', { fullName: 'Ben Okafor' });
const BEN_OVERTIME = overtimeItem(32, 80002, 1190002);
/** The live request: userId 36412 is in no roster; no offset on startDateTime (UTC). */
const LIVE_MANUAL = manualItem(
  'mt-280021041-280021042-280021043',
  36412,
  [280021041, 280021042, 280021043],
  '2026-10-27T04:30:00',
  { fullName: 'Test CC', durationMinutes: 30 },
);

const ON = { manual: true, overtime: true };
const MANUAL_ONLY = { manual: true, overtime: false };

/** The mocked work diary: assignmentId → UTC date → slot ids. */
type Diary = Record<string, Record<string, number[]>>;
let diary: Diary;
/** Slot ids the diary returns as tracked time (autoTracker true), not manual. */
let trackedIds: Set<number>;

function slot(id: number, date: string): WorkDiarySlot {
  return {
    id,
    tags: [],
    autoTracker: trackedIds.has(id),
    status: 'PENDING',
    memo: 'Work',
    actions: [],
    date: `${date}T10:00:00Z`,
    time: '10:00:00',
    activityLevel: 0,
    intensityScore: 0,
    productivityCategory: 'UNCATEGORIZED',
    activities: [],
    secondBrainDeepDive: null,
  };
}

/** The diary reads made so far, as `${assignmentId}|${date}`. */
const diaryReads = () => mockFetchWorkDiary.mock.calls.map(([a, d]) => `${a}|${d}`);

// ─── Harness ─────────────────────────────────────────────────────────────────

async function flush(rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise<void>((res) => setTimeout(res, 0));
    });
  }
}

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
}

type Probe<T> = { get: () => T; renderer: ReactTestRenderer };

function mount<T>(queryClient: QueryClient, useHook: () => T): Probe<T> {
  let current!: T;
  const Child = () => {
    current = useHook();
    return null;
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Child)),
    );
  });
  return { get: () => current, renderer };
}

/** Seeds rules for MANAGER (loadConfig must already return MANAGER-owned config). */
async function seedRules(rules: AutoApproveRules, ownerKey = OWNER) {
  for (const [personId, rule] of Object.entries(rules)) {
    await setAutoApproveRule(ownerKey, personId, rule);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAsyncStorage._reset();
  __resetAutoApproveSession();
  mockLoadConfig.mockReset();
  mockLoadConfig.mockResolvedValue(MANAGER);
  mockLoadCredentials.mockResolvedValue(CREDENTIALS);
  mockGetAuthToken.mockResolvedValue('mock-token');
  mockApproveManual.mockReset();
  mockApproveManual.mockResolvedValue(undefined);
  mockApproveOvertime.mockReset();
  mockApproveOvertime.mockResolvedValue(undefined);
  mockFetchManagedAssignments.mockReset();
  mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA]);
  mockFetchMyTeams.mockReset();
  mockFetchTeamRoster.mockReset();
  diary = { '80001': { '2026-10-20': [11] }, '80002': { '2026-10-21': [21, 22] } };
  trackedIds = new Set();
  mockFetchWorkDiary.mockReset();
  mockFetchWorkDiary.mockImplementation(async (assignmentId: string, date: string) =>
    (diary[assignmentId]?.[date] ?? []).map((id) => slot(id, date)));
});

// ─── runAutoApprovals ────────────────────────────────────────────────────────

describe('runAutoApprovals', () => {
  const plan: AutoApprovePlanItem[] = [
    { item: ANA_MANUAL, member: ANA, allowOvertime: false },
    { item: BEN_MANUAL, member: BEN, allowOvertime: true },
    { item: BEN_OVERTIME, member: BEN, allowOvertime: true },
  ];

  function deps(overrides: Partial<AutoApproveDeps> = {}): AutoApproveDeps {
    let t = Date.UTC(2026, 9, 26, 12, 0, 0);
    return {
      approveManual: jest.fn().mockResolvedValue(undefined),
      approveOvertime: jest.fn().mockResolvedValue(undefined),
      now: () => new Date((t += 1000)),
      simulated: false,
      ...overrides,
    };
  }

  it('runs one item at a time, in plan order', async () => {
    const events: string[] = [];
    const gates = [deferred(), deferred(), deferred()];
    let call = 0;
    const next = (label: string) => {
      const gate = gates[call++];
      events.push(`start ${label}`);
      return gate.promise.then(() => {
        events.push(`end ${label}`);
      });
    };
    const d = deps({
      approveManual: (item) => next(item.id),
      approveOvertime: (item) => next(item.id),
    });

    const run = runAutoApprovals(plan, d);
    await Promise.resolve();
    expect(events).toEqual(['start mt-11']);
    gates[0].resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['start mt-11', 'end mt-11', 'start mt-21-22']);
    gates[1].resolve();
    gates[2].resolve();
    await run;
    expect(events).toEqual(['start mt-11', 'end mt-11', 'start mt-21-22', 'end mt-21-22', 'start ot-32', 'end ot-32']);
  });

  it('passes allowOvertime from the plan and routes by category', async () => {
    const d = deps();
    await runAutoApprovals(plan, d);
    expect(d.approveManual).toHaveBeenNthCalledWith(1, ANA_MANUAL, false);
    expect(d.approveManual).toHaveBeenNthCalledWith(2, BEN_MANUAL, true);
    expect(d.approveOvertime).toHaveBeenCalledWith(BEN_OVERTIME);
  });

  it('classifies each failure and never throws', async () => {
    const d = deps({
      approveManual: jest
        .fn()
        .mockRejectedValueOnce(new ApiError(400, undefined, { errorCode: 'CROS-9300' }))
        .mockRejectedValueOnce(new ApiError(400, undefined, { errorCode: 'CROS-9101' })),
      approveOvertime: jest.fn().mockRejectedValue(new ApiError(409)),
    });
    const entries = await runAutoApprovals(plan, d);
    expect(entries.map((e) => e.outcome)).toEqual(['over_limit', 'deadline_passed', 'failed']);
  });

  it('an outage is logged as retrying, not failed', async () => {
    const d = deps({
      approveManual: jest
        .fn()
        .mockRejectedValueOnce(new NetworkError('Network request failed'))
        .mockRejectedValueOnce(new ApiError(502)),
      approveOvertime: jest.fn().mockRejectedValue(new ApiError(429)),
    });
    const entries = await runAutoApprovals(plan, d);
    expect(entries.map((e) => e.outcome)).toEqual(['retrying', 'retrying', 'retrying']);
  });

  it('logs one entry per item with the member, the item and the attempt time', async () => {
    const entries = await runAutoApprovals(plan.slice(0, 1), deps());
    expect(entries).toEqual([
      {
        id: 'mt-11',
        personId: '1190001',
        name: 'Ana Ruiz',
        category: 'MANUAL',
        durationMinutes: 60,
        startDateTime: '2026-10-20T10:00:00Z',
        at: '2026-10-26T12:00:01.000Z',
        outcome: 'approved',
      },
    ]);
  });

  it('logs a live-shape overtime item (overtimePeriod, no durationMinutes) in minutes', async () => {
    const [live] = parseOvertimeItems([liveOvertime({}, { id: 80002 })]);
    const entries = await runAutoApprovals([{ item: live, member: BEN, allowOvertime: true }], deps());
    expect(entries).toEqual([
      {
        id: 'ot-9902122',
        personId: '1190002',
        name: 'Ben Okafor',
        category: 'OVERTIME',
        durationMinutes: 120, // was NaN: the 1.0 parser read the absent durationMinutes
        startDateTime: '2026-10-19T00:00:00',
        at: '2026-10-26T12:00:01.000Z',
        outcome: 'approved',
      },
    ]);
  });

  it('simulated: calls neither dep, marks every entry approved + simulated', async () => {
    const d = deps({ simulated: true });
    const entries = await runAutoApprovals(plan, d);
    expect(d.approveManual).not.toHaveBeenCalled();
    expect(d.approveOvertime).not.toHaveBeenCalled();
    expect(entries.every((e) => e.outcome === 'approved' && e.simulated === true)).toBe(true);
  });

  it('returns [] for an empty plan', async () => {
    expect(await runAutoApprovals([], deps())).toEqual([]);
  });

  it('recheck before each item: null skips it, a re-planned item is used, \'stop\' ends the run', async () => {
    const d = deps({
      recheck: jest
        .fn()
        .mockResolvedValueOnce(null) // Ana: toggle turned off
        .mockResolvedValueOnce({ ...plan[1], allowOvertime: false }) // Ben: overtime turned off
        .mockResolvedValueOnce('stop'), // signed out
    });
    const entries = await runAutoApprovals(plan, d);
    expect(d.recheck).toHaveBeenCalledTimes(3);
    expect(d.approveManual).toHaveBeenCalledTimes(1);
    expect(d.approveManual).toHaveBeenCalledWith(BEN_MANUAL, false);
    expect(d.approveOvertime).not.toHaveBeenCalled();
    expect(entries.map((e) => e.id)).toEqual(['mt-21-22']);
  });
});

// ─── runAutoApproveCycle ─────────────────────────────────────────────────────

describe('runAutoApproveCycle', () => {
  const input = (queryClient: QueryClient, items: ApprovalItem[] = [ANA_MANUAL]) => ({
    mode: 'real' as const,
    ownerKey: OWNER,
    items,
    reports: [ANA, BEN],
    queryClient,
  });

  it('approves with config.userId as approverId and the renewal creds last', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const entries = await runAutoApproveCycle(input(makeClient()));
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [11], false, CREDS_WITH_ENV);
    expect(entries?.map((e) => e.outcome)).toEqual(['approved']);
  });

  it('approves overtime by overtimeId', async () => {
    await seedRules({ '1190002': { manual: false, overtime: true } });
    await runAutoApproveCycle(input(makeClient(), [BEN_OVERTIME]));
    expect(mockApproveOvertime).toHaveBeenCalledWith('mock-token', false, 32, CREDS_WITH_ENV);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('the lock prevents an overlapping run', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const client = makeClient();

    const first = runAutoApproveCycle(input(client));
    const second = await runAutoApproveCycle(input(client));
    expect(second).toBeNull();

    gate.resolve();
    expect((await first)?.length).toBe(1);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('never retries an item the server answered for this session, whatever the answer', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockApproveManual.mockRejectedValueOnce(new ApiError(409));
    const client = makeClient();
    expect((await runAutoApproveCycle(input(client)))?.map((e) => e.outcome)).toEqual(['failed']);
    expect(await runAutoApproveCycle(input(client))).toEqual([]);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('retries an outage (network, 5xx) on a fetch after AUTO_APPROVE_RETRY_MS, never a server answer', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': ON });
    mockApproveManual
      .mockRejectedValueOnce(new NetworkError('Network request failed')) // Ana
      .mockRejectedValueOnce(new ApiError(400, undefined, { errorCode: 'CROS-9101' })); // Ben manual
    mockApproveOvertime.mockRejectedValueOnce(new ApiError(503)); // Ben overtime
    const client = makeClient();
    const items = [ANA_MANUAL, BEN_MANUAL, BEN_OVERTIME];
    expect((await runAutoApproveCycle(input(client, items)))?.map((e) => e.outcome)).toEqual([
      'retrying',
      'deadline_passed',
      'retrying',
    ]);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'approvals.auto_run',
      expect.objectContaining({ approved: 0, pastDeadline: 1, retrying: 2, failed: 0 }),
    );

    // The next fetch right away: the outages are still backing off. Used to skip them
    // for the rest of the process lifetime.
    expect(await runAutoApproveCycle(input(client, items))).toEqual([]);

    const later = Date.now() + AUTO_APPROVE_RETRY_MS + 1;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      const entries = await runAutoApproveCycle(input(client, items));
      expect(entries?.map((e) => [e.id, e.outcome])).toEqual([
        ['mt-11', 'approved'],
        ['ot-32', 'approved'],
      ]);
      // Approved now: not attempted again
      expect(await runAutoApproveCycle(input(client, items))).toEqual([]);
    } finally {
      now.mockRestore();
    }
    expect(mockApproveManual).toHaveBeenCalledTimes(3);
    expect(mockApproveOvertime).toHaveBeenCalledTimes(2);
    // Each attempt is in the store log, newest first
    expect((await readAutoApprove(OWNER)).log.map((e) => [e.id, e.outcome])).toEqual([
      ['ot-32', 'approved'],
      ['mt-11', 'approved'],
      ['ot-32', 'retrying'],
      ['mt-21-22', 'deadline_passed'],
      ['mt-11', 'retrying'],
    ]);
  });

  it('a non-retryable failure (a 4xx answer) is never retried, even after AUTO_APPROVE_RETRY_MS', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockApproveManual.mockRejectedValueOnce(new ApiError(422));
    const client = makeClient();
    expect((await runAutoApproveCycle(input(client)))?.map((e) => e.outcome)).toEqual(['failed']);
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTO_APPROVE_RETRY_MS + 1);
    try {
      expect(await runAutoApproveCycle(input(client))).toEqual([]);
    } finally {
      now.mockRestore();
    }
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('a toggle turned off mid-run skips what it covered; turned on again, it runs', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const client = makeClient();

    const run = runAutoApproveCycle(input(client, [ANA_MANUAL, BEN_MANUAL]));
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1); // Ana's, in flight
    await setAutoApproveRule(OWNER, '1190002', { manual: false });
    gate.resolve();

    // Used to approve Ben's too: the plan was made before the toggle changed
    expect((await run)?.map((e) => e.id)).toEqual(['mt-11']);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect((await readAutoApprove(OWNER)).log.map((e) => e.id)).toEqual(['mt-11']);

    // Never attempted, so not in the skip set
    await setAutoApproveRule(OWNER, '1190002', { manual: true });
    expect((await runAutoApproveCycle(input(client, [BEN_MANUAL])))?.map((e) => e.id)).toEqual(['mt-21-22']);
  });

  it('overtime turned off mid-run: the rest of the manual time is approved without allowOvertime', async () => {
    await seedRules({ '1190001': ON, '1190002': ON });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const run = runAutoApproveCycle(input(makeClient(), [ANA_MANUAL, BEN_MANUAL]));
    await flush();
    await setAutoApproveRule(OWNER, '1190002', { overtime: false });
    gate.resolve();
    await run;
    expect(mockApproveManual).toHaveBeenNthCalledWith(1, 'mock-token', false, MANAGER.userId, [11], true, CREDS_WITH_ENV);
    expect(mockApproveManual).toHaveBeenNthCalledWith(2, 'mock-token', false, MANAGER.userId, [21, 22], false, CREDS_WITH_ENV);
  });

  it('a sign-out mid-run stops it before the next call', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const run = runAutoApproveCycle(input(makeClient(), [ANA_MANUAL, BEN_MANUAL, BEN_OVERTIME]));
    await flush();
    mockLoadConfig.mockResolvedValue(null);
    gate.resolve();
    expect((await run)?.map((e) => e.id)).toEqual(['mt-11']);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(mockApproveOvertime).not.toHaveBeenCalled();
  });

  it('re-reads the rules from the store (a stale query copy cannot approve)', async () => {
    // No rules in the store at all.
    expect(await runAutoApproveCycle(input(makeClient()))).toEqual([]);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('does nothing when the configured owner changed (signed out / switched env)', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockLoadConfig.mockResolvedValue({ ...MANAGER, useQA: true });
    expect(await runAutoApproveCycle(input(makeClient()))).toEqual([]);
    mockLoadConfig.mockResolvedValue(null);
    expect(await runAutoApproveCycle(input(makeClient()))).toEqual([]);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('does nothing when the account is no longer a manager', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockLoadConfig.mockResolvedValue(CONTRIBUTOR);
    expect(await runAutoApproveCycle(input(makeClient()))).toEqual([]);
    expect(mockGetAuthToken).not.toHaveBeenCalled();
  });

  it('a token failure aborts before any attempt, so the next fetch tries again', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockGetAuthToken.mockRejectedValueOnce(new Error('offline'));
    const client = makeClient();
    expect(await runAutoApproveCycle(input(client))).toEqual([]);
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect(await runAutoApproveCycle(input(client))).toHaveLength(1);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('appends every outcome to the store log and logs counts only', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': ON });
    mockApproveManual
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError(400, undefined, { errorCode: 'CROS-9301' }));
    mockApproveOvertime.mockRejectedValueOnce(new ApiError(400, undefined, { errorCode: 'CROS-9101' }));
    await runAutoApproveCycle(input(makeClient(), [BEN_OVERTIME, BEN_MANUAL, ANA_MANUAL]));

    const { log: stored } = await readAutoApprove(OWNER);
    expect(stored.map((e) => [e.id, e.outcome])).toEqual([
      ['ot-32', 'deadline_passed'],
      ['mt-21-22', 'over_limit'],
      ['mt-11', 'approved'],
    ]);
    expect(mockLogInfo).toHaveBeenCalledWith('approvals.auto_run', {
      approved: 1,
      overLimit: 1,
      pastDeadline: 1,
      retrying: 0,
      failed: 0,
      simulated: false,
    });
  });

  it('the auto_run event survives redaction: counts only, no key the logger drops', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockApproveManual.mockRejectedValueOnce(new NetworkError('Network request failed'));
    await runAutoApproveCycle(input(makeClient()));
    const call = mockLogInfo.mock.calls.find(([event]) => event === 'approvals.auto_run');
    const fields = call?.[1] as Record<string, unknown>;
    expect(fields).toMatchObject({ retrying: 1, failed: 0 });
    expect(redact(fields)).toEqual(fields);
  });

  it('invalidates [approvals] after at least one real approval, and not otherwise', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const client = makeClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    mockApproveManual.mockRejectedValueOnce(new ApiError(409));
    await runAutoApproveCycle(input(client, [ANA_MANUAL]));
    expect(spy).not.toHaveBeenCalled();
    await runAutoApproveCycle(input(client, [BEN_MANUAL]));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['approvals'] });
  });

  it('puts the saved store in the settings query data', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const client = makeClient();
    await runAutoApproveCycle(input(client));
    const data = client.getQueryData<{ log: unknown[] }>([...AUTO_APPROVE_KEY, OWNER]);
    expect(data?.log).toHaveLength(1);
  });
});

// ─── useAutoApproveRunner ────────────────────────────────────────────────────

describe('useAutoApproveRunner', () => {
  it('a manager with a rule on: approves the covered items once and invalidates [approvals]', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const client = makeClient();
    client.setQueryData(['approvals'], [BEN_MANUAL, ANA_MANUAL]);
    const spy = jest.spyOn(client, 'invalidateQueries');

    const probe = mount(client, useAutoApproveRunner);
    await flush();

    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [11], false, CREDS_WITH_ENV);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['approvals'] });
    expect(probe.get().lastRun.map((e) => e.id)).toEqual(['mt-11']);
    expect(probe.get().running).toBe(false);

    // Fresh data with the same item (e.g. the server lagged): not attempted again.
    act(() => {
      client.setQueryData(['approvals'], [BEN_MANUAL, ANA_MANUAL]);
    });
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('not a manager: nothing runs and the roster is never fetched', async () => {
    mockLoadConfig.mockResolvedValue(CONTRIBUTOR);
    await seedRules({ '1190001': MANUAL_ONLY });
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
  });

  it('roster error: nothing runs', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockFetchManagedAssignments.mockRejectedValue(new Error('roster failed'));
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockFetchManagedAssignments).toHaveBeenCalled();
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('never approves an item fetched for another owner (a fetch that landed after a switch)', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const client = makeClient();
    // Ana's item came from a QA fetch that started before the switch to prod
    client.setQueryData(['approvals'], [{ ...ANA_MANUAL, fetchedFor: '2362707|qa' }, BEN_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockApproveManual.mock.calls.map((c) => c[3])).toEqual([[21, 22]]); // Ben's only
  });

  it('never approves an unstamped item (a copy from an older build fails closed)', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const client = makeClient();
    client.setQueryData(['approvals'], [{ ...ANA_MANUAL, fetchedFor: undefined }, BEN_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockApproveManual.mock.calls.map((c) => c[3])).toEqual([[21, 22]]);
  });

  it('roster still loading: nothing runs', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockFetchManagedAssignments.mockReturnValue(new Promise(() => {}));
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('approvals data from before this session (restored cache): nothing runs', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL], { updatedAt: 1 });

    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();

    // The first fetch of this session does run.
    act(() => {
      client.setQueryData(['approvals'], [ANA_MANUAL]);
    });
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('after an environment switch, approvals and a roster fetched for the old one never run', async () => {
    // Prod rules exist; the app is on QA (no QA rules), with the QA queue fetched.
    await seedRules({ '1190001': MANUAL_ONLY });
    mockLoadConfig.mockResolvedValue(QA_MANAGER);
    const client = makeClient();
    mount(client, useAutoApproveRunner);
    await flush();
    act(() => {
      client.setQueryData(['approvals'], [ANA_MANUAL]);
    });
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();

    // Back to prod, as app/modal.tsx does it: the new config in the cache, then everything
    // invalidated. ['approvals'] keeps the QA data meanwhile (same key in both
    // environments), and the prod roster's fetch is held.
    const prodRoster = deferred<TeamMember[]>();
    const qaRoster = mockFetchManagedAssignments.getMockImplementation();
    mockFetchManagedAssignments.mockImplementation((token: string, useQA: boolean) =>
      useQA ? qaRoster?.(token, useQA) : prodRoster.promise);
    mockLoadConfig.mockResolvedValue(MANAGER);
    act(() => {
      client.setQueryData(['config'], MANAGER);
      void client.invalidateQueries();
    });
    await flush();
    // Used to approve the QA queue's timecard ids with the prod token
    expect(mockApproveManual).not.toHaveBeenCalled();

    // The prod queue lands, the prod roster has not: nothing yet
    act(() => {
      client.setQueryData(['approvals'], [ANA_MANUAL]);
    });
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();

    // The prod roster lands
    prodRoster.resolve([SELF, BEN, ANA]);
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [11], false, CREDS_WITH_ENV);
  });

  it('after an environment switch, the old environment\'s roster is never taken for the new one\'s', async () => {
    // Ana is on the manager's QA team only (QA seeded from an older prod); Ben is on both.
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    mockFetchManagedAssignments.mockImplementation(async (_token: string, useQA: boolean) =>
      useQA ? [SELF, BEN, ANA] : [SELF, BEN]);
    mockLoadConfig.mockResolvedValue(QA_MANAGER);
    const client = makeClient();
    mount(client, useAutoApproveRunner);
    await flush();

    // To prod, as app/modal.tsx does it. invalidateQueries() runs before any re-render, so
    // the roster query it refetches still has the QA config's queryFn; that fetch is held
    // until the runner has seen the prod owner.
    const qaRefetch = deferred<TeamMember[]>();
    mockFetchManagedAssignments.mockReturnValueOnce(qaRefetch.promise);
    mockLoadConfig.mockResolvedValue(MANAGER);
    act(() => {
      client.setQueryData(['config'], MANAGER);
      void client.invalidateQueries();
    });
    await flush();
    act(() => {
      client.setQueryData(['approvals'], [ANA_MANUAL, BEN_MANUAL]);
    });
    await flush();
    qaRefetch.resolve([SELF, BEN, ANA]);
    await flush();

    // Used to land under the shared key after the switch and pass as prod's roster, so
    // Ana's prod time was approved under a QA team membership
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [21, 22], false, CREDS_WITH_ENV);
  });

  it('signed out and back in as the same owner (after a switch): the new queries\' data runs', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const client = makeClient();
    const tabs = mount(client, useAutoApproveRunner);
    await flush();

    // prod -> QA -> prod, as app/modal.tsx does it, a queue fetched in each: the prod
    // owner's baseline is now the counts at the switch back
    for (const config of [QA_MANAGER, MANAGER]) {
      mockLoadConfig.mockResolvedValue(config);
      act(() => {
        client.setQueryData(['config'], config);
        void client.invalidateQueries();
      });
      await flush();
      act(() => {
        client.setQueryData(['approvals'], config.useQA ? [] : [ANA_MANUAL]);
      });
      await flush();
    }
    expect(mockApproveManual).toHaveBeenCalledTimes(1); // Ana's

    // Sign out (app/modal.tsx): the tabs unmount and queryClient.clear() drops every
    // query. Signed back in as the same manager on prod, toggles on again, a queue lands.
    tabs.renderer.unmount();
    client.clear();
    mount(client, useAutoApproveRunner);
    await flush();
    act(() => {
      client.setQueryData(['approvals'], [BEN_MANUAL]);
    });
    await flush();

    // Used to wait for the recreated queries to pass the old counts (the roster, with its
    // 24h staleTime, never did): auto-approve stayed off until the app was killed
    expect(mockApproveManual).toHaveBeenCalledTimes(2);
    expect(mockApproveManual).toHaveBeenLastCalledWith('mock-token', false, MANAGER.userId, [21, 22], false, CREDS_WITH_ENV);
  });

  it('overtime on a report\'s second team (a deduped roster row) runs; one off the roster does not', async () => {
    await seedRules({ '1190001': { manual: false, overtime: true } });
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA, anaOnOtherTeam]);
    const client = makeClient();
    // Both are Ana's (personId 1190001); 80777 is not one of the manager's assignments
    client.setQueryData(['approvals'], [overtimeItem(41, 80099, 1190001), overtimeItem(42, 80777, 1190001)]);

    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveOvertime).toHaveBeenCalledTimes(1);
    expect(mockApproveOvertime).toHaveBeenCalledWith('mock-token', false, 41, CREDS_WITH_ENV);
  });

  it('no rules: nothing runs', async () => {
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL, BEN_OVERTIME]);
    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect(mockApproveOvertime).not.toHaveBeenCalled();
    expect(mockGetAuthToken).toHaveBeenCalledTimes(1); // the roster fetch only
    expect(mockFetchWorkDiary).not.toHaveBeenCalled(); // no Manual time toggle on: nothing to prove
    expect(mockLogInfo).not.toHaveBeenCalledWith('approvals.auto_run', expect.anything());
  });

  it('dev manager preview: simulated — no API calls, simulated log entries, items removed', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    await seedRules({ '9901': MANUAL_ONLY }); // Alice Chen in MOCK_TEAM_ROSTER / MOCK_TEAM_ITEMS
    const client = makeClient();
    client.setQueryData(['approvals'], MOCK_TEAM_ITEMS.map((i) => ({ ...i, fetchedFor: OWNER })));

    const probe = mount(client, useAutoApproveRunner);
    await flush();

    // No network at all: the mock requests resolve by the mock roster's userId (preview only)
    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockLoadCredentials).not.toHaveBeenCalled();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect(mockApproveOvertime).not.toHaveBeenCalled();
    expect(client.getQueryData<ApprovalItem[]>(['approvals'])?.map((i) => i.id)).toEqual(['mt-mock-1002']);
    expect(probe.get().lastRun).toEqual([
      expect.objectContaining({ id: 'mt-mock-1001', personId: '9901', outcome: 'approved', simulated: true }),
    ]);
    const { log: stored } = await readAutoApprove(OWNER);
    expect(stored.map((e) => [e.id, e.simulated])).toEqual([['mt-mock-1001', true]]);
    expect(mockLogInfo).toHaveBeenCalledWith('approvals.auto_run', expect.objectContaining({ approved: 1, simulated: true }));

    // The mock queue comes back on refetch: the simulated approval stays gone and does not repeat.
    act(() => {
      client.setQueryData(['approvals'], MOCK_TEAM_ITEMS.map((i) => ({ ...i, fetchedFor: OWNER })));
    });
    await flush();
    expect(client.getQueryData<ApprovalItem[]>(['approvals'])?.map((i) => i.id)).toEqual(['mt-mock-1002']);
    expect((await readAutoApprove(OWNER)).log).toHaveLength(1);
  });

  it('dev manager preview: a later launch keeps an earlier simulated approval and does not repeat it', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    await seedRules({ '9901': MANUAL_ONLY });
    const first = makeClient();
    first.setQueryData(['approvals'], MOCK_TEAM_ITEMS.map((i) => ({ ...i, fetchedFor: OWNER })));
    mount(first, useAutoApproveRunner);
    await flush();
    expect((await readAutoApprove(OWNER)).log).toHaveLength(1);

    // Next launch: the in-memory session is gone, the store keeps the log, and the mock
    // queue comes back with the same request.
    __resetAutoApproveSession();
    const next = makeClient();
    next.setQueryData(['approvals'], MOCK_TEAM_ITEMS.map((i) => ({ ...i, fetchedFor: OWNER })));
    mount(next, useAutoApproveRunner);
    await flush();

    expect((await readAutoApprove(OWNER)).log).toHaveLength(1);
    expect(next.getQueryData<ApprovalItem[]>(['approvals'])?.map((i) => i.id)).toEqual(['mt-mock-1002']);
  });

  it('two mounted runners never overlap (module-level lock)', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);

    const a = mount(client, useAutoApproveRunner);
    const b = mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(a.get().running || b.get().running).toBe(true);

    gate.resolve();
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(a.get().running).toBe(false);
    expect(b.get().running).toBe(false);
  });

  it('an item that arrives during a run is approved once the lock is released', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);

    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);

    act(() => {
      client.setQueryData(['approvals'], [ANA_MANUAL, BEN_MANUAL]);
    });
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1); // locked

    gate.resolve();
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(2);
    expect(mockApproveManual).toHaveBeenLastCalledWith('mock-token', false, MANAGER.userId, [21, 22], false, CREDS_WITH_ENV);
  });

  it('turning a toggle on runs at once on the current data', async () => {
    const client = makeClient();
    client.setQueryData(['approvals'], [ANA_MANUAL]);
    const settings = mount(client, useAutoApproveSettings);
    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();

    await act(async () => {
      await settings.get().setRule('1190001', { manual: true });
    });
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });
});

// ─── Manual requests: the work-diary proof ───────────────────────────────────

describe('manual requests: the work-diary proof', () => {
  /** The runner on a fresh client with `items` as this session's approvals data. */
  async function runWith(items: ApprovalItem[]) {
    const client = makeClient();
    client.setQueryData(['approvals'], items);
    const probe = mount(client, useAutoApproveRunner);
    await flush();
    return { client, probe };
  }

  it('the live case: a request whose userId matches nobody (36412) is approved once the diary proves it', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA, TEST_CC]);
    diary['80232'] = { '2026-10-27': [280021040, 280021041, 280021042, 280021043] };
    await seedRules({ '1194942': MANUAL_ONLY });

    const { probe } = await runWith([LIVE_MANUAL]);

    // The report's assignment and the UTC date of "2026-10-27T04:30:00" (no offset), with
    // the 4 arguments fetchWorkDiary takes: no timeZoneId
    expect(mockFetchWorkDiary.mock.calls).toEqual([['80232', '2026-10-27', CREDENTIALS, false]]);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect(mockApproveManual).toHaveBeenCalledWith(
      'mock-token', false, MANAGER.userId, [280021041, 280021042, 280021043], false, CREDS_WITH_ENV,
    );
    expect(probe.get().lastRun).toEqual([
      expect.objectContaining({ id: LIVE_MANUAL.id, personId: '1194942', name: 'Test CC', outcome: 'approved' }),
    ]);
  });

  it('the diary not holding every timecardId: not approved', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, TEST_CC]);
    diary['80232'] = { '2026-10-27': [280021041, 280021042] }; // 280021043 missing
    await seedRules({ '1194942': ON });
    await runWith([LIVE_MANUAL]);
    // Its UTC date, then the day either side before "not theirs"
    expect(diaryReads()).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect((await readAutoApprove(OWNER)).log).toEqual([]);
  });

  it('the ids on the day before its UTC date (a diary day that is not the UTC day): approved', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, TEST_CC]);
    diary['80232'] = { '2026-10-26': LIVE_MANUAL.timecardIds };
    await seedRules({ '1194942': MANUAL_ONLY });
    await runWith([LIVE_MANUAL]);
    expect(diaryReads()).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(mockApproveManual).toHaveBeenCalledWith(
      'mock-token', false, MANAGER.userId, LIVE_MANUAL.timecardIds, false, CREDS_WITH_ENV,
    );
  });

  it('tracked slots (autoTracker true) are no proof, even with the same ids', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, TEST_CC]);
    diary['80232'] = { '2026-10-27': LIVE_MANUAL.timecardIds };
    trackedIds = new Set([280021042]);
    await seedRules({ '1194942': MANUAL_ONLY });
    await runWith([LIVE_MANUAL]);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('a failed diary read: not approved, and read again (then approved) on a fetch AUTO_APPROVE_RETRY_MS later', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, TEST_CC]);
    diary['80232'] = { '2026-10-27': LIVE_MANUAL.timecardIds };
    mockFetchWorkDiary.mockRejectedValueOnce(new NetworkError('Network request failed'));
    await seedRules({ '1194942': MANUAL_ONLY });

    const { client } = await runWith([LIVE_MANUAL]);
    // The UTC date failed; the day either side was read and did not prove it either
    expect(diaryReads()).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(mockApproveManual).not.toHaveBeenCalled();
    expect((await readAutoApprove(OWNER)).log).toEqual([]); // never attempted, so nothing logged

    // A fetch AUTO_APPROVE_RETRY_MS later: the failure was not cached, so the diary is read again
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTO_APPROVE_RETRY_MS + 1);
    try {
      act(() => {
        client.setQueryData(['approvals'], [LIVE_MANUAL]);
      });
      await flush();
    } finally {
      now.mockRestore();
    }
    expect(diaryReads()).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28', '80232|2026-10-27']);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('a diary that keeps failing is not read again, and starts no run, until AUTO_APPROVE_RETRY_MS has passed', async () => {
    mockFetchManagedAssignments.mockResolvedValue([SELF, ANA, TEST_CC]);
    const fallback = mockFetchWorkDiary.getMockImplementation()!;
    mockFetchWorkDiary.mockImplementation(async (assignmentId: string, date: string) => {
      if (assignmentId === '80232') throw new ApiError(500, undefined, { errorCode: 'CROS-0000' });
      return fallback(assignmentId, date);
    });
    await seedRules({ '1194942': MANUAL_ONLY, '1190001': MANUAL_ONLY });

    const { client } = await runWith([LIVE_MANUAL]);
    // Test CC's three failed; Ana's three settled it as not hers
    expect(diaryReads().sort()).toEqual([
      '80001|2026-10-26',
      '80001|2026-10-27',
      '80001|2026-10-28',
      '80232|2026-10-26',
      '80232|2026-10-27',
      '80232|2026-10-28',
    ]);
    const credentialReads = mockLoadCredentials.mock.calls.length;

    // The next fetch right away: Test CC's reads are waiting out their retry, so no run starts
    act(() => {
      client.setQueryData(['approvals'], [LIVE_MANUAL]);
    });
    await flush();
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(6);
    expect(mockLoadCredentials).toHaveBeenCalledTimes(credentialReads);

    // A run started for another request does not read them again either
    act(() => {
      client.setQueryData(['approvals'], [LIVE_MANUAL, ANA_MANUAL]);
    });
    await flush();
    expect(diaryReads().slice(6)).toEqual(['80001|2026-10-20']);
    expect(mockApproveManual).toHaveBeenCalledTimes(1); // Ana's
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [11], false, CREDS_WITH_ENV);

    // AUTO_APPROVE_RETRY_MS later: read again (and failing, waiting again)
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTO_APPROVE_RETRY_MS + 1);
    try {
      act(() => {
        client.setQueryData(['approvals'], [LIVE_MANUAL]);
      });
      await flush();
    } finally {
      now.mockRestore();
    }
    expect(diaryReads().slice(7)).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
  });

  it('a name match alone is never proof', async () => {
    // Ana's name AND Ana's candidate.userId on the request, but her diary does not hold it
    const named = manualItem('mt-91', 1190001, [91], '2026-10-20T10:00:00Z', { fullName: 'Ana Ruiz' });
    await seedRules({ '1190001': ON });
    await runWith([named]);
    expect(diaryReads()).toEqual(['80001|2026-10-20', '80001|2026-10-19', '80001|2026-10-21']);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('reads only the diaries of reports whose Manual time is on, every one of their assignments', async () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA, anaOnOtherTeam]);
    // Ben's request; Ben has Overtime only, Ana has Manual time on
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': { manual: false, overtime: true } });
    await runWith([BEN_MANUAL]);
    // Ana's two assignments only (its UTC date and the day either side): never Ben's
    // (toggle off) or the manager's own
    expect(diaryReads().sort()).toEqual([
      '80001|2026-10-20',
      '80001|2026-10-21',
      '80001|2026-10-22',
      '80099|2026-10-20',
      '80099|2026-10-21',
      '80099|2026-10-22',
    ]);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('manual time proven on a report\'s second assignment is approved for that report', async () => {
    const anaOnOtherTeam = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Other' });
    mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA, anaOnOtherTeam]);
    diary['80099'] = { '2026-10-20': [77] };
    await seedRules({ '1190001': MANUAL_ONLY });
    const { probe } = await runWith([manualItem('mt-77', 36401, [77], '2026-10-20T10:00:00Z', { fullName: 'Ana Ruiz' })]);
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [77], false, CREDS_WITH_ENV);
    expect(probe.get().lastRun).toEqual([expect.objectContaining({ id: 'mt-77', personId: '1190001' })]);
  });

  it('reads every UTC date the request spans (UTC midnight crossed), never with a timeZoneId', async () => {
    // 23:50 with no offset is UTC, so 20 minutes run into the 28th, whatever the device zone
    const late = manualItem('mt-1-2', 36401, [1, 2], '2026-10-27T23:50:00', { fullName: 'Ana Ruiz', durationMinutes: 20 });
    diary['80001'] = { '2026-10-27': [1], '2026-10-28': [2] };
    await seedRules({ '1190001': MANUAL_ONLY });
    await runWith([late]);
    expect(diaryReads().sort()).toEqual(['80001|2026-10-27', '80001|2026-10-28']);
    for (const call of mockFetchWorkDiary.mock.calls) {
      expect(call).toEqual([expect.any(String), expect.any(String), CREDENTIALS, false]);
    }
    expect(mockApproveManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [1, 2], false, CREDS_WITH_ENV);
  });

  it('a real manager: a request whose userId is a report\'s userId is not approved without the diary', async () => {
    // The old userId match: now preview-only (mock data), never the real path
    const byUserId = manualItem('mt-95', 1190001, [95], '2026-10-20T10:00:00Z');
    await seedRules({ '1190001': ON });
    await runWith([byUserId]);
    expect(diaryReads()).toEqual(['80001|2026-10-20', '80001|2026-10-19', '80001|2026-10-21']);
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('the re-check before each approval reads no diary', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const readsAtEachCall: number[] = [];
    mockApproveManual.mockImplementation(async () => {
      readsAtEachCall.push(mockFetchWorkDiary.mock.calls.length);
    });
    await runAutoApproveCycle({
      mode: 'real',
      ownerKey: OWNER,
      items: [ANA_MANUAL, BEN_MANUAL],
      reports: [ANA, BEN],
      queryClient: makeClient(),
    });
    expect(mockApproveManual).toHaveBeenCalledTimes(2);
    // Both reads happened before the first approval; the re-checks between added none
    expect(readsAtEachCall).toEqual([2, 2]);
  });

  it('proven answers last the session (a later run reads no diary), and a reset forgets them', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    mockApproveManual.mockRejectedValueOnce(new NetworkError('Network request failed')); // retried later
    const input = { mode: 'real' as const, ownerKey: OWNER, items: [ANA_MANUAL], reports: [ANA, BEN], queryClient: makeClient() };
    await runAutoApproveCycle(input);
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);

    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + AUTO_APPROVE_RETRY_MS + 1);
    try {
      expect((await runAutoApproveCycle(input))?.map((e) => e.outcome)).toEqual(['approved']);
    } finally {
      now.mockRestore();
    }
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);

    // Next launch: the session (and its proofs) is gone, so the diary is read again
    __resetAutoApproveSession();
    await runAutoApproveCycle(input);
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(2);
  });

  it('a request no candidate owns starts no further runs on later fetches (the answers settle it)', async () => {
    const stranger = manualItem('mt-99', 36499, [99], '2026-10-20T10:00:00Z');
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const { client } = await runWith([stranger]);
    expect(diaryReads().sort()).toEqual([
      '80001|2026-10-19',
      '80001|2026-10-20',
      '80001|2026-10-21',
      '80002|2026-10-19',
      '80002|2026-10-20',
      '80002|2026-10-21',
    ]);
    const credentialReads = mockLoadCredentials.mock.calls.length;

    act(() => {
      client.setQueryData(['approvals'], [stranger]);
    });
    await flush();
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(6);
    expect(mockLoadCredentials).toHaveBeenCalledTimes(credentialReads); // no run started
    expect(mockApproveManual).not.toHaveBeenCalled();
  });

  it('overtime needs no proof: approved without any diary read', async () => {
    await seedRules({ '1190002': { manual: false, overtime: true } });
    await runWith([BEN_OVERTIME, BEN_MANUAL]);
    expect(mockApproveOvertime).toHaveBeenCalledWith('mock-token', false, 32, CREDS_WITH_ENV);
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockApproveManual).not.toHaveBeenCalled();
  });
});

// ─── Hand approve / reject during a run ──────────────────────────────────────

describe('a hand approve / reject and the runner', () => {
  // The queue as useApprovalItems fetches it (current week only): Ana's mt-11, the oldest,
  // is planned first; then Ben's mt-21-22.
  function rawManual(userId: number, timecardIds: number[], startDateTime: string) {
    return {
      userId, // legacy ids: the diary proves the owner
      fullName: `Person ${userId}`,
      manualTimes: [{ status: 'PENDING', timecardIds, durationMinutes: 60, description: 'Work', startDateTime, type: 'WEB' }],
    };
  }

  beforeEach(() => {
    const currentMonday = getWeekStartDate();
    mockFetchPendingManual.mockReset();
    mockFetchPendingManual.mockImplementation(async (_t: string, _qa: boolean, week: string) =>
      week === currentMonday
        ? [rawManual(36401, [11], '2026-10-20T10:00:00Z'), rawManual(36402, [21, 22], '2026-10-21T10:00:00Z')]
        : []);
    mockFetchPendingOvertime.mockReset();
    mockFetchPendingOvertime.mockResolvedValue([]);
    mockRejectManual.mockReset();
    mockRejectManual.mockResolvedValue(undefined);
  });

  /** The Requests queue and the runner on one client, with Ana's approve call held. */
  async function mountWithHeldRun() {
    const gate = deferred();
    mockApproveManual.mockReturnValueOnce(gate.promise);
    const client = makeClient();
    const queue = mount(client, useApprovalItems);
    mount(client, useAutoApproveRunner);
    await flush();
    expect(mockApproveManual).toHaveBeenCalledTimes(1); // Ana's, in flight
    const item = (id: string) => queue.get().items.find((i) => i.id === id) as ApprovalItem;
    return { gate, queue, item };
  }

  it('an item rejected by hand while the run works through its plan is skipped, not approved', async () => {
    await seedRules({ '1190001': MANUAL_ONLY, '1190002': MANUAL_ONLY });
    const { gate, queue, item } = await mountWithHeldRun();

    await act(async () => {
      await queue.get().rejectItem(item('mt-21-22'), 'Not this week');
    });
    gate.resolve();
    await flush();

    // Used to approve Ben's time too: the run had planned it before the reject
    expect(mockRejectManual).toHaveBeenCalledWith('mock-token', false, MANAGER.userId, [21, 22], 'Not this week', CREDS_WITH_ENV);
    expect(mockApproveManual).toHaveBeenCalledTimes(1);
    expect((await readAutoApprove(OWNER)).log.map((e) => e.id)).toEqual(['mt-11']);
  });

  it('a hand action on an item the run has claimed is refused, before anything is hidden or sent', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const { gate, queue, item } = await mountWithHeldRun();

    let error: unknown;
    await act(async () => {
      error = await queue.get().rejectItem(item('mt-11'), 'No').catch((e: unknown) => e);
    });
    expect((error as Error).message).toBe('Auto-approve is already approving this request');
    expect(mockRejectManual).not.toHaveBeenCalled();
    expect(queue.get().items.map((i) => i.id)).toContain('mt-11');

    gate.resolve();
    await flush();
    expect((await readAutoApprove(OWNER)).log.map((e) => [e.id, e.outcome])).toEqual([['mt-11', 'approved']]);
  });

  it('an item acted on by hand is never auto-approved afterwards this session, even when the hand call failed', async () => {
    const client = makeClient();
    const queue = mount(client, useApprovalItems);
    const settings = mount(client, useAutoApproveSettings);
    mount(client, useAutoApproveRunner);
    await flush();

    // No rules yet. The manager rejects Ana's time by hand; the call fails, so it is listed again.
    mockRejectManual.mockRejectedValueOnce(new NetworkError('Network request failed'));
    const ana = queue.get().items.find((i) => i.id === 'mt-11') as ApprovalItem;
    await act(async () => {
      await queue.get().rejectItem(ana, 'Not this week').catch(() => {});
    });
    await flush();
    expect(queue.get().items.map((i) => i.id)).toContain('mt-11');

    // Then turns Ana's Manual time on: used to approve the time they had tried to reject
    await act(async () => {
      await settings.get().setRule('1190001', { manual: true });
    });
    await flush();
    expect(mockApproveManual).not.toHaveBeenCalled();
  });
});

// ─── Live-shape overtime, fetched by useApprovalItems ────────────────────────

describe('live-shape overtime requests (QA, 2026-10-27)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const currentMonday = getWeekStartDate();
    mockFetchPendingManual.mockReset();
    mockFetchPendingManual.mockResolvedValue([]);
    mockFetchPendingOvertime.mockReset();
    // Two of Ben's requests (assignment 80002) as the live endpoint sends them; the second
    // has no overtimePeriod
    mockFetchPendingOvertime.mockImplementation(async (_t: string, _qa: boolean, week: string) =>
      week === currentMonday
        ? [liveOvertime({}, { id: 80002 }), liveOvertime({ id: 9902123, overtimePeriod: undefined }, { id: 80002 })]
        : []);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('approves the request and logs its overtimePeriod in minutes; one with no duration is never approved', async () => {
    await seedRules({ '1190002': { manual: false, overtime: true } });
    const client = makeClient();
    const queue = mount(client, useApprovalItems);
    mount(client, useAutoApproveRunner);
    await flush();

    expect(mockApproveOvertime).toHaveBeenCalledTimes(1);
    expect(mockApproveOvertime).toHaveBeenCalledWith('mock-token', false, 9902122, CREDS_WITH_ENV);
    const { log } = await readAutoApprove(OWNER);
    expect(log.map((e) => [e.id, e.durationMinutes, e.outcome])).toEqual([['ot-9902122', 120, 'approved']]);
    // The request with no duration never reached the queue
    expect(queue.get().items.map((i) => i.id)).not.toContain('ot-9902123');
    expect(warnSpy).toHaveBeenCalledWith('[parseOvertimeItems] Skipping entry with missing duration:', 9902123);
  });
});

// ─── useDirectReports ────────────────────────────────────────────────────────

describe('useDirectReports', () => {
  it('a manager: the reports (roster without self, deduped, sorted by name) and every roster row', async () => {
    const anaOnOtherTeam = { ...ANA, assignmentId: '80099', teamId: '5000' };
    mockFetchManagedAssignments.mockResolvedValue([SELF, BEN, ANA, anaOnOtherTeam]);
    const probe = mount(makeClient(), useDirectReports);
    await flush();
    expect(probe.get()).toEqual({ reports: [ANA, BEN], roster: [SELF, BEN, ANA, anaOnOtherTeam], isLoading: false, error: null });
  });

  it('a manager: one managed-assignments call (no teams call); a report past the first 10 rows is listed', async () => {
    // Rows past 10 used to be lost (the assignments endpoint pages at 10 by default).
    const filler = Array.from({ length: 10 }, (_, i) =>
      member({ assignmentId: String(81000 + i), candidateId: String(3100000 + i), userId: String(1191000 + i), name: `Report ${i}` }));
    const late = member({ assignmentId: '80232', candidateId: '3080232', userId: '1180232', name: 'Zed Late' });
    mockFetchManagedAssignments.mockResolvedValue([SELF, ...filler, late]);
    const probe = mount(makeClient(), useDirectReports);
    await flush();
    expect(mockFetchManagedAssignments).toHaveBeenCalledTimes(1);
    expect(mockFetchManagedAssignments).toHaveBeenCalledWith('mock-token', false, CREDS_WITH_ENV);
    expect(mockFetchMyTeams).not.toHaveBeenCalled();
    expect(mockFetchTeamRoster).not.toHaveBeenCalled();
    expect(probe.get().reports).toHaveLength(11);
    expect(probe.get().reports.map((m) => m.assignmentId)).toContain('80232');
    expect(probe.get().reports.map((m) => m.candidateId)).not.toContain(MANAGER.userId);
  });

  it('a manager: surfaces a roster error', async () => {
    mockFetchManagedAssignments.mockRejectedValue(new Error('roster failed'));
    const probe = mount(makeClient(), useDirectReports);
    await flush();
    expect(probe.get().error).toBe('roster failed');
    expect(probe.get().reports).toEqual([]);
  });

  it('dev manager preview: MOCK_TEAM_ROSTER, without fetching', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    const probe = mount(makeClient(), useDirectReports);
    await flush();
    expect(probe.get()).toEqual({ reports: MOCK_TEAM_ROSTER, roster: MOCK_TEAM_ROSTER, isLoading: false, error: null });
    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
  });

  it('a contributor: [] without fetching', async () => {
    mockLoadConfig.mockResolvedValue(CONTRIBUTOR);
    const probe = mount(makeClient(), useDirectReports);
    await flush();
    expect(probe.get()).toEqual({ reports: [], roster: [], isLoading: false, error: null });
    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
  });

  it('never reads a roster an earlier build cached under the unversioned key (10 rows, no userId)', async () => {
    const client = makeClient();
    // Restored from an earlier build's persisted cache: cut off at 10 rows, rows without userId
    const legacy = Array.from({ length: 10 }, (_, i) => {
      const { userId: _drop, ...rest } = member({ assignmentId: String(81000 + i), name: `Old ${i}` });
      return rest;
    });
    client.setQueryData(['teamRoster', MANAGER.primaryTeamId, 'prod'], legacy);
    const probe = mount(client, useDirectReports);
    await flush();
    expect(mockFetchManagedAssignments).toHaveBeenCalledTimes(1);
    expect(probe.get().reports).toEqual([ANA, BEN]);
    expect(client.getQueryData<TeamMember[]>(['teamRoster', 'v2', MANAGER.primaryTeamId, 'prod'])).toEqual([SELF, BEN, ANA]);
  });

  it('a v2 roster cached this session is used without a refetch', async () => {
    const client = makeClient();
    client.setQueryData(['teamRoster', 'v2', MANAGER.primaryTeamId, 'prod'], [SELF, ANA]);
    const probe = mount(client, useDirectReports);
    await flush();
    expect(mockFetchManagedAssignments).not.toHaveBeenCalled();
    expect(probe.get().reports).toEqual([ANA]);
  });
});

// ─── useManualOwners ─────────────────────────────────────────────────────────

describe('useManualOwners', () => {
  const ROSTER = [SELF, BEN, ANA];

  it('a manager: proves each request from the reports\' diaries, the name-matched report\'s first', async () => {
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL, BEN_MANUAL, BEN_OVERTIME], [ANA, BEN], ROSTER));
    await flush();
    const { owners, isLoading, settled } = probe.get();
    expect(owners.get('mt-11')).toEqual(ANA);
    expect(owners.get('mt-21-22')).toEqual(BEN);
    expect(owners.has('ot-32')).toBe(false);
    // Each proven by its name-matched report's diary: no one else's is read
    expect(diaryReads().sort()).toEqual(['80001|2026-10-20', '80002|2026-10-21']);
    expect(isLoading).toBe(false);
    expect(settled).toBe(true);
  });

  it('a name that matches no report is still proven from the reports\' diaries, as the runner proves it', async () => {
    // The pending fullName differs from the roster's printableName
    const renamed = manualItem('mt-11', 36401, [11], '2026-10-20T10:00:00Z', { fullName: 'Ana R.' });
    const stranger = manualItem('mt-99', 36499, [99], '2026-10-20T10:00:00Z', { fullName: 'Nobody Known' });
    const probe = mount(makeClient(), () => useManualOwners([renamed, stranger], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get().owners.get('mt-11')).toEqual(ANA);
    expect(probe.get().owners.get('mt-99')).toBeNull(); // no report's diary holds it
    expect(probe.get().settled).toBe(true);
  });

  it('a failed read leaves the request unknown: not counted, and not settled', async () => {
    mockFetchWorkDiary.mockRejectedValue(new NetworkError('Network request failed'));
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get()).toEqual({ owners: new Map(), isLoading: false, settled: false });
  });

  it('a name match without the diary\'s proof leaves the request unresolved', async () => {
    diary = {};
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get().owners.get('mt-11')).toBeNull();
  });

  it('isLoading while the first proof is in flight', async () => {
    const held = deferred<WorkDiarySlot[]>();
    mockFetchWorkDiary.mockReturnValueOnce(held.promise);
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get()).toEqual({ owners: new Map(), isLoading: true, settled: false });
    held.resolve([slot(11, '2026-10-20')]);
    await flush();
    expect(probe.get().isLoading).toBe(false);
    expect(probe.get().settled).toBe(true);
    expect(probe.get().owners.get('mt-11')).toEqual(ANA);
  });

  it('isLoading, and not settled, while new requests are proved: the last answers stay on screen', async () => {
    let setItems!: (items: ApprovalItem[]) => void;
    const probe = mount(makeClient(), () => {
      const [items, set] = React.useState<ApprovalItem[]>([ANA_MANUAL]);
      setItems = set;
      return useManualOwners(items, [ANA, BEN], ROSTER);
    });
    await flush();
    expect(probe.get()).toEqual({ owners: new Map([['mt-11', ANA]]), isLoading: false, settled: true });

    const held = deferred<WorkDiarySlot[]>();
    mockFetchWorkDiary.mockReturnValueOnce(held.promise);
    act(() => setItems([ANA_MANUAL, BEN_MANUAL]));
    await flush();
    expect(probe.get()).toEqual({ owners: new Map([['mt-11', ANA]]), isLoading: true, settled: false });

    held.resolve([slot(21, '2026-10-21'), slot(22, '2026-10-21')]);
    await flush();
    expect(probe.get()).toEqual({
      owners: new Map([['mt-11', ANA], ['mt-21-22', BEN]]),
      isLoading: false,
      settled: true,
    });
  });

  it('never reads a request fetched for another owner (a fetch that landed after a switch)', async () => {
    const qaItem = { ...ANA_MANUAL, fetchedFor: '2362707|qa' };
    const probe = mount(makeClient(), () => useManualOwners([qaItem, BEN_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(diaryReads()).toEqual(['80002|2026-10-21']);
    expect(probe.get().owners.has('mt-11')).toBe(false);
    expect(probe.get().owners.get('mt-21-22')).toEqual(BEN);
  });

  it('no manual requests: nothing read, not loading', async () => {
    const probe = mount(makeClient(), () => useManualOwners([BEN_OVERTIME], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get()).toEqual({ owners: new Map(), isLoading: false, settled: true });
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
  });

  it('shares the runner\'s proofs: what the runner proved is not read again', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    await runAutoApproveCycle({ mode: 'real', ownerKey: OWNER, items: [ANA_MANUAL], reports: [ANA, BEN], queryClient: makeClient() });
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);

    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get().owners.get('mt-11')).toEqual(ANA);
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);
  });

  it('the runner seeing another owner (an environment switch) drops this owner\'s proofs', async () => {
    mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(1);

    // The runner on QA
    mockLoadConfig.mockResolvedValue(QA_MANAGER);
    mount(makeClient(), useAutoApproveRunner);
    await flush();

    // Back on prod: read again
    mockLoadConfig.mockResolvedValue(MANAGER);
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get().owners.get('mt-11')).toEqual(ANA);
    expect(mockFetchWorkDiary).toHaveBeenCalledTimes(2);
  });

  it('dev manager preview: the mock requests resolve by the mock roster\'s userId, with no network', async () => {
    mockLoadConfig.mockResolvedValue(PREVIEW);
    const probe = mount(makeClient(), () => useManualOwners(MOCK_TEAM_ITEMS, MOCK_TEAM_ROSTER, MOCK_TEAM_ROSTER));
    await flush();
    expect(probe.get().owners.get('mt-mock-1001')?.name).toBe('Alice Chen');
    expect(probe.get().owners.get('mt-mock-1002')?.name).toBe('Bob Torres');
    expect(probe.get().isLoading).toBe(false);
    expect(probe.get().settled).toBe(true);
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
    expect(mockLoadCredentials).not.toHaveBeenCalled();
  });

  it('a contributor: empty, with no network', async () => {
    mockLoadConfig.mockResolvedValue(CONTRIBUTOR);
    const probe = mount(makeClient(), () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    expect(probe.get()).toEqual({ owners: new Map(), isLoading: false, settled: true });
    expect(mockFetchWorkDiary).not.toHaveBeenCalled();
  });

  it('persists as JSON: the query data is entries, not a Map', async () => {
    const client = makeClient();
    mount(client, () => useManualOwners([ANA_MANUAL], [ANA, BEN], ROSTER));
    await flush();
    // Keyed by the owner and the sorted manual ids
    const data = client.getQueryData([...AUTO_APPROVE_KEY, 'owners', OWNER, ['mt-11']]);
    expect(JSON.parse(JSON.stringify(data))).toEqual([['mt-11', ANA]]);
  });
});

describe('MOCK_TEAM_ROSTER', () => {
  it('covers every MOCK_TEAM_ITEMS person and includes people with no pending items', () => {
    const ids = new Set(MOCK_TEAM_ROSTER.map((m) => m.userId));
    for (const item of MOCK_TEAM_ITEMS) expect(ids.has(String(item.userId))).toBe(true);
    const withItems = new Set(MOCK_TEAM_ITEMS.map((i) => String(i.userId)));
    expect(MOCK_TEAM_ROSTER.filter((m) => !withItems.has(m.userId as string)).length).toBeGreaterThan(0);
    expect(MOCK_TEAM_ROSTER.length).toBeGreaterThanOrEqual(4);
    expect(MOCK_TEAM_ROSTER.length).toBeLessThanOrEqual(6);
  });
});

// ─── useAutoApproveSettings ──────────────────────────────────────────────────

describe('useAutoApproveSettings', () => {
  it('reads the owner\'s rules and log', async () => {
    await seedRules({ '1190001': MANUAL_ONLY });
    const probe = mount(makeClient(), useAutoApproveSettings);
    await flush();
    expect(probe.get().ownerKey).toBe(OWNER);
    expect(probe.get().rules).toEqual({ '1190001': MANUAL_ONLY });
    expect(probe.get().log).toEqual([]);
    expect(probe.get().isLoading).toBe(false);
  });

  it('setRule saves the rule and updates the query data at once', async () => {
    const client = makeClient();
    const probe = mount(client, useAutoApproveSettings);
    await flush();
    await act(async () => {
      await probe.get().setRule('1190002', { overtime: true });
    });
    await flush(1); // TanStack notifies observers on the next tick
    expect(probe.get().rules).toEqual({ '1190002': { manual: false, overtime: true } });
    expect((await readAutoApprove(OWNER)).rules).toEqual({ '1190002': { manual: false, overtime: true } });
  });

  it('setRule rejects, leaving the toggles as they were, when the rule was not saved', async () => {
    const probe = mount(makeClient(), useAutoApproveSettings);
    await flush();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('full'));
    let error: unknown;
    await act(async () => {
      error = await probe.get().setRule('1190002', { overtime: true }).catch((e: unknown) => e);
    });
    expect(error).toBeInstanceOf(Error);
    await flush(1);
    expect(probe.get().rules).toEqual({});
  });

  it('is empty and not loading without a config', async () => {
    mockLoadConfig.mockResolvedValue(null);
    const probe = mount(makeClient(), useAutoApproveSettings);
    await flush();
    expect(probe.get()).toMatchObject({ ownerKey: null, rules: {}, log: [], isLoading: false });
  });
});
