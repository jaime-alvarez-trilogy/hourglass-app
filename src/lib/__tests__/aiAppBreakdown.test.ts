// Tests: aiAppBreakdown — 11-app-data-layer
// Covers FR1 (type shape), FR2 (extractAppBreakdown), FR3 (mergeAppBreakdown),
// FR4 (loadAppHistory / saveAppHistory).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  extractAppBreakdown,
  mergeAppBreakdown,
  loadAppHistory,
  saveAppHistory,
  APP_HISTORY_KEY,
} from '../aiAppBreakdown';
import type { AppBreakdownEntry, AppHistoryCache } from '../aiAppBreakdown';
import type { WorkDiarySlot } from '../../types/api';

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(overrides: Partial<WorkDiarySlot> = {}): WorkDiarySlot {
  return {
    tags: [],
    autoTracker: true,
    status: 'APPROVED',
    memo: '',
    actions: [],
    ...overrides,
  };
}

function makeEntry(
  appName: string,
  aiSlots: number,
  brainliftSlots: number,
  nonAiSlots: number,
): AppBreakdownEntry {
  return { appName, aiSlots, brainliftSlots, nonAiSlots };
}

// ─── FR1: WorkDiaryEvent type shape ──────────────────────────────────────────

describe('FR1: WorkDiaryEvent type shape', () => {
  it('SC1.1 — WorkDiarySlot accepts optional events field', () => {
    const slot: WorkDiarySlot = makeSlot({
      events: [
        { processName: 'Cursor', idle: false, activity: 'AI' },
      ],
    });
    expect(slot.events).toHaveLength(1);
    expect(slot.events![0].processName).toBe('Cursor');
    expect(slot.events![0].idle).toBe(false);
    expect(slot.events![0].activity).toBe('AI');
  });

  it('SC1.2 — WorkDiarySlot without events is valid (optional field)', () => {
    const slot: WorkDiarySlot = makeSlot();
    expect(slot.events).toBeUndefined();
  });
});

// ─── FR2: extractAppBreakdown ─────────────────────────────────────────────────

