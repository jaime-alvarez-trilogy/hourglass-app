// usePayDays — 1.2 WorkSmart dashboard parity: React Query wrapper for the contributor's
// pay-day cards (GET /api/v3/users/current/pay-days).
//
// The server picks the cards (last paid, next pay day, this week's so far) and the app
// shows them as they come. The key carries userId + env. 30-minute staleTime: the cards
// change at most a few times a week, and "so far" follows the hours overview closely
// enough at this cadence.

import { useQuery } from '@tanstack/react-query';
import { fetchPayDays } from '../api/hoursOverview';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { shouldRetryOnce } from '../api/errors';
import { loadCredentials } from '../store/config';
import type { PayDays } from '../lib/hoursOverview';
import type { CrossoverConfig } from '../types/config';

export const PAY_DAYS_STALE_MS = 30 * 60 * 1000;

/**
 * The contributor's pay-day cards. Disabled until config has a userId. On error the
 * caller hides the section (a manager account may not have pay days).
 */
export function usePayDays(config: CrossoverConfig | null) {
  const useQA = config?.useQA === true;
  return useQuery<PayDays, Error>({
    queryKey: ['payDays', config?.userId ?? null, useQA ? 'qa' : 'prod'],
    queryFn: async () => {
      const creds = await loadCredentials();
      if (!creds) throw new Error('No credentials');
      const token = await getAuthToken(creds.username, creds.password, useQA);
      return fetchPayDays(token, useQA, toAuthCreds(creds, useQA));
    },
    enabled: !!config?.userId,
    staleTime: PAY_DAYS_STALE_MS,
    retry: shouldRetryOnce,
  });
}
