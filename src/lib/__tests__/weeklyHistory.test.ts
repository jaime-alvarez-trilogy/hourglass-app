// Tests: weeklyHistory pure functions — 06-overview-history FR1
// Covers: mergeWeeklySnapshot, loadWeeklyHistory, saveWeeklyHistory, exported constants.
// durable-data 03-keep-last-good FR4 (DD3.25-DD3.27): readWeeklyHistoryForWrite (the strict
// reader the writers use), loadWeeklyHistory delegating to it, and wipeAIHistory skipping
// the write when the store cannot be read. ../log is mocked to observe the read-failure trace.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mergeWeeklySnapshot,
  loadWeeklyHistory,
  readWeeklyHistoryForWrite,
  saveWeeklyHistory,
  wipeAIHistory,
  WEEKLY_HISTORY_KEY,
  WEEKLY_HISTORY_MAX,
} from '../weeklyHistory';
import type { WeeklySnapshot } from '../weeklyHistory';
import { log } from '../log';

jest.mock('../log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockWarn = log.warn as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(weekStart: string, overrides: Partial<WeeklySnapshot> = {}): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 2000,
    aiPct: 75,
    brainliftHours: 5,
    ...overrides,
  };
}

// Generate N snapshots for consecutive weeks starting from W0
function makeSnapshots(n: number, startWeek = '2025-01-06'): WeeklySnapshot[] {
  const result: WeeklySnapshot[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startWeek + 'T00:00:00');
    d.setDate(d.getDate() + i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    result.push(makeSnapshot(`${y}-${m}-${dd}`));
  }
  return result;
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  it('SC1.1 — WEEKLY_HISTORY_KEY equals weekly_history_v2', () => {
    expect(WEEKLY_HISTORY_KEY).toBe('weekly_history_v2');
  });

  it('SC1.2 — WEEKLY_HISTORY_MAX equals 24', () => {
    expect(WEEKLY_HISTORY_MAX).toBe(24);
  });
});

// ─── mergeWeeklySnapshot ──────────────────────────────────────────────────────

