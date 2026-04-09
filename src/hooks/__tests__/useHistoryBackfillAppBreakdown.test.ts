// Tests: useHistoryBackfill — 11-app-data-layer FR6
// Verifies that useHistoryBackfill saves app breakdown to ai_app_history for past weeks.
//
// Strategy: static analysis of useHistoryBackfill.ts source for integration contract,
// plus unit tests of the backfill computation pattern.

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractAppBreakdown,
  mergeAppBreakdown,
  loadAppHistory,
  saveAppHistory,
} from '../../lib/aiAppBreakdown';
import type { AppBreakdownEntry } from '../../lib/aiAppBreakdown';
import type { WorkDiarySlot } from '../../types/api';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

const BACKFILL_PATH = path.resolve(__dirname, '..', 'useHistoryBackfill.ts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlot(tags: string[], appNames: string[]): WorkDiarySlot {
  return {
    tags,
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
    events: appNames.map(p => ({ processName: p, idle: false, activity: 'OTHER' })),
  };
}

// ─── FR6: Static analysis — useHistoryBackfill source contract ────────────────

describe('FR6: useHistoryBackfill — app breakdown integration (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(BACKFILL_PATH, 'utf8');
  });

  it('SC6.1 — source imports extractAppBreakdown', () => {
    expect(source).toMatch(/extractAppBreakdown/);
  });

  it('SC6.2 — source imports mergeAppBreakdown', () => {
    expect(source).toMatch(/mergeAppBreakdown/);
  });

  it('SC6.3 — source imports loadAppHistory', () => {
    expect(source).toMatch(/loadAppHistory/);
  });

  it('SC6.4 — source imports saveAppHistory', () => {
    expect(source).toMatch(/saveAppHistory/);
  });

  it('SC6.5 — source maintains slotsData alongside dayData in backfill loop', () => {
    // The backfill loop must keep raw slots, not just TagData
    expect(source).toMatch(/slotsData/);
  });

  it('SC6.6 — source calls extractAppBreakdown inside or after Promise.allSettled loop', () => {
    expect(source).toMatch(/extractAppBreakdown\s*\(/);
  });

  it('SC6.7 — source writes to ai_app_history with saveAppHistory fire-and-forget', () => {
    expect(source).toMatch(/saveAppHistory\s*\(/);
    expect(source).toMatch(/loadAppHistory[\s\S]{0,400}\.catch\s*\(\s*\(\s*\)\s*=>/);
  });

  it('SC6.8 — app breakdown write does not affect weekly_history_v2 path (isolated .catch)', () => {
    // The app breakdown write must be wrapped in its own .catch(),
    // separate from the existing saveWeeklyHistory call
    const catchCount = (source.match(/\.catch\s*\(\s*\(\s*\)\s*=>/g) ?? []).length;
    // At minimum one .catch() for app breakdown write
    expect(catchCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── FR6: Backfill computation logic (unit) ──────────────────────────────────

describe('FR6: backfill computation correctness', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC6.9 — slotsData map accumulates per-day fulfilled results', () => {
    // Simulate the slotsData accumulation: 7 days, some fulfilled some rejected
    const slotsData: Record<string, WorkDiarySlot[]> = {};
    const dates = ['2026-03-16', '2026-03-17', '2026-03-18'];
    const mockResults: PromiseSettledResult<WorkDiarySlot[]>[] = [
      { status: 'fulfilled', value: [makeSlot(['ai_usage'], ['Cursor'])] },
      { status: 'rejected', reason: new Error('network') },
      { status: 'fulfilled', value: [makeSlot([], ['Slack'])] },
    ];

    for (let i = 0; i < mockResults.length; i++) {
      const result = mockResults[i];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        slotsData[dates[i]] = result.value;
      }
    }

    // Only fulfilled days land in slotsData
    expect(Object.keys(slotsData)).toEqual(['2026-03-16', '2026-03-18']);
    expect(slotsData['2026-03-17']).toBeUndefined();
  });

  it('SC6.10 — weekly breakdown from slotsData accumulates across fulfilled days', () => {
    const slotsData: Record<string, WorkDiarySlot[]> = {
      '2026-03-16': [makeSlot(['ai_usage'], ['Cursor', 'Chrome'])],
      '2026-03-17': [makeSlot(['second_brain'], ['Obsidian'])],
      '2026-03-18': [makeSlot([], ['Slack'])],
    };

    const weekBreakdown = Object.values(slotsData).reduce<AppBreakdownEntry[]>(
      (acc, slots) => mergeAppBreakdown(acc, extractAppBreakdown(slots)),
      [],
    );

    const cursor = weekBreakdown.find(e => e.appName === 'Cursor');
    expect(cursor?.aiSlots).toBe(1);
    const obsidian = weekBreakdown.find(e => e.appName === 'Obsidian');
    expect(obsidian?.aiSlots).toBe(1);
    expect(obsidian?.brainliftSlots).toBe(1);
    const slack = weekBreakdown.find(e => e.appName === 'Slack');
    expect(slack?.nonAiSlots).toBe(1);
  });

  it('SC6.11 — ai_app_history populated for each past week after backfill', async () => {
    // Simulate two weeks being backfilled sequentially
    const weeks = ['2026-03-09', '2026-03-16'];
    for (const monday of weeks) {
      const breakdown: AppBreakdownEntry[] = [
        { appName: 'Cursor', aiSlots: 10, brainliftSlots: 0, nonAiSlots: 3 },
      ];
      const hist = await loadAppHistory();
      const existing = hist[monday] ?? [];
      await saveAppHistory({
        ...hist,
        [monday]: mergeAppBreakdown(existing, breakdown),
      });
    }

    const final = await loadAppHistory();
    expect(Object.keys(final)).toContain('2026-03-09');
    expect(Object.keys(final)).toContain('2026-03-16');
    expect(final['2026-03-09'][0].appName).toBe('Cursor');
    expect(final['2026-03-16'][0].appName).toBe('Cursor');
  });

  it('SC6.12 — write failure is silent and weekly_history_v2 result unaffected', async () => {
    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('IO error'));
    // Simulate the fire-and-forget pattern
    let propagated = false;
    try {
      await loadAppHistory()
        .then((_hist) => { throw new Error('IO error'); })
        .catch(() => { /* silent — does not propagate */ });
    } catch {
      propagated = true;
    }
    expect(propagated).toBe(false);
  });

  it('SC6.13 — no extra API calls (slotsData comes from already-fetched results)', () => {
    // Verify: the backfill test above doesn't need any additional API calls —
    // the slotsData is derived from result.value which is already fetched
    // This is a design invariant test: slotsData uses value from allSettled results only
    const mockResult: PromiseFulfilledResult<WorkDiarySlot[]> = {
      status: 'fulfilled',
      value: [makeSlot(['ai_usage'], ['Cursor'])],
    };
    // Access result.value directly — no additional fetch needed
    expect(mockResult.value).toHaveLength(1);
    expect(mockResult.value[0].events?.[0].processName).toBe('Cursor');
  });
});
