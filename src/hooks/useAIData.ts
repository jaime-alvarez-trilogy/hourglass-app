// FR7, FR8 (04-ai-brainlift): useAIData hook
// Reads AI cache from AsyncStorage (instant display), background-fetches stale days,
// aggregates weekly AI% and BrainLift metrics.
//
// FR4 (06-ai-tab): Extended to cache previousWeekAIPercent in AsyncStorage.
// On mount, reads previous week's AI% for the delta badge.
// On each successful fetch on Monday, writes the midpoint AI% as the new previous week value.

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfig } from './useConfig';
import { loadCredentials } from '../store/config';
import { fetchWorkDiary } from '../api/workDiary';
import {
  countDiaryTags,
  aggregateAICache,
  shouldRefetchDay,
  getMondayOfWeek,
} from '../lib/ai';
import {
  extractAppBreakdown,
  mergeAppBreakdown,
  loadAppHistory,
  saveAppHistory,
} from '../lib/aiAppBreakdown';
import type { AppBreakdownEntry } from '../lib/aiAppBreakdown';
import { AuthError, NetworkError } from '../api/errors';
import type { TagData, AIWeekData } from '../lib/ai';
import { loadWeeklyHistory, mergeWeeklySnapshot, saveWeeklyHistory } from '../lib/weeklyHistory';

// ─── Types ────────────────────────────────────────────────────────────────────

// Stored as a plain Record; _lastFetchedAt is a string mixed in, others are TagData.
type AIRawCache = Record<string, TagData | string>;

const CACHE_KEY = 'ai_cache';

/** AsyncStorage key for week-over-week AI% comparison (FR4 06-ai-tab). */
const PREV_WEEK_KEY = 'previousWeekAIPercent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for today in UTC.
 *  Must match week boundaries used by the Crossover API and useEarningsHistory. */
function todayUTC(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for sunday 6 days after monday (same week). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns an array of YYYY-MM-DD from start to end (inclusive). */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Prunes cache to current Mon–Sun window.
 * Removes _lastFetchedAt and out-of-window date entries.
 */
function pruneToCurrentWeek(
  raw: Record<string, unknown>,
  today: string,
): Record<string, TagData> {
  const monday = getMondayOfWeek(today);
  const sunday = addDays(monday, 6);
  const result: Record<string, TagData> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === '_lastFetchedAt') continue;
    if (k >= monday && k <= sunday) {
      result[k] = v as TagData;
    }
  }
  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAIDataResult {
  data: AIWeekData | null;
  isLoading: boolean;
  lastFetchedAt: string | null;
  error: string | null;
  refetch: () => void;
  /** Cached AI% from the previous week — used for delta badge. undefined if not yet cached. */
  previousWeekPercent?: number;
}