describe('mergeWeeklySnapshot', () => {
  describe('SC1.3 — append to empty history', () => {
    it('new weekStart appended to empty history with defaults for missing fields', () => {
      const result = mergeWeeklySnapshot([], { weekStart: '2026-03-09', aiPct: 80 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        weekStart: '2026-03-09',
        hours: 0,
        earnings: 0,
        aiPct: 80,
        brainliftHours: 0,
      });
    });

    it('all fields provided → no defaults needed', () => {
      const result = mergeWeeklySnapshot([], {
        weekStart: '2026-03-09',
        hours: 40,
        earnings: 2000,
        aiPct: 80,
        brainliftHours: 5,
      });
      expect(result[0]).toEqual({
        weekStart: '2026-03-09',
        hours: 40,
        earnings: 2000,
        aiPct: 80,
        brainliftHours: 5,
      });
    });
  });

  describe('SC1.4 — append to non-empty history', () => {
    it('new weekStart appended to non-empty history', () => {
      const existing = [makeSnapshot('2026-03-02')];
      const result = mergeWeeklySnapshot(existing, { weekStart: '2026-03-09', hours: 35 });
      expect(result).toHaveLength(2);
      expect(result[1].weekStart).toBe('2026-03-09');
      expect(result[1].hours).toBe(35);
    });
  });

  describe('SC1.5 — merge existing weekStart (partial fields)', () => {
    it('only provided fields are updated; other fields unchanged', () => {
      const existing = [makeSnapshot('2026-03-09')]; // hours:40, earnings:2000, aiPct:75, brainlift:5
      const result = mergeWeeklySnapshot(existing, { weekStart: '2026-03-09', aiPct: 82 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        weekStart: '2026-03-09',
        hours: 40,       // unchanged
        earnings: 2000,  // unchanged
        aiPct: 82,       // updated
        brainliftHours: 5, // unchanged
      });
    });

    it('updating hours and earnings leaves aiPct and brainliftHours unchanged', () => {
      const existing = [makeSnapshot('2026-03-09')];
      const result = mergeWeeklySnapshot(existing, {
        weekStart: '2026-03-09',
        earnings: 2500,
        hours: 42,
      });
      expect(result[0].earnings).toBe(2500);
      expect(result[0].hours).toBe(42);
      expect(result[0].aiPct).toBe(75);       // unchanged
      expect(result[0].brainliftHours).toBe(5); // unchanged
    });
  });

  describe('SC1.6 — second write wins for written fields', () => {
    it('same weekStart written twice: second write wins for written fields', () => {
      let history = mergeWeeklySnapshot([], { weekStart: '2026-03-09', hours: 40 });
      history = mergeWeeklySnapshot(history, { weekStart: '2026-03-09', hours: 45 });
      expect(history).toHaveLength(1);
      expect(history[0].hours).toBe(45);
    });
  });

  describe('SC1.7 — trim to WEEKLY_HISTORY_MAX', () => {
    it('25 entries trimmed to 24, oldest removed', () => {
      const snapshots = makeSnapshots(25, '2025-01-06'); // 25 consecutive weeks
      const oldest = snapshots[0].weekStart;
      const result = mergeWeeklySnapshot(
        snapshots.slice(0, 24),
        { weekStart: snapshots[24].weekStart, hours: 1 },
      );
      expect(result).toHaveLength(24);
      // Oldest week should be gone
      expect(result.find(s => s.weekStart === oldest)).toBeUndefined();
      // Newest week should be present
      expect(result[23].weekStart).toBe(snapshots[24].weekStart);
    });

    it('24 entries stays at 24 (not trimmed further)', () => {
      const snapshots = makeSnapshots(24, '2025-01-06');
      // Re-merge the last entry (no new week)
      const result = mergeWeeklySnapshot(
        snapshots.slice(0, 24),
        { weekStart: snapshots[23].weekStart, aiPct: 99 },
      );
      expect(result).toHaveLength(24);
    });
  });

  describe('SC1.8 — sorted ascending by weekStart', () => {
    it('result is always sorted ascending by weekStart', () => {
      // Insert out of order
      const history = [
        makeSnapshot('2026-03-09'),
        makeSnapshot('2026-02-23'),
        makeSnapshot('2026-03-02'),
      ];
      const result = mergeWeeklySnapshot(history, { weekStart: '2026-02-16', hours: 20 });
      const weeks = result.map(s => s.weekStart);
      const sorted = [...weeks].sort();
      expect(weeks).toEqual(sorted);
    });
  });

  describe('SC1.9 — does not mutate input', () => {
    it('original history array is not mutated', () => {
      const original = [makeSnapshot('2026-03-09')];
      const copy = JSON.stringify(original);
      mergeWeeklySnapshot(original, { weekStart: '2026-03-16', hours: 38 });
      expect(JSON.stringify(original)).toBe(copy);
    });
  });
});

// ─── loadWeeklyHistory / saveWeeklyHistory ────────────────────────────────────

describe('loadWeeklyHistory and saveWeeklyHistory', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  describe('SC1.10 — round-trip', () => {
    it('save then load returns the same data', async () => {
      const snapshots: WeeklySnapshot[] = [
        makeSnapshot('2026-03-02'),
        makeSnapshot('2026-03-09'),
      ];
      await saveWeeklyHistory(snapshots);
      const loaded = await loadWeeklyHistory();
      expect(loaded).toEqual(snapshots);
    });
  });

  describe('SC1.11 — empty AsyncStorage returns []', () => {
    it('loadWeeklyHistory returns [] when key is missing', async () => {
      const result = await loadWeeklyHistory();
      expect(result).toEqual([]);
    });
  });

  describe('SC1.12 — corrupted AsyncStorage returns []', () => {
    it('corrupted JSON value returns [] gracefully', async () => {
      MockAsyncStorage.getItem.mockResolvedValueOnce('not valid json {{{');
      const result = await loadWeeklyHistory();
      expect(result).toEqual([]);
    });
  });

  describe('SC1.13 — non-array JSON returns []', () => {
    it('non-array JSON value (e.g. object) returns []', async () => {
      MockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));
      const result = await loadWeeklyHistory();
      expect(result).toEqual([]);
    });

    it('null JSON value returns []', async () => {
      MockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(null));
      const result = await loadWeeklyHistory();
      expect(result).toEqual([]);
    });
  });

  describe('SC1.14 — AsyncStorage error returns []', () => {
    it('loadWeeklyHistory returns [] if AsyncStorage.getItem throws', async () => {
      MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('storage error'));
      const result = await loadWeeklyHistory();
      expect(result).toEqual([]);
    });
  });

  describe('SC1.15 — saveWeeklyHistory writes correctly', () => {
    it('saved data is stored at WEEKLY_HISTORY_KEY', async () => {
      const snapshots = [makeSnapshot('2026-03-09')];
      await saveWeeklyHistory(snapshots);
      expect(MockAsyncStorage.setItem).toHaveBeenCalledWith(
        WEEKLY_HISTORY_KEY,
        JSON.stringify(snapshots),
      );
    });

    it('saveWeeklyHistory propagates AsyncStorage errors', async () => {
      MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      await expect(saveWeeklyHistory([makeSnapshot('2026-03-09')])).rejects.toThrow('disk full');
    });
  });
});

