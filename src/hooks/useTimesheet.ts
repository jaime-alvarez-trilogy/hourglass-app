// FR3: useTimesheet — React Query wrapper for timesheet API
//
// queryKey includes current week's Monday date so data auto-invalidates each Monday.
// staleTime: 15 minutes (matches widget refresh cycle).

import { useQuery } from '@tanstack/react-query';
import { fetchTimesheet } from '../api/timesheet';
import { getWeekStartDate } from '../lib/hours';
import { loadCredentials, getApiBase } from '../store/config';
import type { CrossoverConfig } from '../types/config';
import type { TimesheetResponse } from '../lib/hours';
import { getAuthToken } from '../api/client';

export function useTimesheet(config: CrossoverConfig | null) {
  const weekStart = getWeekStartDate(true);

  return useQuery<TimesheetResponse | null, Error>({
    queryKey: ['timesheet', weekStart, config?.userId],
    queryFn: async () => {
      if (!config) return null;
      const creds = await loadCredentials();
      if (!creds) throw new Error('No credentials');
      const token = await getAuthToken(creds.username, creds.password, config.useQA);
      return fetchTimesheet(config, token);
    },
    enabled: !!config,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 1,
  });
}
