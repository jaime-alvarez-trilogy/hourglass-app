// Prerequisite for 02-team-aggregate-hook: useTeamAggregateData's spec.md and
// checklist.md both reference `useTeamRoster` as an existing dependency (and
// FEATURE.md's "Intended final state" #2 describes it as delivered), but
// 01-team-roster-api's spec.md explicitly deferred hook-building to this spec,
// and no prior spec's file list ever created it. Built here as the minimal
// hook needed to unblock useTeamAggregateData: fans out fetchMyTeams() ->
// fetchTeamRoster() per team id and flattens the result.

import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
import { fetchMyTeams, fetchTeamRoster } from '../api/team';
import type { TeamMember } from '../types/api';

export interface UseTeamRosterResult {
  roster: TeamMember[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Returns the TanStack Query queryFn for useTeamRoster. Exported separately
 * so it can be tested in isolation without renderHook, matching the
 * useMyRequests.ts convention.
 */
export function buildTeamRosterQueryFn(
  config: { useQA: boolean } | null,
): () => Promise<TeamMember[]> {
  return async () => {
    const credentials = await loadCredentials();
    if (!credentials || !config) {
      throw new Error('Missing credentials or config');
    }
    const token = await getAuthToken(credentials.username, credentials.password, config.useQA);
    const teams = await fetchMyTeams(token, config.useQA);
    const rosters = await Promise.all(
      teams.map((team) => fetchTeamRoster(String(team.id), token, config.useQA)),
    );
    return rosters.flat();
  };
}

/**
 * Returns the direct-report roster across every team the authenticated
 * manager owns, by calling fetchMyTeams() then fanning out fetchTeamRoster()
 * per team id in parallel and flattening the result. queryKey is scoped by
 * primaryTeamId; staleTime matches useConfig's effectively-static caching
 * intent for roster membership (24h — roster changes are infrequent).
 */
export function useTeamRoster(): UseTeamRosterResult {
  const { config } = useConfig();

  const { data, isLoading, error } = useQuery({
    queryKey: ['teamRoster', config?.primaryTeamId],
    queryFn: buildTeamRosterQueryFn(config),
    enabled: !!config,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    roster: data ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
