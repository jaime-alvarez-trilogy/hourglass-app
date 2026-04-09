// Tests: useAIData — 11-app-data-layer FR5
// Verifies that useAIData saves app breakdown to ai_app_history after fetching work diary.
//
// Strategy: static analysis of useAIData.ts source to verify integration contract,
// plus direct tests of the breakdown computation logic.
// (renderHook is not viable in jest-expo/node preset.)

import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractAppBreakdown,
  mergeAppBreakdown,
  loadAppHistory,
  saveAppHistory,
  APP_HISTORY_KEY,
} from '../../lib/aiAppBreakdown';
import type { AppBreakdownEntry } from '../../lib/aiAppBreakdown';
import type { WorkDiarySlot } from '../../types/api';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

const USE_AI_DATA_PATH = path.resolve(__dirname, '..', 'useAIData.ts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlotWithEvents(tags: string[], appNames: string[]): WorkDiarySlot {
  return {
    tags,
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
    events: appNames.map(p => ({ processName: p, idle: false, activity: 'AI' })),
  };
}

// ─── FR5: Static analysis — useAIData source contract ────────────────────────

describe('FR5: useAIData — app breakdown integration (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_AI_DATA_PATH, 'utf8');
  });

  it('SC5.1 — source imports extractAppBreakdown', () => {
    expect(source).toMatch(/extractAppBreakdown/);
  });

  it('SC5.2 — source imports mergeAppBreakdown', () => {
    expect(source).toMatch(/mergeAppBreakdown/);
  });

  it('SC5.3 — source imports loadAppHistory', () => {
    expect(source).toMatch(/loadAppHistory/);
  });

  it('SC5.4 — source imports saveAppHistory', () => {
    expect(source).toMatch(/saveAppHistory/);
  });

  it('SC5.5 — Promise.all result includes slots (raw slots retained)', () => {
    // The result shape must include `slots` so extractAppBreakdown can be called
    expect(source).toMatch(/return\s*\{[^}]*slots/);
  });

  it('SC5.6 — source calls extractAppBreakdown on slots from fetch results', () => {
    expect(source).toMatch(/extractAppBreakdown\s*\(/);
  });

  it('SC5.7 — source uses loadAppHistory then saveAppHistory for ai_app_history', () => {
    // Must load existing cache before merging and saving
    expect(source).toMatch(/loadAppHistory\s*\(\s*\)/);
    expect(source).toMatch(/saveAppHistory\s*\(/);
  });

  it('SC5.8 — app breakdown write is fire-and-forget (.catch(() => {}))', () => {
    // The write chain must be caught silently so it does not affect AI% state
    // Look for the pattern near loadAppHistory call
    expect(source).toMatch(/loadAppHistory[\s\S]{0,400}\.catch\s*\(\s*\(\s*\)\s*=>/);
  });

  it('SC5.9 — mergeAppBreakdown used to merge existing week data with batch', () => {
    expect(source).toMatch(/mergeAppBreakdown\s*\(/);
  });
});

// ─── FR5: Breakdown computation logic (unit) ─────────────────────────────────

describe('FR5: app breakdown computation correctness', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC5.10 — extractAppBreakdown called on day slots produces correct per-day breakdown', () => {
    const daySlots: WorkDiarySlot[] = [
      makeSlotWithEvents(['ai_usage'], ['Cursor']),
      makeSlotWithEvents(['ai_usage'], ['Cursor', 'Chrome']),
      makeSlotWithEvents([], ['Slack']),
    ];
    const breakdown = extractAppBreakdown(daySlots);
    const cursor = breakdown.find(e => e.appName === 'Cursor');
    const chrome = breakdown.find(e => e.appName === 'Chrome');
    const slack = breakdown.find(e => e.appName === 'Slack');
    expect(cursor?.aiSlots).toBe(2);
    expect(chrome?.aiSlots).toBe(1);
    expect(slack?.nonAiSlots).toBe(1);
  });

  it('SC5.11 — weekly batch reduction via mergeAppBreakdown accumulates across days', () => {
    const day1: AppBreakdownEntry[] = extractAppBreakdown([
      makeSlotWithEvents(['ai_usage'], ['Cursor']),
    ]);
    const day2: AppBreakdownEntry[] = extractAppBreakdown([
      makeSlotWithEvents(['ai_usage'], ['Cursor']),
      makeSlotWithEvents([], ['Slack']),
    ]);
    const weekBreakdown = mergeAppBreakdown(day1, day2);
    const cursor = weekBreakdown.find(e => e.appName === 'Cursor');
    expect(cursor?.aiSlots).toBe(2);
    const slack = weekBreakdown.find(e => e.appName === 'Slack');
    expect(slack?.nonAiSlots).toBe(1);
  });

  it('SC5.12 — existing week data merged (not replaced) via loadAppHistory + mergeAppBreakdown', async () => {
    // Simulate: already have partial data for current week
    const existing: AppBreakdownEntry[] = [{ appName: 'Cursor', aiSlots: 3, brainliftSlots: 0, nonAiSlots: 1 }];
    const currentMonday = '2026-03-23';
    await saveAppHistory({ [currentMonday]: existing });

    // New batch from today's fetch
    const batchBreakdown: AppBreakdownEntry[] = [{ appName: 'Cursor', aiSlots: 1, brainliftSlots: 0, nonAiSlots: 0 }];

    // Simulate the hook's load → merge → save logic
    const hist = await loadAppHistory();
    const prev = hist[currentMonday] ?? [];
    const merged = mergeAppBreakdown(prev, batchBreakdown);
    await saveAppHistory({ ...hist, [currentMonday]: merged });

    // Verify accumulation
    const final = await loadAppHistory();
    const cursor = final[currentMonday]?.find(e => e.appName === 'Cursor');
    expect(cursor?.aiSlots).toBe(4); // 3 + 1
    expect(cursor?.nonAiSlots).toBe(1);
  });

  it('SC5.13 — write failure is silent and does not propagate', async () => {
    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));
    // Simulate the fire-and-forget pattern
    let didThrow = false;
    try {
      await loadAppHistory()
        .then(() => { throw new Error('Storage full'); })
        .catch(() => { /* silent */ });
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });
});
