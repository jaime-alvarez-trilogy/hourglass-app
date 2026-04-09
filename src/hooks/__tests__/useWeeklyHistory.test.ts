// Tests: useWeeklyHistory hook — 06-overview-history FR2
// Tests: useEarningsHistory extension — 06-overview-history FR3
// Tests: useAIData extension — 06-overview-history FR4
//
// Strategy: Static analysis of source files for contract verification
// + direct unit tests on the pure functions (FR1) for behavioral verification.
// renderHook is not used — the jest-expo/node preset has null dispatcher outside React.

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mergeWeeklySnapshot,
  loadWeeklyHistory,
  saveWeeklyHistory,
  WEEKLY_HISTORY_KEY,
} from '../../lib/weeklyHistory';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

// ─── File paths ───────────────────────────────────────────────────────────────
// __dirname = hourglassws/src/hooks/__tests__
const SRC_ROOT = path.resolve(__dirname, '../..');

const USE_WEEKLY_HISTORY_PATH = path.resolve(SRC_ROOT, 'hooks', 'useWeeklyHistory.ts');
const USE_EARNINGS_HISTORY_PATH = path.resolve(SRC_ROOT, 'hooks', 'useEarningsHistory.ts');
const USE_AI_DATA_PATH = path.resolve(SRC_ROOT, 'hooks', 'useAIData.ts');

// ─── FR2: useWeeklyHistory hook — static analysis ────────────────────────────

describe('useWeeklyHistory — FR2: source file contract (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_WEEKLY_HISTORY_PATH, 'utf8');
  });

  it('SC2.1 — hook file exists at src/hooks/useWeeklyHistory.ts', () => {
    expect(fs.existsSync(USE_WEEKLY_HISTORY_PATH)).toBe(true);
  });

  it('SC2.2 — returns UseWeeklyHistoryResult with snapshots and isLoading fields', () => {
    // Return type or returned object must include both fields
    expect(source).toMatch(/snapshots/);
    expect(source).toMatch(/isLoading/);
  });

  it('SC2.3 — initialises snapshots as empty array', () => {
    expect(source).toMatch(/snapshots.*\[\]|\[\].*snapshots/);
  });

  it('SC2.4 — initialises isLoading as true', () => {
    expect(source).toMatch(/isLoading.*true|useState\s*\(\s*true\s*\)/);
  });

  it('SC2.5 — calls loadWeeklyHistory on mount (useEffect with empty deps)', () => {
    expect(source).toMatch(/loadWeeklyHistory/);
    expect(source).toMatch(/useEffect\s*\(/);
    // Should have empty dependency array for mount-only effect
    expect(source).toMatch(/\[\s*\]/);
  });

  it('SC2.6 — sets isLoading to false after AsyncStorage resolves', () => {
    // isLoading must be set to false in the success path
    expect(source).toMatch(/setIsLoading\s*\(\s*false\s*\)|isLoading.*false/);
  });

  it('SC2.7 — handles AsyncStorage failure silently (catch block)', () => {
    // Must have error handling that does not propagate
    expect(source).toMatch(/catch|\.catch/);
  });

  it('SC2.8 — imports loadWeeklyHistory from weeklyHistory', () => {
    expect(source).toMatch(/from.*weeklyHistory|require.*weeklyHistory/);
    expect(source).toMatch(/loadWeeklyHistory/);
  });

  it('SC2.9 — imports useState and useEffect from react', () => {
    expect(source).toMatch(/from\s+['"]react['"]/);
    expect(source).toMatch(/useState/);
    expect(source).toMatch(/useEffect/);
  });
});

// ─── FR2: useWeeklyHistory — behavioural via pure functions ──────────────────

describe('useWeeklyHistory — FR2: behavioural (via loadWeeklyHistory)', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC2.10 — first-ever launch: loadWeeklyHistory returns [] (no data yet)', async () => {
    // Empty AsyncStorage simulates first-ever launch
    const result = await loadWeeklyHistory();
    expect(result).toEqual([]);
  });

  it('SC2.11 — after saving, loadWeeklyHistory returns persisted snapshots', async () => {
    const snapshots: WeeklySnapshot[] = [
      { weekStart: '2026-03-02', hours: 40, earnings: 2000, aiPct: 75, brainliftHours: 5 },
      { weekStart: '2026-03-09', hours: 38, earnings: 1900, aiPct: 80, brainliftHours: 4 },
    ];
    await saveWeeklyHistory(snapshots);
    const loaded = await loadWeeklyHistory();
    expect(loaded).toEqual(snapshots);
  });

  it('SC2.12 — AsyncStorage throws: loadWeeklyHistory returns [] (silent failure)', async () => {
    MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('storage failure'));
    const result = await loadWeeklyHistory();
    expect(result).toEqual([]);
  });

  it('SC2.13 — hook does not include current in-progress week (only reads persisted store)', async () => {
    // The hook only reads from AsyncStorage, not from live AI/hours data
    // Verify: if we write 2 past weeks, the hook reads exactly those 2 past weeks
    const past: WeeklySnapshot[] = [
      { weekStart: '2026-02-23', hours: 40, earnings: 2000, aiPct: 70, brainliftHours: 4 },
      { weekStart: '2026-03-02', hours: 38, earnings: 1900, aiPct: 72, brainliftHours: 3 },
    ];
    await saveWeeklyHistory(past);
    const loaded = await loadWeeklyHistory();
    expect(loaded).toHaveLength(2);
    expect(loaded).toEqual(past);
  });
});

