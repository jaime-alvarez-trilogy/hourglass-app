// FR3: usePayments — React Query wrapper for payments API
//
// queryKey includes current week's Monday date so data auto-invalidates each Monday.
// staleTime: 15 minutes (matches widget refresh cycle).

import { useQuery } from '@tanstack/react-query';
import { fetchPayments } from '../api/payments';
import { getWeekStartDate } from '../lib/hours';
import { loadCredentials } from '../store/config';
import type { CrossoverConfig } from '../types/config';
import type { PaymentsResponse } from '../lib/hours';
import { getAuthToken } from '../api/client';

export function usePayments(config: CrossoverConfig | null) {
  const weekStart = getWeekStartDate(true);

  return useQuery<PaymentsResponse | null, Error>({
    queryKey: ['payments', weekStart, config?.userId],
    queryFn: async () => {
      if (!config) return null;
      const creds = await loadCredentials();
      if (!creds) throw new Error('No credentials');
      const token = await getAuthToken(creds.username, creds.password, config.useQA);
      return fetchPayments(config, token);
    },
    enabled: !!config,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 1,
  });
}
