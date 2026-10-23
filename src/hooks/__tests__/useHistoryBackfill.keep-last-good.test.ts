/**
 * durable-data 03-keep-last-good FR4 (DD3.28, DD3.29, DD3.31): weekly history writers never
 * save over a weekly_history_v2 they could not read.
 *
 * `runBackfill` (exported for testing) is driven directly with the real weeklyHistory module
 * over the in-memory AsyncStorage __mocks__; only the network edge (`getAuthToken` /
 * `apiGet`) is mocked. The hook cases render useHistoryBackfill with react-test-renderer,
 * with `useConfig` and `loadCredentials` mocked. Timers are faked (the hook defers the run by
 * 2 s and the runner pauses 300 ms between weeks), and the clock is a Wednesday so the 23
 * backfill Mondays are fixed. DD3.31 reads the three writer sources.
 *
 * runBackfill's outcomes: `null` when the store is unreadable (nothing fetched, nothing
 * written), the stored history unchanged (nothing to fill, or the token failed), or the
 * updated history.
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { act, create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stripComments } from '../../../__tests__/helpers/stripComments';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../api/client', () => ({
  getAuthToken: jest.fn(),
  apiGet: jest.fn(),
}));

jest.mock('../../store/config', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../useConfig', () => ({
  useConfig: jest.fn(),
}));

import { getAuthToken, apiGet } from '../../api/client';
import { loadCredentials } from '../../store/config';
import { useConfig } from '../useConfig';
import { runBackfill, useHistoryBackfill } from '../useHistoryBackfill';
import { WEEKLY_HISTORY_KEY } from '../../lib/weeklyHistory';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';
import type { WorkDiarySlot } from '../../types/api';
import type { CrossoverConfig, Credentials } from '../../types/config';

const mockGetAuthToken = getAuthToken as jest.Mock;
const mockApiGet = apiGet as jest.Mock;
const mockLoadCredentials = loadCredentials as jest.Mock;
const mockUseConfig = useConfig as jest.Mock;
const storage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  _reset: () => void;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Wednesday 2026-10-21, midday UTC: the current UTC Monday is 2026-10-19, so the backfill
// covers the 23 Mondays from 2026-10-12 back to 2026-05-11 in every host time zone.
const NOW = new Date('2026-10-21T12:00:00.000Z');
const LAST_MONDAY = '2026-10-12';
const BACKFILL_WEEKS = 23;
const WEEK_PAUSE_MS = 300;
const HOOK_DELAY_MS = 2000;

const ASSIGNMENT_ID = '79996';
const CREDS: Credentials = { username: 'worker@example.com', password: 's3cret' };
const TOKEN = 'token-abc';

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  assignmentId: ASSIGNMENT_ID,
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: false,
  teams: [],
  lastRoleCheck: '2026-10-19T00:00:00.000Z',
  setupComplete: true,
  setupDate: '2026-01-01T00:00:00.000Z',
  debugMode: false,
};

/** The 23 past Mondays runBackfill visits, newest first (n = 1..23 weeks ago). */
const PAST_MONDAYS: string[] = Array.from({ length: BACKFILL_WEEKS }, (_, i) =>
  new Date(Date.UTC(2026, 9, 19 - 7 * (i + 1))).toISOString().slice(0, 10),
);

/** A week the backfill considers complete (AI% known, every hourly field present). */
function completeWeek(weekStart: string): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 2000,
    aiPct: 74,
    brainliftHours: 5,
    overtime: 0,
    dailyHours: [8, 8, 8, 8, 8, 0, 0],
    hourlySlots: new Array(24).fill(10),
    hourlyIntensity: new Array(24).fill(700),
    hourlyAISlots: new Array(24).fill(7),
    hourlyProductiveSlots: new Array(24).fill(8),
  };
}

/** Earnings/hours already written by useEarningsHistory; AI% not yet backfilled. */
const PARTIAL_HISTORY: WeeklySnapshot[] = [
  { weekStart: '2026-10-05', hours: 40, earnings: 2000, aiPct: 0, brainliftHours: 0, overtime: 0 },
  { weekStart: LAST_MONDAY, hours: 38, earnings: 1900, aiPct: 0, brainliftHours: 0, overtime: 0 },
];

/** Every past week complete: nothing to fill. Stored oldest first, as mergeWeeklySnapshot sorts. */
const COMPLETE_HISTORY: WeeklySnapshot[] = [...PAST_MONDAYS].reverse().map(completeWeek);

function slot(date: string, tags: string[]): WorkDiarySlot {
  return {
    tags,
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
    date: `${date}T15:00:00Z`,
    time: '15:00:00',
    activityLevel: 80,
    intensityScore: 70,
    productivityCategory: 'PRODUCTIVE',
    activities: ['AI'],
    secondBrainDeepDive: null,
  };
}

/** Four slots a day: AI, second brain, other tagged, untagged → a week of 28 slots, 21
 *  tagged, 14 AI (aiPct 67), 7 second brain (7/6 h BrainLift). */
