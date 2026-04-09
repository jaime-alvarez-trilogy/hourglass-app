// FR3: useHoursData — Composed hook: merges timesheet + payments queries + cache failover
//
// On success: writes HoursData to AsyncStorage 'hours_cache' with cachedAt timestamp.
// On total failure: reads 'hours_cache' from AsyncStorage; returns isStale=true.

import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTimesheet } from './useTimesheet';
import { usePayments } from './usePayments';
import { calculateHours } from '../lib/hours';
import { useConfig } from './useConfig';
import type { HoursData } from '../lib/hours';

const CACHE_KEY = 'hours_cache';

interface CachedHours {
  data: HoursData;
  cachedAt: string; // ISO timestamp
}

export interface UseHoursDataResult {
  data: HoursData | null;
  isLoading: boolean;
  isStale: boolean;      // true when serving cached data
  cachedAt: string | null;
  error: string | null;
  refetch: () => void;
}

export function useHoursData(): UseHoursDataResult {
  const { config } = useConfig();
  const [cache, setCache] = useState<CachedHours | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  const timesheetQuery = useTimesheet(config);
  const paymentsQuery = usePayments(config);

  // Load cache on mount
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setCache(JSON.parse(raw) as CachedHours);
          } catch {
            // corrupt cache — ignore
          }
        }
      })
      .finally(() => setCacheLoaded(true));
  }, []);

  // Write to cache on successful fetch
  useEffect(() => {
    if (
      timesheetQuery.data !== undefined &&
      paymentsQuery.data !== undefined &&
      !timesheetQuery.isError &&
      !paymentsQuery.isError &&
      config
    ) {
      const hourlyRate = config.hourlyRate ?? 0;
      const weeklyLimit = config.weeklyLimit ?? 40;
      const computed = calculateHours(
        timesheetQuery.data,
        paymentsQuery.data,
        hourlyRate,
        weeklyLimit
      );
      const entry: CachedHours = {
        data: computed,
        cachedAt: new Date().toISOString(),
      };
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry)).catch(() => {});
      setCache(entry);
    }
  }, [
    timesheetQuery.data,
    paymentsQuery.data,
    timesheetQuery.isError,
    paymentsQuery.isError,
    config,
  ]);

  const bothError = timesheetQuery.isError && paymentsQuery.isError;
  const eitherLoading = timesheetQuery.isLoading || paymentsQuery.isLoading;
  const hasLiveData =
    timesheetQuery.data !== undefined && paymentsQuery.data !== undefined && !bothError;

  const refetch = () => {
    timesheetQuery.refetch();
    paymentsQuery.refetch();
  };

  // Memoize to prevent new object reference on every render — useWidgetSync
  // has hoursData in its deps, so an unstable reference would fire the effect
  // on every re-render and write to AsyncStorage in a tight loop.
  const liveData = useMemo(() => {
    if (!hasLiveData || !config) return null;
    const hourlyRate = config.hourlyRate ?? 0;
    const weeklyLimit = config.weeklyLimit ?? 40;
    return calculateHours(
      timesheetQuery.data!,
      paymentsQuery.data!,
      hourlyRate,
      weeklyLimit,
    );
  }, [timesheetQuery.data, paymentsQuery.data, config, hasLiveData]);

  // Serving from live data
  if (hasLiveData && config) {
    return {
      data: liveData,
      isLoading: false,
      isStale: false,
      cachedAt: null,
      error: null,
      refetch,
    };
  }

  // Total failure — serve from cache
  if (bothError && cache) {
    return {
      data: cache.data,
      isLoading: false,
      isStale: true,
      cachedAt: cache.cachedAt,
      error: null,
      refetch,
    };
  }

  // Still loading (no data yet)
  if (eitherLoading || !cacheLoaded) {
    return {
      data: null,
      isLoading: true,
      isStale: false,
      cachedAt: null,
      error: null,
      refetch,
    };
  }

  // Error with no cache
  if (bothError) {
    const errorMsg =
      (timesheetQuery.error as Error)?.message ||
      (paymentsQuery.error as Error)?.message ||
      'Failed to load hours data';
    return {
      data: null,
      isLoading: false,
      isStale: false,
      cachedAt: null,
      error: errorMsg,
      refetch,
    };
  }

  // No config yet
  return {
    data: null,
    isLoading: true,
    isStale: false,
    cachedAt: null,
    error: null,
    refetch,
  };
}
