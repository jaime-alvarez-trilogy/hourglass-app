// weeklyHistory.ts — 06-overview-history FR1
// Pure functions for reading, writing, and merging the weekly_history_v2 AsyncStorage store.
// Two hooks write to this store independently (useEarningsHistory, useAIData).
// One hook reads it (useWeeklyHistory).

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklySnapshot {
  weekStart: string;        // YYYY-MM-DD (Monday)
  hours: number;            // Total paid hours that week (= Payment hours column)
  earnings: number;         // Total earnings that week (0 if unknown)
  aiPct: number;            // Midpoint AI% for the week (0 if unknown)
  brainliftHours: number;   // BrainLift hours for the week (0 if unknown)
  overtime?: number;        // Actual overtime hours above weekly limit (may be absent in old snapshots)
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const WEEKLY_HISTORY_KEY = 'weekly_history_v2';
export const WEEKLY_HISTORY_MAX = 24;

// ─── mergeWeeklySnapshot ──────────────────────────────────────────────────────

/**
 * Merges a partial snapshot update into the history array.
 *
 * - If `partial.weekStart` already exists: merges only the fields present in `partial`.
 * - If not found: appends a new entry with missing fields defaulting to 0.
 * - Sorts result ascending by weekStart.
 * - Trims to WEEKLY_HISTORY_MAX entries (oldest removed).
 * - Does not mutate the input array.
 */
export function mergeWeeklySnapshot(
  history: WeeklySnapshot[],
  partial: Partial<WeeklySnapshot> & { weekStart: string },
): WeeklySnapshot[] {
  const idx = history.findIndex(s => s.weekStart === partial.weekStart);
  let updated: WeeklySnapshot[];

  if (idx >= 0) {
    // Merge: only overwrite fields present in partial
    updated = history.map((s, i) =>
      i === idx ? { ...s, ...partial } : s,
    );
  } else {
    // Append new entry with defaults for missing fields
    const entry: WeeklySnapshot = {
      weekStart: partial.weekStart,
      hours: partial.hours ?? 0,
      earnings: partial.earnings ?? 0,
      aiPct: partial.aiPct ?? 0,
      brainliftHours: partial.brainliftHours ?? 0,
    };
    updated = [...history, entry];
  }

  // Sort ascending, trim to max (slice(-N) keeps last N = most recent)
  return updated
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-WEEKLY_HISTORY_MAX);
}

// ─── loadWeeklyHistory ────────────────────────────────────────────────────────

/**
 * Reads WeeklySnapshot[] from AsyncStorage.
 * Returns [] on missing key, invalid JSON, non-array value, or any error.
 * Never throws.
 */
export async function loadWeeklyHistory(): Promise<WeeklySnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(WEEKLY_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WeeklySnapshot[];
  } catch {
    return [];
  }
}

// ─── wipeAIHistory (dev only) ─────────────────────────────────────────────────

/**
 * Zeroes out aiPct and brainliftHours on every stored snapshot.
 * Preserves earnings and hours. Call once to demo the backfill animation.
 */
export async function wipeAIHistory(): Promise<void> {
  const history = await loadWeeklyHistory();
  const wiped = history.map(s => ({ ...s, aiPct: 0, brainliftHours: 0 }));
  await saveWeeklyHistory(wiped);
}

// ─── History update event ─────────────────────────────────────────────────────

type HistoryListener = () => void;
const _historyListeners: HistoryListener[] = [];

/**
 * Subscribe to history saves. Returns an unsubscribe function.
 * Called by useWeeklyHistory to re-read AsyncStorage after each backfill write.
 */
export function onHistoryUpdate(fn: HistoryListener): () => void {
  _historyListeners.push(fn);
  return () => {
    const i = _historyListeners.indexOf(fn);
    if (i >= 0) _historyListeners.splice(i, 1);
  };
}

// ─── saveWeeklyHistory ────────────────────────────────────────────────────────

/**
 * Writes WeeklySnapshot[] to AsyncStorage, then notifies all subscribers.
 * Propagates AsyncStorage errors — callers decide how to handle.
 */
export async function saveWeeklyHistory(snapshots: WeeklySnapshot[]): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_HISTORY_KEY, JSON.stringify(snapshots));
  _historyListeners.forEach(fn => fn());
}