export function useAIData(): UseAIDataResult {
  const { config } = useConfig();
  const [data, setData] = useState<AIWeekData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousWeekPercent, setPreviousWeekPercent] = useState<number | undefined>(undefined);
  const isFetchingRef = useRef(false);

  // FR4 (06-ai-tab): Load cached previous week AI% on mount for delta badge.
  // Silently ignores AsyncStorage failures — badge simply stays hidden.
  useEffect(() => {
    AsyncStorage.getItem(PREV_WEEK_KEY)
      .then((val) => {
        if (val !== null) {
          setPreviousWeekPercent(Number(val));
        }
      })
      .catch(() => {}); // silent failure
  }, []);

  const fetchData = useCallback(async (forceRefetchToday = false) => {
    if (!config) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setError(null);

    const today = todayUTC();

    try {
      // Load credentials
      const credentials = await loadCredentials();
      if (!credentials) {
        isFetchingRef.current = false;
        return;
      }

      // Load existing cache
      let rawCache: AIRawCache = {};
      try {
        const stored = await AsyncStorage.getItem(CACHE_KEY);
        if (stored) {
          rawCache = JSON.parse(stored) as AIRawCache;
        }
      } catch {
        rawCache = {};
      }

      // Week-transition flush: if cache has data from the PREVIOUS week, save it to
      // weekly_history_v2 before pruning it away. Fires once when week boundary is crossed.
      const currentMonday = getMondayOfWeek(today);
      const prevWeekMonday = addDays(currentMonday, -7);
      const prevWeekSunday = addDays(currentMonday, -1);
      const prevEntries = Object.entries(rawCache).filter(
        ([k]) => k !== '_lastFetchedAt' && k >= prevWeekMonday && k <= prevWeekSunday,
      );
      if (prevEntries.length > 0) {
        let totalSlots = 0, aiSlots = 0, sbSlots = 0, noTagSlots = 0;
        for (const [, v] of prevEntries) {
          const td = v as TagData;
          totalSlots += td.total;
          aiSlots += td.aiUsage;
          sbSlots += td.secondBrain;
          noTagSlots += td.noTags;
        }
        if (totalSlots > 0) {
          const tagged = totalSlots - noTagSlots;
          const aiPct = tagged > 0 ? Math.round((aiSlots / tagged) * 100) : 0;
          const brainliftHours = sbSlots * 10 / 60;
          loadWeeklyHistory().then(history => {
            const existing = history.find(s => s.weekStart === prevWeekMonday);
            if (!existing || existing.aiPct === 0) {
              return saveWeeklyHistory(
                mergeWeeklySnapshot(history, { weekStart: prevWeekMonday, aiPct, brainliftHours }),
              );
            }
          }).catch(() => {});
        }
      }

      // Prune to current week
      const lastFetchedAtVal = (rawCache._lastFetchedAt as string | undefined) ?? null;
      const weekCache: Record<string, TagData> = pruneToCurrentWeek(rawCache, today);

      // Set instant data from cache
      const instantData = aggregateAICache(weekCache, today);
      setData(instantData);
      setLastFetchedAt(lastFetchedAtVal);
      setIsLoading(false); // already have cache data

      // Determine which days need fetching
      const monday = getMondayOfWeek(today);
      const days = dateRange(monday, today);
      const daysToFetch = days.filter((date) => {
        const isToday = date === today;
        return forceRefetchToday
          ? isToday || shouldRefetchDay(date, weekCache[date], false)
          : shouldRefetchDay(date, weekCache[date], isToday);
      });

      if (daysToFetch.length === 0) {
        isFetchingRef.current = false;
        return;
      }

      setIsLoading(true);

      // Fetch stale/missing days in parallel
      const results = await Promise.all(
        daysToFetch.map(async (date) => {
          const slots = await fetchWorkDiary(
            config.assignmentId,
            date,
            credentials,
            config.useQA,
          );
          const tagData = countDiaryTags(slots);
          return { date, tagData, slots };
        }),
      );

      // Merge fresh data into week cache
      for (const { date, tagData } of results) {
        weekCache[date] = tagData;
      }

      // FR5 (11-app-data-layer): fire-and-forget app breakdown write.
      // Does not affect AI% state — failures are silently caught.
      const weekBreakdown = results.reduce<AppBreakdownEntry[]>(
        (acc, { slots }) => mergeAppBreakdown(acc, extractAppBreakdown(slots)),
        [],
      );
      loadAppHistory().then(hist => {
        const existing = hist[currentMonday] ?? [];
        return saveAppHistory({
          ...hist,
          [currentMonday]: mergeAppBreakdown(existing, weekBreakdown),
        });
      }).catch(() => {});

      // Save merged cache
      const newLastFetchedAt = new Date().toISOString();
      const toSave: AIRawCache = { ...weekCache, _lastFetchedAt: newLastFetchedAt };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(toSave));

      // Re-aggregate and update
      const freshData = aggregateAICache(weekCache, today);
      setData(freshData);
      setLastFetchedAt(newLastFetchedAt);
      setIsLoading(false);

      // Fallback: if previousWeekPercent is still undefined (first run / data wipe),
      // fetch last week's work diary to compute it. Fire-and-forget, silent failure.
      if (previousWeekPercent === undefined) {
        const prevMonday = addDays(getMondayOfWeek(today), -7);
        const prevSunday = addDays(getMondayOfWeek(today), -1);
        const prevDays = dateRange(prevMonday, prevSunday);
        Promise.all(
          prevDays.map(date =>
            fetchWorkDiary(config.assignmentId, date, credentials, config.useQA)
              .then(slots => countDiaryTags(slots))
              .catch(() => null),
          ),
        ).then(results => {
          let totalSlots = 0, aiSlots = 0, noTagSlots = 0;
          for (const td of results) {
            if (!td) continue;
            totalSlots += td.total;
            aiSlots += td.aiUsage;
            noTagSlots += td.noTags;
          }
          const tagged = totalSlots - noTagSlots;
          if (tagged > 0) {
            const pct = (aiSlots / tagged) * 100;
            AsyncStorage.setItem(PREV_WEEK_KEY, String(pct)).catch(() => {});
            setPreviousWeekPercent(pct);
          }
        }).catch(() => {});
      }

      // FR4 (06-ai-tab): On Monday, persist current week's midpoint AI% as the
      // previous week value so next week's delta badge has a reference point.
      // Guard: only write if there's real tagged data (taggedSlots > 0), so we don't
      // corrupt the previous week value with a zero from an empty Monday morning fetch.
      const isMonday = new Date().getUTCDay() === 1;
      if (isMonday && freshData.taggedSlots > 0) {
        const midpoint = (freshData.aiPctLow + freshData.aiPctHigh) / 2;
        AsyncStorage.setItem(PREV_WEEK_KEY, String(midpoint)).catch(() => {});
        setPreviousWeekPercent(midpoint);

        // FR4 (06-overview-history): flush AI%+BrainLift snapshot for the week just ended.
        // prevWeekStart = Monday 7 days before today (the week we are finishing).
        // Silent failure — does not affect AI data return value.
        try {
          const currentMonday = getMondayOfWeek(today);
          const d = new Date(currentMonday + 'T00:00:00');
          d.setDate(d.getDate() - 7);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const prevWeekStart = `${y}-${m}-${dd}`;

          loadWeeklyHistory()
            .then(history => {
              const updated = mergeWeeklySnapshot(history, {
                weekStart: prevWeekStart,
                aiPct: midpoint,
                brainliftHours: freshData.brainliftHours,
              });
              return saveWeeklyHistory(updated);
            })
            .catch(() => {
              // Silent failure
            });
        } catch {
          // Silent failure — synchronous date computation guard
        }
      }
    } catch (err) {
      setIsLoading(false);
      if (err instanceof AuthError) {
        setError('auth');
        setData(null); // Auth failure — cached data is likely wrong too, clear it
      } else if (err instanceof NetworkError) {
        setError('network');
        // Keep existing data — show stale cache rather than blank on network failure
      } else {
        setError('unknown');
        // Keep existing data — transient errors shouldn't wipe the display
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [config]);

  useEffect(() => {
    if (config) {
      void fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.assignmentId]);

  const refetch = useCallback(() => {
    void fetchData(true);
  }, [fetchData]);

  return { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent };
}