function diaryDay(date: string): WorkDiarySlot[] {
  return [slot(date, ['ai_usage']), slot(date, ['second_brain']), slot(date, ['meeting']), slot(date, [])];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const historyWrites = () => storage.setItem.mock.calls.filter(([k]) => k === WEEKLY_HISTORY_KEY);

/** Seeds weekly_history_v2 and returns the raw stored string. */
async function seedHistory(history: WeeklySnapshot[]): Promise<string> {
  const raw = JSON.stringify(history);
  await AsyncStorage.setItem(WEEKLY_HISTORY_KEY, raw);
  storage.setItem.mockClear();
  return raw;
}

/** Makes weekly_history_v2 unreadable (getItem rejects); every other key reads normally.
 *  Returns a function that makes it readable again. */
function breakHistoryReads(): () => void {
  const readStore = storage.getItem.getMockImplementation()!;
  storage.getItem.mockImplementation((key: string) =>
    key === WEEKLY_HISTORY_KEY ? Promise.reject(new Error('SQLITE_IOERR')) : readStore(key),
  );
  return () => storage.getItem.mockImplementation(readStore);
}

const run = () => runBackfill(ASSIGNMENT_ID, CONFIG.useQA, CREDS.username, CREDS.password);

// Unmounted in afterEach so no tree leaks state updates into the next test.
const cleanups: (() => void)[] = [];

function renderBackfillHook() {
  let current: WeeklySnapshot[] | null = null;
  const Probe = () => {
    current = useHistoryBackfill();
    return null;
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Probe));
  });
  cleanups.push(() => act(() => renderer.unmount()));
  return { get: () => current };
}

/** Past the hook's 2 s defer and every inter-week pause a full backfill would take. */
async function runHookToCompletion() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(HOOK_DELAY_MS + BACKFILL_WEEKS * WEEK_PAUSE_MS + 1000);
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  storage._reset();
  mockUseConfig.mockReturnValue({ config: CONFIG, isLoading: false, refetch: jest.fn() });
  mockLoadCredentials.mockResolvedValue(CREDS);
  mockGetAuthToken.mockResolvedValue(TOKEN);
  mockApiGet.mockImplementation((_path: string, params: { date: string }) =>
    Promise.resolve(diaryDay(params.date)),
  );
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  jest.useRealTimers();
});

// ─── DD3.28: an unreadable store ──────────────────────────────────────────────

describe('durable-data 03 FR4: runBackfill never saves over an unreadable weekly_history_v2', () => {
  it('DD3.28 — getItem rejects → resolves null; no token, no work-diary fetch, no write', async () => {
    const raw = await seedHistory(PARTIAL_HISTORY);
    const restoreReads = breakHistoryReads();

    await expect(run()).resolves.toBeNull();

    expect(storage.getItem).toHaveBeenCalledWith(WEEKLY_HISTORY_KEY);
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    restoreReads();
    expect(await AsyncStorage.getItem(WEEKLY_HISTORY_KEY)).toBe(raw);
  });

  it('DD3.28 (hook) — an unreadable store leaves snapshots null and fetches nothing, even after a full run', async () => {
    await seedHistory(PARTIAL_HISTORY);
    breakHistoryReads();

    const { get } = renderBackfillHook();
    await runHookToCompletion();

    expect(mockLoadCredentials).toHaveBeenCalledTimes(1); // the deferred run did start
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(historyWrites()).toEqual([]);
    expect(get()).toBeNull();
  });
});

// ─── The other outcomes (preserved behaviour) ─────────────────────────────────

describe('durable-data 03 FR4: runBackfill keeps its other outcomes', () => {
  it('nothing to fill → resolves the stored history unchanged, with no token, fetch or write', async () => {
    await seedHistory(COMPLETE_HISTORY);

    await expect(run()).resolves.toEqual(COMPLETE_HISTORY);

    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(historyWrites()).toEqual([]);
  });

  it('the token fails → resolves the stored history unchanged, with no fetch or write', async () => {
    await seedHistory(PARTIAL_HISTORY);
    mockGetAuthToken.mockRejectedValue(new Error('auth down'));

    await expect(run()).resolves.toEqual(PARTIAL_HISTORY);

    expect(mockGetAuthToken).toHaveBeenCalledWith(CREDS.username, CREDS.password, CONFIG.useQA);
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(historyWrites()).toEqual([]);
  });

  it('(hook) a readable store → snapshots is the history runBackfill returns', async () => {
    await seedHistory(COMPLETE_HISTORY);

    const { get } = renderBackfillHook();
    await runHookToCompletion();

    expect(get()).toEqual(COMPLETE_HISTORY);
  });
});

// ─── DD3.29: the happy path still writes ──────────────────────────────────────

