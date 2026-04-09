/**
 * useHistoryBackfill — one-time-per-session AI%/BrainLift backfill for past weeks.
 *
 * The payments API already populates earnings + hours in weekly_history_v2
 * via useEarningsHistory. But AI%/BrainLift requires work diary fetches per day
 * and is only written on Mondays by useAIData — so past weeks have aiPct=0.
 *
 * This hook detects those gaps and backfills them silently in the background.
 * Runs once per session (ref guard). Does not affect loading state of callers.
 *
 * Strategy:
 *   - Find past week Mondays (up to BACKFILL_MAX) where aiPct === 0 in history
 *   - For each, fetch 7 work diary days in parallel (Mon–Sun)
 *   - Compute aiPct midpoint + brainliftHours, merge into weekly_history_v2
 *   - Weeks are processed sequentially to avoid bursting the API
 */

import { useEffect, useRef, useState } from 'react';
import { useConfig } from './useConfig';
import { loadCredentials } from '../store/config';
import { getAuthToken, apiGet } from '../api/client';
import { countDiaryTags } from '../lib/ai';
import {
  extractAppBreakdown,
  mergeAppBreakdown,
  loadAppHistory,
  saveAppHistory,
} from '../lib/aiAppBreakdown';
import type { AppBreakdownEntry } from '../lib/aiAppBreakdown';
import { loadWeeklyHistory, mergeWeeklySnapshot, saveWeeklyHistory } from '../lib/weeklyHistory';
import type { WeeklySnapshot } from '../lib/weeklyHistory';
import type { TagData } from '../lib/ai';
import type { WorkDiarySlot } from '../types/api';

const BACKFILL_MAX = 23; // cover all 24 weeks of history (past completed weeks only)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns YYYY-MM-DD for Monday N weeks before the current UTC week's Monday.
 *  Uses UTC arithmetic to match weekly_history_v2 keys written by useEarningsHistory. */
function getMondayNWeeksAgo(n: number): string {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  const ms = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToMonday - n * 7,
  );
  return new Date(ms).toISOString().slice(0, 10);
}

