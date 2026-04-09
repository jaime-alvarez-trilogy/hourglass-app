// aiAppBreakdown.ts — 11-app-data-layer FR2, FR3, FR4
// Pure functions for extracting per-app AI vs non-AI slot counts from work diary data,
// and AsyncStorage helpers for the ai_app_history cache.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkDiarySlot } from '../types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Per-app aggregated slot counts for one week (or batch of slots).
 *
 * `brainliftSlots` is a strict subset of `aiSlots`:
 * a slot tagged `second_brain` is counted in both.
 */
export interface AppBreakdownEntry {
  appName: string;        // slot.events[n].processName
  aiSlots: number;        // slots with (ai_usage OR second_brain) containing this app
  brainliftSlots: number; // slots with second_brain tag (subset of aiSlots)
  nonAiSlots: number;     // slots without any AI tag containing this app
}

export const APP_HISTORY_KEY = 'ai_app_history';

/**
 * Cache stored under APP_HISTORY_KEY in AsyncStorage.
 * Key = Monday YYYY-MM-DD (week start).
 * Value = AppBreakdownEntry[] sorted by (aiSlots + nonAiSlots) descending.
 */
export type AppHistoryCache = Record<string, AppBreakdownEntry[]>;

// ─── FR2: extractAppBreakdown ──────────────────────────────────────────────────

/**
 * Extracts per-app AI vs non-AI slot counts from a batch of work diary slots.
 *
 * For each slot:
 * - Collects unique processName values from slot.events[] (filters falsy)
 * - Increments aiSlots (if hasAi), brainliftSlots (if hasSb), nonAiSlots (if !hasAi)
 *   for each unique app in the slot
 * - Slots without events (or with empty events) are skipped
 *
 * Returns sorted by (aiSlots + nonAiSlots) descending.
 * Pure function — no side effects, no I/O.
 */
export function extractAppBreakdown(slots: WorkDiarySlot[]): AppBreakdownEntry[] {
  const map = new Map<string, AppBreakdownEntry>();

  for (const slot of slots) {
    if (!slot.events || slot.events.length === 0) continue;

    // Unique app names in this slot (deduplicate, filter falsy)
    const uniqueApps = new Set(
      slot.events
        .map(e => e.processName)
        .filter(Boolean),
    );

    if (uniqueApps.size === 0) continue;

    const hasAi = slot.tags.includes('ai_usage') || slot.tags.includes('second_brain');
    const hasSb = slot.tags.includes('second_brain');

    for (const appName of uniqueApps) {
      const entry = map.get(appName) ?? { appName, aiSlots: 0, brainliftSlots: 0, nonAiSlots: 0 };
      if (hasAi) {
        entry.aiSlots++;
      } else {
        entry.nonAiSlots++;
      }
      if (hasSb) {
        entry.brainliftSlots++;
      }
      map.set(appName, entry);
    }
  }

  return [...map.values()].sort(
    (a, b) => (b.aiSlots + b.nonAiSlots) - (a.aiSlots + a.nonAiSlots),
  );
}

// ─── FR3: mergeAppBreakdown ────────────────────────────────────────────────────

/**
 * Merges two AppBreakdownEntry arrays by summing slot counts for matching appName.
 * Entries in `additions` not present in `existing` are appended.
 * Returns sorted by (aiSlots + nonAiSlots) descending.
 * Does not mutate input arrays.
 */
export function mergeAppBreakdown(
  existing: AppBreakdownEntry[],
  additions: AppBreakdownEntry[],
): AppBreakdownEntry[] {
  const map = new Map<string, AppBreakdownEntry>(
    existing.map(e => [e.appName, { ...e }]),
  );

  for (const add of additions) {
    const current = map.get(add.appName);
    if (current) {
      current.aiSlots += add.aiSlots;
      current.brainliftSlots += add.brainliftSlots;
      current.nonAiSlots += add.nonAiSlots;
    } else {
      map.set(add.appName, { ...add });
    }
  }

  return [...map.values()].sort(
    (a, b) => (b.aiSlots + b.nonAiSlots) - (a.aiSlots + a.nonAiSlots),
  );
}

// ─── FR4: AsyncStorage helpers ─────────────────────────────────────────────────

/**
 * Reads the ai_app_history cache from AsyncStorage.
 * Returns {} on missing key, invalid JSON, or any error. Never throws.
 */
export async function loadAppHistory(): Promise<AppHistoryCache> {
  try {
    const raw = await AsyncStorage.getItem(APP_HISTORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as AppHistoryCache;
  } catch {
    return {};
  }
}

/**
 * Writes the ai_app_history cache to AsyncStorage.
 * Propagates AsyncStorage errors — callers are responsible for catching.
 */
export async function saveAppHistory(cache: AppHistoryCache): Promise<void> {
  await AsyncStorage.setItem(APP_HISTORY_KEY, JSON.stringify(cache));
}
