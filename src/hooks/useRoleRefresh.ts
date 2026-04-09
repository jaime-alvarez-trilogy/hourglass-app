// FR10: useRoleRefresh — background weekly role refresh

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getProfileDetail } from '../api/auth';
import { getAuthToken } from '../api/client';
import { loadConfig, loadCredentials, saveConfig } from '../store/config';
import type { CrossoverConfig, Credentials } from '../types/config';

/**
 * Pure guard: should the role refresh run?
 * Exported for unit testing.
 */
export function shouldRunRoleRefresh(
  lastRoleCheck: string | undefined,
  now: Date = new Date(),
): boolean {
  if (now.getDay() !== 1) return false; // Not Monday
  if (!lastRoleCheck) return true; // Absent = overdue
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(lastRoleCheck).getTime() > sevenDays;
}

/**
 * Performs the actual role refresh.
 * Exported for unit testing.
 * Silently swallows errors — stale role data is better than a crash.
 */
export async function runRoleRefresh(
  queryClient: ReturnType<typeof useQueryClient>,
  config: CrossoverConfig,
  credentials: Credentials | null,
): Promise<void> {
  if (!credentials) return;

  try {
    const token = await getAuthToken(
      credentials.username,
      credentials.password,
      config.useQA,
    );
    const detail = await getProfileDetail(token, config.useQA);

    const updatedConfig: CrossoverConfig = {
      ...config,
      isManager: detail.avatarTypes.includes('MANAGER'),
      hourlyRate: detail.assignment.salary ?? config.hourlyRate,
      weeklyLimit: detail.assignment.weeklyLimit ?? config.weeklyLimit,
      teams: [
        {
          id: String(detail.assignment.team.id),
          name: detail.assignment.team.name,
          company: '',
        },
      ],
      lastRoleCheck: new Date().toISOString(),
    };

    await saveConfig(updatedConfig);
    queryClient.invalidateQueries({ queryKey: ['config'] });
  } catch {
    // Silently swallow — do NOT update lastRoleCheck on failure
    // Retry will happen on the next eligible Monday foreground event
  }
}

/** Hook: called from root layout on every app foreground event. */
export function useRoleRefresh(): void {
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);

  useEffect(() => {
    const handler = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (inFlightRef.current) return;

      const [config, credentials] = await Promise.all([
        loadConfig(),
        loadCredentials(),
      ]);

      if (!config || !credentials) return;
      if (!shouldRunRoleRefresh(config.lastRoleCheck)) return;

      inFlightRef.current = true;
      try {
        await runRoleRefresh(queryClient, config, credentials);
      } finally {
        inFlightRef.current = false;
      }
    };

    const subscription = AppState.addEventListener('change', handler);
    return () => subscription.remove();
  }, [queryClient]);
}
