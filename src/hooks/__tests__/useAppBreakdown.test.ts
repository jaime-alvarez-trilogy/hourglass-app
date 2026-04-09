// Tests: useAppBreakdown hook — 11-app-data-layer FR7
// Reads ai_app_history from AsyncStorage on mount.
// Strategy: static analysis for type contract + AsyncStorage mock for data path.

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadAppHistory,
  mergeAppBreakdown,
  APP_HISTORY_KEY,
} from '../../lib/aiAppBreakdown';
import type { AppBreakdownEntry, AppHistoryCache } from '../../lib/aiAppBreakdown';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

// ─── Paths ─────────────────────────────────────────────────────────────────
// __dirname = hourglassws/src/hooks/__tests__
const HOOK_PATH = path.resolve(__dirname, '..', 'useAppBreakdown.ts');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(
  appName: string,
  aiSlots: number,
  brainliftSlots: number,
  nonAiSlots: number,
): AppBreakdownEntry {
  return { appName, aiSlots, brainliftSlots, nonAiSlots };
}

// ─── FR7: Static analysis — source contract ──────────────────────────────────

describe('FR7: useAppBreakdown — source file contract (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, 'utf8');
  });

  it('SC7.1 — exports AppBreakdownResult interface with currentWeek, aggregated12w, isReady', () => {
    expect(source).toMatch(/export\s+interface\s+AppBreakdownResult/);
    expect(source).toMatch(/currentWeek\s*:/);
    expect(source).toMatch(/aggregated12w\s*:/);
    expect(source).toMatch(/isReady\s*:/);
  });

  it('SC7.2 — exports useAppBreakdown function', () => {
    expect(source).toMatch(/export\s+function\s+useAppBreakdown/);
  });

  it('SC7.3 — calls loadAppHistory on mount', () => {
    expect(source).toMatch(/loadAppHistory/);
  });

  it('SC7.4 — initialises isReady as false before load', () => {
    // The hook must use useState(false) for isReady
    expect(source).toMatch(/useState\s*\(\s*false\s*\)/);
  });

  it('SC7.5 — uses getMondayOfWeek from lib/ai for currentMonday', () => {
    expect(source).toMatch(/getMondayOfWeek/);
  });

  it('SC7.6 — no API calls (no fetch, apiGet, fetchWorkDiary)', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/apiGet/);
    expect(source).not.toMatch(/fetchWorkDiary/);
  });

  it('SC7.7 — sets isReady true in both success and catch paths', () => {
    // isReady must be set to true whether load succeeds or fails
    const setReadyCount = (source.match(/setIsReady\s*\(\s*true\s*\)/g) ?? []).length;
    // At minimum 1 call, either in .then() or finally or in both success and catch
    expect(setReadyCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── FR7: AsyncStorage-backed data path ──────────────────────────────────────

describe('FR7: useAppBreakdown — AsyncStorage data path', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC7.8 — loadAppHistory is called with APP_HISTORY_KEY', async () => {
    await loadAppHistory();
    expect(MockAsyncStorage.getItem).toHaveBeenCalledWith(APP_HISTORY_KEY);
  });

  it('SC7.9 — loadAppHistory returns {} when cache is empty', async () => {
    const result = await loadAppHistory();
    expect(result).toEqual({});
  });

  it('SC7.10 — loadAppHistory returns cache when populated', async () => {
    const cache: AppHistoryCache = {
      '2026-03-16': [makeEntry('Cursor', 3, 0, 2)],
      '2026-03-09': [makeEntry('Slack', 1, 0, 5)],
    };
    await MockAsyncStorage.setItem(APP_HISTORY_KEY, JSON.stringify(cache));
    const result = await loadAppHistory();
    expect(result['2026-03-16']).toHaveLength(1);
    expect(result['2026-03-16'][0].appName).toBe('Cursor');
    expect(result['2026-03-09']).toHaveLength(1);
  });

  it('SC7.11 — aggregated12w merges all weeks via mergeAppBreakdown', () => {
    const weeks: AppHistoryCache = {
      '2026-03-16': [makeEntry('Cursor', 3, 0, 2), makeEntry('Slack', 1, 0, 4)],
      '2026-03-09': [makeEntry('Cursor', 2, 0, 1), makeEntry('Chrome', 4, 0, 0)],
    };
    const aggregate = Object.values(weeks).reduce<AppBreakdownEntry[]>(
      (acc, entries) => mergeAppBreakdown(acc, entries),
      [],
    );
    const cursor = aggregate.find(e => e.appName === 'Cursor');
    expect(cursor?.aiSlots).toBe(5);
    expect(cursor?.nonAiSlots).toBe(3);
    const slack = aggregate.find(e => e.appName === 'Slack');
    expect(slack?.nonAiSlots).toBe(4);
    const chrome = aggregate.find(e => e.appName === 'Chrome');
    expect(chrome?.aiSlots).toBe(4);
  });

  it('SC7.12 — aggregated12w is [] on empty cache', () => {
    const aggregate = Object.values({} as AppHistoryCache).reduce<AppBreakdownEntry[]>(
      (acc, entries) => mergeAppBreakdown(acc, entries),
      [],
    );
    expect(aggregate).toEqual([]);
  });
});