describe('FR2: extractAppBreakdown', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it('SC2.1 — slots with ai_usage tag: apps go into aiSlots, not nonAiSlots', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage'],
        events: [{ processName: 'Cursor', idle: false, activity: 'AI' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ appName: 'Cursor', aiSlots: 1, brainliftSlots: 0, nonAiSlots: 0 });
  });

  it('SC2.2 — slots with second_brain tag: apps go into both aiSlots and brainliftSlots', () => {
    const slots = [
      makeSlot({
        tags: ['second_brain'],
        events: [{ processName: 'Obsidian', idle: false, activity: 'AI' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ appName: 'Obsidian', aiSlots: 1, brainliftSlots: 1, nonAiSlots: 0 });
  });

  it('SC2.3 — slots with no AI tag: apps go into nonAiSlots only', () => {
    const slots = [
      makeSlot({
        tags: ['not_second_brain'],
        events: [{ processName: 'Slack', idle: false, activity: 'OTHER' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ appName: 'Slack', aiSlots: 0, brainliftSlots: 0, nonAiSlots: 1 });
  });

  it('SC2.3b — slots with empty tags: apps go into nonAiSlots only', () => {
    const slots = [
      makeSlot({
        tags: [],
        events: [{ processName: 'Chrome', idle: false, activity: 'OTHER' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result[0]).toEqual({ appName: 'Chrome', aiSlots: 0, brainliftSlots: 0, nonAiSlots: 1 });
  });

  it('SC2.4 — multiple unique apps in one slot: each gets +1 independently (no double-count)', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage'],
        events: [
          { processName: 'Cursor', idle: false, activity: 'AI' },
          { processName: 'Chrome', idle: false, activity: 'OTHER' },
        ],
      }),
    ];
    const result = extractAppBreakdown(slots);
    const cursor = result.find(e => e.appName === 'Cursor');
    const chrome = result.find(e => e.appName === 'Chrome');
    expect(cursor).toEqual({ appName: 'Cursor', aiSlots: 1, brainliftSlots: 0, nonAiSlots: 0 });
    expect(chrome).toEqual({ appName: 'Chrome', aiSlots: 1, brainliftSlots: 0, nonAiSlots: 0 });
  });

  it('SC2.4b — duplicate app in same slot events: counted only once per slot', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage'],
        events: [
          { processName: 'Cursor', idle: false, activity: 'AI' },
          { processName: 'Cursor', idle: true, activity: 'AI' }, // duplicate
        ],
      }),
    ];
    const result = extractAppBreakdown(slots);
    const cursor = result.find(e => e.appName === 'Cursor');
    expect(cursor?.aiSlots).toBe(1); // only 1, not 2
  });

  it('SC2.5 — same app in AI and non-AI slots: aiSlots and nonAiSlots accumulate separately', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage'],
        events: [{ processName: 'Chrome', idle: false, activity: 'AI' }],
      }),
      makeSlot({
        tags: [],
        events: [{ processName: 'Chrome', idle: false, activity: 'OTHER' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ appName: 'Chrome', aiSlots: 1, brainliftSlots: 0, nonAiSlots: 1 });
  });

  it('SC2.6 — output sorted by (aiSlots + nonAiSlots) descending', () => {
    const slots = [
      makeSlot({ tags: [], events: [{ processName: 'Slack', idle: false, activity: 'OTHER' }] }),
      makeSlot({ tags: [], events: [{ processName: 'Cursor', idle: false, activity: 'OTHER' }] }),
      makeSlot({ tags: [], events: [{ processName: 'Cursor', idle: false, activity: 'OTHER' }] }),
      makeSlot({ tags: [], events: [{ processName: 'Chrome', idle: false, activity: 'OTHER' }] }),
      makeSlot({ tags: [], events: [{ processName: 'Chrome', idle: false, activity: 'OTHER' }] }),
      makeSlot({ tags: [], events: [{ processName: 'Chrome', idle: false, activity: 'OTHER' }] }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result[0].appName).toBe('Chrome');   // 3 total
    expect(result[1].appName).toBe('Cursor');   // 2 total
    expect(result[2].appName).toBe('Slack');    // 1 total
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('SC2.7 — empty slots array returns []', () => {
    expect(extractAppBreakdown([])).toEqual([]);
  });

  it('SC2.8 — slot with no events field is skipped', () => {
    const slots = [makeSlot({ tags: ['ai_usage'] })]; // no events
    expect(extractAppBreakdown(slots)).toEqual([]);
  });

  it('SC2.9 — slot with empty events array is skipped', () => {
    const slots = [makeSlot({ tags: ['ai_usage'], events: [] })];
    expect(extractAppBreakdown(slots)).toEqual([]);
  });

  it('SC2.10 — event with empty processName is filtered out', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage'],
        events: [
          { processName: '', idle: false, activity: 'AI' },
          { processName: 'Cursor', idle: false, activity: 'AI' },
        ],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result).toHaveLength(1);
    expect(result[0].appName).toBe('Cursor');
  });

  it('SC2.11 — all slots have no events returns []', () => {
    const slots = [
      makeSlot({ tags: ['ai_usage'] }),
      makeSlot({ tags: [] }),
      makeSlot({ tags: ['second_brain'] }),
    ];
    expect(extractAppBreakdown(slots)).toEqual([]);
  });

  it('SC2.12 — slot with ai_usage AND second_brain: aiSlots=1 brainliftSlots=1 (union, not double-counted)', () => {
    const slots = [
      makeSlot({
        tags: ['ai_usage', 'second_brain'],
        events: [{ processName: 'Obsidian', idle: false, activity: 'AI' }],
      }),
    ];
    const result = extractAppBreakdown(slots);
    expect(result[0]).toEqual({ appName: 'Obsidian', aiSlots: 1, brainliftSlots: 1, nonAiSlots: 0 });
  });
});

// ─── FR3: mergeAppBreakdown ───────────────────────────────────────────────────