describe('durable-data 03 FR4: runBackfill still writes when the store is readable', () => {
  it('DD3.29 — empty history: the first week is fetched and saved before the first 300 ms pause', async () => {
    const pending = run();
    // Settle the first week's reads, 7 parallel fetches and save; stop short of the pause.
    await jest.advanceTimersByTimeAsync(0);

    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledTimes(7);
    expect(mockApiGet.mock.calls.map(([, params]) => params.date)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    expect(historyWrites()).toHaveLength(1);

    const firstWrite: WeeklySnapshot[] = JSON.parse(historyWrites()[0][1]);
    expect(firstWrite).toHaveLength(1);
    expect(firstWrite[0]).toMatchObject({ weekStart: LAST_MONDAY, hours: 0, earnings: 0, aiPct: 67 });
    expect(firstWrite[0].brainliftHours).toBeCloseTo(7 / 6, 10);
    expect(firstWrite[0].dailyHours).toEqual(new Array(7).fill((4 * 10) / 60));
    expect(firstWrite[0].hourlySlots?.reduce((a, b) => a + b, 0)).toBe(28);

    // Let the remaining weeks run so nothing leaks into the next test.
    await jest.advanceTimersByTimeAsync(BACKFILL_WEEKS * WEEK_PAUSE_MS);
    const final = await pending;
    expect(final).toHaveLength(BACKFILL_WEEKS);
    expect(historyWrites()).toHaveLength(BACKFILL_WEEKS);
    expect(JSON.parse(historyWrites()[BACKFILL_WEEKS - 1][1])).toEqual(final);
  });
});

// ─── DD3.31: every writer reads strictly and short-circuits on null (static) ──

describe('durable-data 03 FR4: DD3.31 — the writers use readWeeklyHistoryForWrite (static)', () => {
  const HOOKS_DIR = path.resolve(__dirname, '..');

  /** Source with comments removed, so prose about the calls cannot satisfy or trip a check. */
  const code = (file: string) => stripComments(fs.readFileSync(path.join(HOOKS_DIR, file), 'utf8'));

  /** The name the strict read's result is bound to: `const x = await read…()` or `.then(x =>`. */
  function boundName(src: string, readAt: number): string | null {
    const awaited = /(?:const|let)\s+(\w+)\s*=\s*await\s*$/.exec(src.slice(Math.max(0, readAt - 80), readAt));
    if (awaited) return awaited[1];
    const then = /^readWeeklyHistoryForWrite\(\)\s*\.then\(\s*(?:async\s*)?\(?\s*(\w+)/.exec(src.slice(readAt));
    return then ? then[1] : null;
  }

  /** `if (!x) return` / `if (x === null) return` (braces optional). */
  const nullGuard = (name: string) =>
    new RegExp(String.raw`if\s*\(\s*(?:!\s*${name}|${name}\s*===?\s*null)\s*\)\s*\{?\s*return\b`);

  /**
   * One entry per `saveWeeklyHistory(` call: whether a `readWeeklyHistoryForWrite()` comes
   * after the previous write and before this one (its own read), and whether a null
   * short-circuit on that read's result sits between the read and the write.
   */
  function writeChains(src: string): { ownStrictRead: boolean; nullShortCircuit: boolean }[] {
    const sites = [...src.matchAll(/\bsaveWeeklyHistory\s*\(/g)].map(m => m.index!);
    return sites.map((site, i) => {
      const readAt = src.lastIndexOf('readWeeklyHistoryForWrite()', site);
      const ownStrictRead = readAt >= 0 && readAt > (i > 0 ? sites[i - 1] : -1);
      const name = ownStrictRead ? boundName(src, readAt) : null;
      return {
        ownStrictRead,
        nullShortCircuit: name !== null && nullGuard(name).test(src.slice(readAt, site)),
      };
    });
  }

  const GUARDED = { ownStrictRead: true, nullShortCircuit: true };

  it('DD3.31 — useAIData.ts: both flushes (week transition, Monday) read strictly and skip the save on null', () => {
    expect(writeChains(code('useAIData.ts'))).toEqual([GUARDED, GUARDED]);
  });

  it('DD3.31 — useEarningsHistory.ts: the weekly-history write reads strictly and skips the save on null', () => {
    expect(writeChains(code('useEarningsHistory.ts'))).toEqual([GUARDED]);
  });

  it.each(['useAIData.ts', 'useEarningsHistory.ts'])(
    'DD3.31 — %s does not use loadWeeklyHistory',
    (file) => {
      expect(code(file)).not.toMatch(/\bloadWeeklyHistory\b/);
    },
  );

  it('DD3.31 — useHistoryBackfill.ts: runBackfill reads strictly and guards its write; the hook refresh keeps loadWeeklyHistory', () => {
    const src = code('useHistoryBackfill.ts');
    const runnerAt = src.search(/function runBackfill\s*\(/);
    const hookAt = src.search(/export function useHistoryBackfill\s*\(/);
    expect(runnerAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(runnerAt);

    const runner = src.slice(runnerAt, hookAt);
    expect(runner).toContain('readWeeklyHistoryForWrite()');
    expect(runner).not.toMatch(/\bloadWeeklyHistory\b/);
    expect(writeChains(runner)).toEqual([GUARDED]);

    // Readers keep the never-throws loader (the hook's refreshFromStorage)
    expect(src.slice(hookAt)).toMatch(/\bloadWeeklyHistory\(\)/);
  });
});