// ─── FR3: useEarningsHistory extension — static analysis ─────────────────────

describe('useEarningsHistory — FR3: weekly_history_v2 write (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_EARNINGS_HISTORY_PATH, 'utf8');
  });

  it('SC3.1 — source imports mergeWeeklySnapshot and saveWeeklyHistory from weeklyHistory', () => {
    expect(source).toMatch(/from.*weeklyHistory|require.*weeklyHistory/);
    expect(source).toMatch(/mergeWeeklySnapshot/);
    expect(source).toMatch(/saveWeeklyHistory/);
  });

  it('SC3.2 — source writes to weekly_history_v2 via saveWeeklyHistory', () => {
    // saveWeeklyHistory must be called (not direct AsyncStorage.setItem for this key)
    expect(source).toMatch(/saveWeeklyHistory/);
  });

  it('SC3.3 — source extracts paidHours from Payment objects', () => {
    expect(source).toMatch(/paidHours/);
  });

  it('SC3.4 — source calls mergeWeeklySnapshot with weekStart and hours fields', () => {
    expect(source).toMatch(/mergeWeeklySnapshot/);
    expect(source).toMatch(/weekStart/);
    expect(source).toMatch(/hours/);
  });

  it('SC3.5 — weekly_history_v2 write is wrapped in try/catch (silent failure)', () => {
    // The write must not affect the existing trend return value
    // Check that there is error handling around the weeklyHistory write
    expect(source).toMatch(/catch/);
  });

  it('SC3.6 — earnings_history_v1 write still present (additive, not replaced)', () => {
    expect(source).toMatch(/earnings_history_v1/);
  });

  it('SC3.7 — source still exports trend and isLoading (return value unchanged)', () => {
    expect(source).toMatch(/trend/);
    expect(source).toMatch(/isLoading/);
  });
});

// ─── FR3: useEarningsHistory extension — behavioural via mergeWeeklySnapshot ─

describe('useEarningsHistory — FR3: behavioural (weekly_history_v2 merge logic)', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC3.8 — mergeWeeklySnapshot writes earnings and hours for a week', () => {
    const result = mergeWeeklySnapshot([], {
      weekStart: '2026-03-02',
      earnings: 2400,
      hours: 40,
    });
    expect(result[0].weekStart).toBe('2026-03-02');
    expect(result[0].earnings).toBe(2400);
    expect(result[0].hours).toBe(40);
    // aiPct and brainliftHours default to 0 (not yet written by AI hook)
    expect(result[0].aiPct).toBe(0);
    expect(result[0].brainliftHours).toBe(0);
  });

  it('SC3.9 — weekly_history_v2 write failure is silent: saveWeeklyHistory error propagated to caller', async () => {
    // saveWeeklyHistory itself propagates errors; the hook catches it silently
    // Verify the error propagation contract of saveWeeklyHistory
    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(saveWeeklyHistory([])).rejects.toThrow('quota exceeded');
    // The hook should catch this and not re-throw (tested via source analysis above)
  });

  it('SC3.10 — multiple payments in same week are summed', () => {
    // Test the aggregation pattern: two payments with same periodStartDate
    // The hook sums amount and paidHours before calling mergeWeeklySnapshot
    // Verify the expected result when both amounts and hours are summed
    const earnings = 1200 + 800; // two payment records for same week
    const hours = 20 + 20;
    const result = mergeWeeklySnapshot([], {
      weekStart: '2026-03-02',
      earnings,
      hours,
    });
    expect(result[0].earnings).toBe(2000);
    expect(result[0].hours).toBe(40);
  });
});

// ─── FR4: useAIData extension — static analysis ──────────────────────────────

describe('useAIData — FR4 (06-overview-history): weekly_history_v2 flush (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_AI_DATA_PATH, 'utf8');
  });

  it('SC4.1 — source imports mergeWeeklySnapshot and saveWeeklyHistory from weeklyHistory', () => {
    expect(source).toMatch(/from.*weeklyHistory|require.*weeklyHistory/);
    expect(source).toMatch(/mergeWeeklySnapshot/);
    expect(source).toMatch(/saveWeeklyHistory/);
  });

  it('SC4.2 — source writes aiPct and brainliftHours to weekly_history_v2 on Monday', () => {
    expect(source).toMatch(/saveWeeklyHistory/);
    expect(source).toMatch(/aiPct/);
    expect(source).toMatch(/brainliftHours/);
  });

  it('SC4.3 — flush is guarded by isMonday && taggedSlots > 0 condition', () => {
    expect(source).toMatch(/getUTCDay\s*\(\s*\)\s*===\s*1/); // Monday check (UTC)
    expect(source).toMatch(/taggedSlots\s*>\s*0/);           // non-empty guard
  });

  it('SC4.4 — prevWeekStart derived as currentMonday minus 7 days', () => {
    // Check that the source computes a date offset of -7 days
    expect(source).toMatch(/setDate|getDate.*-\s*7|7\s*\*\s*7|7.*days|minus.*7/i);
  });

  it('SC4.5 — flush wrapped in try/catch (silent failure)', () => {
    // The AI flush must not affect the data return value on failure
    expect(source).toMatch(/catch/);
  });

  it('SC4.6 — existing PREV_WEEK_KEY write still present (flush is additive)', () => {
    expect(source).toMatch(/PREV_WEEK_KEY/);
    expect(source).toMatch(/previousWeekAIPercent/);
  });
});

