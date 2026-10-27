// Prerequisite for 02-team-aggregate-hook: useTeamAggregateData's spec.md and
// checklist.md both reference `useTeamRoster` as an existing dependency (and
// FEATURE.md's "Intended final state" #2 describes it as delivered), but
// 01-team-roster-api's spec.md explicitly deferred hook-building to this spec,
// and no prior spec's file list ever created it. Built here as the minimal
// hook needed to unblock useTeamAggregateData.
//
// The roster is every ACTIVE assignment the manager manages, across all
// teams, from one paged fetchManagedAssignments() call. It used to fan out
// fetchMyTeams() -> fetchTeamRoster() per team, which lost reports three
// ways (QA probes, 2026-10-27): the assignments endpoint pages at 10 rows and
// was never paged, so teams over 10 people lost the rest; /api/v2/teams omits
// teams the manager has reports on but does not own (8 of a manager's 17
// reports found); and it lists every company team (300+ requests) for an
// admin-type manager. Rows are per assignment, unique by assignmentId: one
// person on two teams is two rows, and a manager who is their own manager is
// on it (directReports() in src/lib/autoApprove.ts drops both repeats and self).

import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { fetchManagedAssignments } from '../api/team';
import type { TeamMember } from '../types/api';
import type { CrossoverConfig } from '../types/config';

export interface UseTeamRosterResult {
  roster: TeamMember[];
  isLoading: boolean;
  error: string | null;
}

/**
 * The roster's query key: a version, primaryTeamId and the environment.
 *   - 'v2' is the paged fetchManagedAssignments roster. A roster cached (and persisted) by
 *     an earlier build, cut off at 10 rows per team and without userId on its rows, sits
 *     under the unversioned key and is never read again.
 *   - app/modal.tsx invalidates every query in the same step as it switches QA <-> prod,
 *     before any re-render, so the active roster query refetches with the old config's
 *     queryFn. Under one key for both environments, that roster would then be taken for
 *     the new environment's (for 24h).
 */
export function teamRosterQueryKey(
  config: Pick<CrossoverConfig, 'primaryTeamId' | 'useQA'> | null | undefined,
) {
  return ['teamRoster', 'v2', config?.primaryTeamId, config?.useQA ? 'qa' : 'prod'] as const;
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
    const creds = toAuthCreds(credentials, config.useQA);
    return fetchManagedAssignments(token, config.useQA, creds);
  };
}

/**
 * Returns the direct-report roster across every team the authenticated
 * manager manages, from one paged fetchManagedAssignments() call (no
 * per-team fan-out). queryKey is scoped by primaryTeamId and the environment
 * (teamRosterQueryKey); staleTime matches useConfig's effectively-static
 * caching intent for roster membership (24h — roster changes are infrequent).
 */
export function useTeamRoster(): UseTeamRosterResult {
  const { config } = useConfig();

  const { data, isLoading, error } = useQuery({
    queryKey: teamRosterQueryKey(config),
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
