// FR9: useConfig — React Query wrapper for loadConfig()

import { useQuery } from '@tanstack/react-query';
import { loadConfig } from '../store/config';
import type { CrossoverConfig } from '../types/config';

/**
 * Returns the persisted CrossoverConfig from AsyncStorage via loadConfig().
 * Uses queryKey ['config'] with staleTime Infinity — callers must invalidate
 * manually after mutating config (e.g. saveConfig followed by refetch).
 */
export function useConfig(): {
  config: CrossoverConfig | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: loadConfig,
    staleTime: Infinity, // Callers invalidate manually after config mutations
    retry: false,
  });

  return {
    config: data ?? null,
    isLoading,
    refetch,
  };
}