/** Returns the 7 YYYY-MM-DD dates for a week starting on mondayStr. */
function weekDates(mondayStr: string): string[] {
  const dates: string[] = [];
  const base = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

/** Computes AI% midpoint and BrainLift hours from a map of per-day TagData. */
function computeWeekAI(dayData: Record<string, TagData>): { aiPct: number; brainliftHours: number } {
  let totalSlots = 0, aiUsage = 0, secondBrain = 0, noTags = 0;
  for (const td of Object.values(dayData)) {
    totalSlots += td.total;
    aiUsage += td.aiUsage;
    secondBrain += td.secondBrain;
    noTags += td.noTags;
  }
  const tagged = totalSlots - noTags;
  const aiPct = tagged > 0 ? Math.round((aiUsage / tagged) * 100) : 0;
  const brainliftHours = secondBrain * 10 / 60;
  return { aiPct, brainliftHours };
}

// ─── Backfill runner ──────────────────────────────────────────────────────────

/** Returns the full updated history after filling AI gaps, or null if nothing to fill. */
async function runBackfill(
  assignmentId: string,
  useQA: boolean,
  username: string,
  password: string,
): Promise<WeeklySnapshot[]> {
  const history = await loadWeeklyHistory();
  const historyMap = new Map(history.map(s => [s.weekStart, s]));

  // Collect past week Mondays that need AI backfill (aiPct === 0)
  // Start from 1 week ago up to BACKFILL_MAX weeks ago (skip current week)
  const weeksToFill: string[] = [];
  for (let n = 1; n <= BACKFILL_MAX; n++) {
    const monday = getMondayNWeeksAgo(n);
    const entry = historyMap.get(monday);
    // Fill if missing or aiPct === 0 (any week with real work is unlikely to be truly 0%)
    if (!entry || entry.aiPct === 0) {
      weeksToFill.push(monday);
    }
  }

  // Always return history (even if nothing to fill) so callers get fresh storage state.
  // This ensures useOverviewData sees writes from week-transition flush in useAIData.
  if (weeksToFill.length === 0) return history;

  // Get auth token once, reuse for all calls
  let token: string;
  try {
    token = await getAuthToken(username, password, useQA);
  } catch {
    return history; // Auth failure — return current history so overview still refreshes
  }

  let updated = [...history];

  // Process weeks sequentially (avoid API burst), days within each week in parallel
  for (const monday of weeksToFill) {
    const dates = weekDates(monday);
    const dayData: Record<string, TagData> = {};
    const slotsData: Record<string, WorkDiarySlot[]> = {}; // FR6 (11-app-data-layer)

    // Fetch all 7 days in parallel, tolerating individual failures
    const results = await Promise.allSettled(
      dates.map(date =>
        apiGet<WorkDiarySlot[]>(
          '/api/timetracking/workdiaries',
          { assignmentId, date },
          token,
          useQA,
        )
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        dayData[dates[i]] = countDiaryTags(result.value);
        slotsData[dates[i]] = result.value; // FR6: retain raw slots for app breakdown
      }
    }

    // Only write if we got at least some data (avoid overwriting with all-zeros)
    if (Object.keys(dayData).length > 0) {
      const { aiPct, brainliftHours } = computeWeekAI(dayData);
      updated = mergeWeeklySnapshot(updated, { weekStart: monday, aiPct, brainliftHours });
      // Save + notify after each week so useWeeklyHistory re-reads incrementally.
      // This drives the progressive chart animation — each write triggers a re-read
      // which grows data.length by 1, re-triggering TrendSparkline's clip reveal.
      await saveWeeklyHistory(updated);
    }

    // FR6 (11-app-data-layer): fire-and-forget app breakdown write for this past week.
    // Failures are silently caught so weekly_history_v2 backfill is unaffected.
    if (Object.keys(slotsData).length > 0) {
      const weekBreakdown = Object.values(slotsData).reduce<AppBreakdownEntry[]>(
        (acc, slots) => mergeAppBreakdown(acc, extractAppBreakdown(slots)),
        [],
      );
      loadAppHistory().then(hist => {
        const existing = hist[monday] ?? [];
        return saveAppHistory({
          ...hist,
          [monday]: mergeAppBreakdown(existing, weekBreakdown),
        });
      }).catch(() => {});
    }

    // Brief pause between weeks — lets Hermes GC reclaim Promise/response allocations
    // before the next batch of 7 parallel fetches, avoiding OOM from accumulated heap pressure.
    await new Promise<void>(resolve => setTimeout(resolve, 300));
  }

  return updated;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Backfills AI%/BrainLift for past weeks missing in weekly_history_v2.
 *
 * Returns the full updated WeeklySnapshot[] once complete (null while pending).
 * The caller (useOverviewData) should use these snapshots directly so the overview
 * reflects backfilled data without waiting for useWeeklyHistory to re-read AsyncStorage.
 */
export function useHistoryBackfill(): WeeklySnapshot[] | null {
  const { config } = useConfig();
  const hasRun = useRef(false);
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[] | null>(null);

  useEffect(() => {
    if (hasRun.current) return;
    if (!config?.assignmentId) return;

    hasRun.current = true;

    const refreshFromStorage = () =>
      loadWeeklyHistory().then(data => setSnapshots(data)).catch(() => {});

    const timer = setTimeout(() => {
      loadCredentials().then(creds => {
        if (!creds) { refreshFromStorage(); return; }
        return runBackfill(config.assignmentId, config.useQA, creds.username, creds.password)
          .then(updated => { setSnapshots(updated); });
      }).catch(() => {
        refreshFromStorage(); // ensure overview always gets fresh storage state
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [config?.assignmentId]);

  return snapshots;
}