describe('FR3: mergeAppBreakdown', () => {
  it('SC3.1 — matching appName entries: all three slot counts summed', () => {
    const existing = [makeEntry('Cursor', 5, 0, 3)];
    const additions = [makeEntry('Cursor', 2, 1, 1)];
    const result = mergeAppBreakdown(existing, additions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ appName: 'Cursor', aiSlots: 7, brainliftSlots: 1, nonAiSlots: 4 });
  });

  it('SC3.2 — new app in additions not in existing: appended', () => {
    const existing = [makeEntry('Cursor', 3, 0, 2)];
    const additions = [makeEntry('Slack', 1, 0, 4)];
    const result = mergeAppBreakdown(existing, additions);
    expect(result).toHaveLength(2);
    const appNames = result.map(e => e.appName);
    expect(appNames).toContain('Cursor');
    expect(appNames).toContain('Slack');
  });

  it('SC3.3 — output sorted by total slots descending', () => {
    const existing = [makeEntry('Slack', 1, 0, 1)];    // total 2
    const additions = [makeEntry('Cursor', 4, 0, 3)];  // total 7
    const result = mergeAppBreakdown(existing, additions);
    expect(result[0].appName).toBe('Cursor');
    expect(result[1].appName).toBe('Slack');
  });

  it('SC3.4 — empty existing + non-empty additions returns additions sorted', () => {
    const additions = [makeEntry('Slack', 2, 0, 3), makeEntry('Chrome', 5, 0, 1)];
    const result = mergeAppBreakdown([], additions);
    expect(result).toHaveLength(2);
    expect(result[0].appName).toBe('Chrome'); // 6 total
    expect(result[1].appName).toBe('Slack');  // 5 total
  });

  it('SC3.5 — non-empty existing + empty additions returns existing sorted', () => {
    const existing = [makeEntry('Cursor', 3, 0, 1), makeEntry('Chrome', 1, 0, 5)];
    const result = mergeAppBreakdown(existing, []);
    expect(result).toHaveLength(2);
    expect(result[0].appName).toBe('Chrome'); // 6 total
    expect(result[1].appName).toBe('Cursor'); // 4 total
  });

  it('SC3.6 — both empty returns []', () => {
    expect(mergeAppBreakdown([], [])).toEqual([]);
  });

  it('SC3.7 — input arrays are not mutated', () => {
    const existing = [makeEntry('Cursor', 1, 0, 2)];
    const additions = [makeEntry('Cursor', 3, 0, 1)];
    const existingCopy = JSON.stringify(existing);
    const additionsCopy = JSON.stringify(additions);
    mergeAppBreakdown(existing, additions);
    expect(JSON.stringify(existing)).toBe(existingCopy);
    expect(JSON.stringify(additions)).toBe(additionsCopy);
  });
});

// ─── FR4: APP_HISTORY_KEY, loadAppHistory, saveAppHistory ────────────────────

describe('FR4: APP_HISTORY_KEY constant', () => {
  it('SC4.1 — APP_HISTORY_KEY equals ai_app_history', () => {
    expect(APP_HISTORY_KEY).toBe('ai_app_history');
  });
});

describe('FR4: loadAppHistory', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC4.2 — missing key returns {}', async () => {
    const result = await loadAppHistory();
    expect(result).toEqual({});
  });

  it('SC4.3 — valid JSON returns parsed object', async () => {
    const cache: AppHistoryCache = {
      '2026-03-16': [makeEntry('Cursor', 5, 0, 2)],
    };
    await MockAsyncStorage.setItem(APP_HISTORY_KEY, JSON.stringify(cache));
    const result = await loadAppHistory();
    expect(result).toEqual(cache);
  });

  it('SC4.4 — invalid JSON returns {}', async () => {
    await MockAsyncStorage.setItem(APP_HISTORY_KEY, 'not-valid-json{{{');
    const result = await loadAppHistory();
    expect(result).toEqual({});
  });

  it('SC4.5 — AsyncStorage error returns {} (never throws)', async () => {
    MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage unavailable'));
    const result = await loadAppHistory();
    expect(result).toEqual({});
  });
});

describe('FR4: saveAppHistory', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC4.6 — writes JSON-serialized cache under APP_HISTORY_KEY', async () => {
    const cache: AppHistoryCache = {
      '2026-03-16': [makeEntry('Slack', 2, 0, 5)],
    };
    await saveAppHistory(cache);
    expect(MockAsyncStorage.setItem).toHaveBeenCalledWith(
      APP_HISTORY_KEY,
      JSON.stringify(cache),
    );
  });

  it('SC4.7 — propagates AsyncStorage write errors', async () => {
    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Disk full'));
    await expect(saveAppHistory({})).rejects.toThrow('Disk full');
  });
});