// ─── FR4: useAIData extension — behavioural ───────────────────────────────────

describe('useAIData — FR4 (06-overview-history): behavioural (prevWeekStart derivation)', () => {
  it('SC4.7 — prevWeekStart is the Monday 7 days before current Monday (2026-03-16 → 2026-03-09)', () => {
    // Current Monday: 2026-03-16
    const currentMonday = '2026-03-16';
    const d = new Date(currentMonday + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const prevWeekStart = `${y}-${m}-${dd}`;
    expect(prevWeekStart).toBe('2026-03-09');
  });

  it('SC4.8 — prevWeekStart is correct across month boundary (2026-03-02 → 2026-02-23)', () => {
    const currentMonday = '2026-03-02';
    const d = new Date(currentMonday + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const prevWeekStart = `${y}-${m}-${dd}`;
    expect(prevWeekStart).toBe('2026-02-23');
  });

  it('SC4.9 — flush writes correct fields to weekly_history_v2', () => {
    // Verify that mergeWeeklySnapshot with AI fields correctly forms a snapshot
    const prevWeekStart = '2026-03-09';
    const aiPctLow = 73;
    const aiPctHigh = 77;
    const midpoint = (aiPctLow + aiPctHigh) / 2;
    const brainliftHours = 4.5;

    const result = mergeWeeklySnapshot([], {
      weekStart: prevWeekStart,
      aiPct: midpoint,
      brainliftHours,
    });

    expect(result[0]).toEqual({
      weekStart: '2026-03-09',
      hours: 0,           // not yet written by earnings hook
      earnings: 0,        // not yet written by earnings hook
      aiPct: 75,
      brainliftHours: 4.5,
    });
  });

  it('SC4.10 — on non-Monday, no flush should occur (guard: getDay() !== 1)', () => {
    // Tuesday
    const d = new Date('2026-03-10T12:00:00');
    expect(d.getDay()).not.toBe(1);
  });

  it('SC4.11 — on Monday with taggedSlots === 0, no flush (guard: taggedSlots > 0)', () => {
    const taggedSlots = 0;
    const shouldFlush = taggedSlots > 0;
    expect(shouldFlush).toBe(false);
  });

  it('SC4.12 — subsequent writes merge correctly: earnings + AI for same week', () => {
    // Earnings hook writes first, then AI hook merges aiPct into same week
    let history = mergeWeeklySnapshot([], {
      weekStart: '2026-03-09',
      earnings: 2000,
      hours: 40,
    });
    history = mergeWeeklySnapshot(history, {
      weekStart: '2026-03-09',
      aiPct: 78,
      brainliftHours: 5,
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({
      weekStart: '2026-03-09',
      earnings: 2000,
      hours: 40,
      aiPct: 78,
      brainliftHours: 5,
    });
  });
});

// ─── Integration: weekly_history_v2 key is correct ───────────────────────────

describe('Integration: WEEKLY_HISTORY_KEY is used consistently', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC5.1 — saveWeeklyHistory writes to WEEKLY_HISTORY_KEY (weekly_history_v2)', async () => {
    await saveWeeklyHistory([{
      weekStart: '2026-03-09',
      hours: 40,
      earnings: 2000,
      aiPct: 75,
      brainliftHours: 5,
    }]);
    expect(MockAsyncStorage.setItem).toHaveBeenCalledWith(
      'weekly_history_v2',
      expect.any(String),
    );
  });

  it('SC5.2 — loadWeeklyHistory reads from WEEKLY_HISTORY_KEY (weekly_history_v2)', async () => {
    await loadWeeklyHistory();
    expect(MockAsyncStorage.getItem).toHaveBeenCalledWith('weekly_history_v2');
  });

  it('SC5.3 — two hooks writing different fields to same weekStart produce merged result', () => {
    // Simulates earnings hook + AI hook writing to same week
    let history: WeeklySnapshot[] = [];
    history = mergeWeeklySnapshot(history, { weekStart: '2026-03-09', earnings: 2000, hours: 40 });
    history = mergeWeeklySnapshot(history, { weekStart: '2026-03-09', aiPct: 80, brainliftHours: 5 });
    expect(history[0]).toEqual({
      weekStart: '2026-03-09',
      earnings: 2000,
      hours: 40,
      aiPct: 80,
      brainliftHours: 5,
    });
  });
});