// ─── durable-data 03 FR4: a read failure is never saved over ──────────────────

describe('durable-data 03 FR4: readWeeklyHistoryForWrite and the strict-read writers', () => {
  /** A stored history the device already holds (the last good weeks). */
  const STORED: WeeklySnapshot[] = [
    makeSnapshot('2026-09-28', { overtime: 2, dailyHours: [8, 8, 8, 8, 8, 0, 0] }),
    makeSnapshot('2026-10-05', { aiPct: 81, brainliftHours: 6.5 }),
  ];

  /** Seeds weekly_history_v2 and returns the raw stored string. */
  async function seedStored(): Promise<string> {
    const raw = JSON.stringify(STORED);
    await AsyncStorage.setItem(WEEKLY_HISTORY_KEY, raw);
    MockAsyncStorage.setItem.mockClear();
    return raw;
  }

  const historyWrites = () =>
    MockAsyncStorage.setItem.mock.calls.filter(([key]) => key === WEEKLY_HISTORY_KEY);

  beforeEach(() => {
    // _reset() only clears calls: drop any unconsumed ...Once value as well, so one case's
    // queued rejection can never reach the next case.
    MockAsyncStorage.getItem.mockReset();
    MockAsyncStorage._reset();
    mockWarn.mockClear();
  });

  describe('DD3.25 — readWeeklyHistoryForWrite', () => {
    it('DD3.25 — round trip: returns the stored array', async () => {
      await seedStored();
      await expect(readWeeklyHistoryForWrite()).resolves.toEqual(STORED);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('DD3.25 — a missing key → [] (an empty history, safe to write)', async () => {
      await expect(readWeeklyHistoryForWrite()).resolves.toEqual([]);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('DD3.25 — corrupt JSON → [] (already lost, so writers may overwrite it)', async () => {
      MockAsyncStorage.getItem.mockResolvedValueOnce('not valid json {{{');
      await expect(readWeeklyHistoryForWrite()).resolves.toEqual([]);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('DD3.25 — non-array JSON (object, null) → []', async () => {
      MockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));
      await expect(readWeeklyHistoryForWrite()).resolves.toEqual([]);
      MockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(null));
      await expect(readWeeklyHistoryForWrite()).resolves.toEqual([]);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('DD3.25 — getItem rejects → null, with one history.read_failed warn and no error text', async () => {
      MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR manifest.json'));

      await expect(readWeeklyHistoryForWrite()).resolves.toBeNull();

      expect(MockAsyncStorage.getItem).toHaveBeenCalledWith(WEEKLY_HISTORY_KEY);
      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith('history.read_failed', {});
      expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('SQLITE');
    });
  });

  describe('DD3.26 — loadWeeklyHistory keeps its never-throws contract', () => {
    it('DD3.26 — getItem rejects → [] (readers still render an empty history)', async () => {
      MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
      await expect(loadWeeklyHistory()).resolves.toEqual([]);
    });

    it('DD3.26 — it delegates to the strict reader: the same single history.read_failed trace', async () => {
      MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR'));
      await loadWeeklyHistory();
      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith('history.read_failed', {});
    });
  });

  describe('DD3.27 — wipeAIHistory', () => {
    it('DD3.27 — getItem rejects → resolves without writing; the stored history is untouched', async () => {
      const raw = await seedStored();
      MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('SQLITE_IOERR'));

      await expect(wipeAIHistory()).resolves.toBeUndefined();

      expect(MockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(WEEKLY_HISTORY_KEY)).toBe(raw);
    });

    it('DD3.27 (preserved) — a readable history: zeroes aiPct and brainliftHours, keeps hours and earnings', async () => {
      await seedStored();

      await wipeAIHistory();

      expect(historyWrites()).toHaveLength(1);
      expect(JSON.parse(historyWrites()[0][1])).toEqual(
        STORED.map(s => ({ ...s, aiPct: 0, brainliftHours: 0 })),
      );
    });
  });
});
