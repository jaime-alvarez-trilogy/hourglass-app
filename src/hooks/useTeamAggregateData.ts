// FR1-FR5 (02-team-aggregate-hook): useTeamAggregateData hook
//
// Turns the current-week direct-report roster into team-wide hours/AI%/
// BrainLift totals plus a per-person breakdown. Mirrors useAIData's
// day-fan-out per report, but fans out across reports too (Promise.all),
// isolating per-report failures so one bad report never fails the whole
// query. AI% is slot-weighted: raw TagData counts are summed across
// successful reports BEFORE the percentage is computed — never averaged.
//
// durable-data 03-keep-last-good FR3: when the roster is non-empty and EVERY
// report failed, the queryFn throws (the first failed member's error, in
// roster order) instead of resolving zeros, so TanStack keeps the last good
// totals. An empty roster still resolves zeros; a partial failure is unchanged.

import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { useTeamRoster } from './useTeamRoster';
import { loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { NetworkError, shouldRetryOnce } from '../api/errors';
import { fetchWorkDiary } from '../api/workDiary';
import { fetchReportTimesheet } from '../api/team';
import { countDiaryTags, aggregateAICache } from '../lib/ai';
import type { TagData } from '../lib/ai';
import { getWeekStartDate } from '../lib/hours';
import type { TimesheetResponse } from '../lib/hours';
import { log } from '../lib/log';
import type { TeamMember } from '../types/api';
import type { CrossoverConfig } from '../types/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberBreakdown {
  member: TeamMember;
  hours: number;
  aiPct: number;
  brainliftHours: number;
  fetchFailed: boolean;
}

export interface TeamAggregateData {
  weekHours: number;
  weekAiPct: number;
  weekBrainliftHours: number;
  reportCount: number;
  breakdown: TeamMemberBreakdown[];
}

export interface UseTeamAggregateDataResult {
  data: TeamAggregateData | null;
  isLoading: boolean;
  error: string | null;
}

// ─── Date helpers (mirrors useAIData.ts) ──────────────────────────────────────

/** Returns YYYY-MM-DD for today in UTC — must match the UTC-safe Monday helper. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the Monday (YYYY-MM-DD, UTC) of the week containing `todayStr`.
 * Same algorithm as getWeekStartDate(true) in src/lib/hours.ts, but
 * parameterized by an explicit date instead of always reading real "now" —
 * this keeps the queryFn's week boundary testable via todayOverride while
 * matching production behavior when today = todayUTC().
 */
function getMondayOfWeekUTC(todayStr: string): string {
  const d = new Date(todayStr + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayUTC = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysToMonday,
  );
  return new Date(mondayUTC).toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ─── Hours extraction ──────────────────────────────────────────────────────────

/**
 * Reads paid weekly hours from a report's timesheet response. A null
 * timesheet (no record) is a valid empty result, not a failure — contributes
 * zero hours. Mirrors calculateHours' timesheet-only fallback (no per-report
 * payments-API call is made, so there is no paidHours/workedHours source).
 */
function extractPaidHours(timesheet: TimesheetResponse | null): number {
  if (!timesheet) return 0;
  return Number(timesheet.totalHours ?? timesheet.hourWorked ?? 0);
}

function zeroTagData(): TagData {
  return { total: 0, aiUsage: 0, secondBrain: 0, noTags: 0 };
}

function sumTagData(a: TagData, b: TagData): TagData {
  return {
    total: a.total + b.total,
    aiUsage: a.aiUsage + b.aiUsage,
    secondBrain: a.secondBrain + b.secondBrain,
    noTags: a.noTags + b.noTags,
  };
}

// ─── Query function (exported for testing) ───────────────────────────────────

// Discriminated on `failed` so a failed member can never carry a cache and a
// successful one can never carry an error. `error` is whatever was caught, which
// may itself be undefined/null (hence the NetworkError fallback at the throw site).
type MemberFetchResult =
  | { failed: false; breakdown: TeamMemberBreakdown; cache: Record<string, TagData> }
  | { failed: true; breakdown: TeamMemberBreakdown; error: unknown };

/**
 * Returns the TanStack Query queryFn for useTeamAggregateData. Exported
 * separately so it can be tested in isolation without renderHook, matching
 * the useMyRequests.ts convention.
 *
 * Rejects when the roster is non-empty and no report succeeded, with the first
 * failed member's error in roster order (or a NetworkError when that error is
 * undefined/null), so a total failure never resolves as zero-valued totals.
 *
 * @param todayOverride  Inject today's date (YYYY-MM-DD) for testing.
 */
export function buildTeamAggregateQueryFn(
  config: CrossoverConfig | null,
  roster: TeamMember[],
  todayOverride?: string,
): () => Promise<TeamAggregateData> {
  return async () => {
    if (!config) {
      throw new Error('Missing config — cannot fetch team aggregate data');
    }

    const credentials = await loadCredentials();
    if (!credentials) {
      throw new Error('Missing credentials — cannot fetch team aggregate data');
    }

    const token = await getAuthToken(credentials.username, credentials.password, config.useQA);
    // The manager's own creds: a renewal re-mints the manager's token, not a report's.
    const creds = toAuthCreds(credentials, config.useQA);

    const today = todayOverride ?? todayUTC();
    const weekStartDate = getMondayOfWeekUTC(today);
    const days = dateRange(weekStartDate, today);

    const memberResults: MemberFetchResult[] = await Promise.all(
      roster.map(async (member): Promise<MemberFetchResult> => {
        try {
          const dayResults = await Promise.all(
            days.map(async (date) => {
              const slots = await fetchWorkDiary(member.assignmentId, date, credentials, config.useQA);
              return { date, tagData: countDiaryTags(slots) };
            }),
          );

          const memberCache: Record<string, TagData> = {};
          for (const { date, tagData } of dayResults) {
            memberCache[date] = tagData;
          }

          const timesheet = await fetchReportTimesheet(member, weekStartDate, token, config.useQA, creds);
          const hours = extractPaidHours(timesheet);

          const aiData = aggregateAICache(memberCache, today);
          const aiPct = Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2);

          return {
            failed: false,
            breakdown: {
              member,
              hours,
              aiPct,
              brainliftHours: aiData.brainliftHours,
              fetchFailed: false,
            },
            cache: memberCache,
          };
        } catch (err) {
          log.error(
            'teamAggregate.member-fetch-failed',
            err instanceof Error ? err : String(err),
            { assignmentId: member.assignmentId },
          );
          return {
            failed: true,
            breakdown: {
              member,
              hours: 0,
              aiPct: 0,
              brainliftHours: 0,
              fetchFailed: true,
            },
            error: err,
          };
        }
      }),
    );

    let weekHours = 0;
    let reportCount = 0;
    const teamCache: Record<string, TagData> = {};

    for (const result of memberResults) {
      if (result.failed) continue;
      weekHours += result.breakdown.hours;
      reportCount++;
      for (const [date, tagData] of Object.entries(result.cache)) {
        teamCache[date] = sumTagData(teamCache[date] ?? zeroTagData(), tagData);
      }
    }

    // Every report failed: throw so TanStack keeps the last good totals. The real
    // error (e.g. an AuthError) is rethrown unwrapped so the retry rule sees it.
    if (roster.length > 0 && reportCount === 0) {
      throw (
        memberResults.find((r) => r.failed)?.error ??
        new NetworkError('All team member fetches failed')
      );
    }

    const teamAggregate = aggregateAICache(teamCache, today);
    const weekAiPct = Math.round((teamAggregate.aiPctLow + teamAggregate.aiPctHigh) / 2);

    return {
      weekHours,
      weekAiPct,
      weekBrainliftHours: teamAggregate.brainliftHours,
      reportCount,
      breakdown: memberResults.map((r) => r.breakdown),
    };
  };
}

// ─── State mapping (exported for testing) ────────────────────────────────────

interface RosterState {
  isLoading: boolean;
  error: string | null;
}

interface QueryState {
  data: TeamAggregateData | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Merges useTeamRoster's and the aggregate query's independent loading/error
 * states into UseTeamAggregateDataResult. Roster problems take precedence —
 * fan-out cannot start without a roster — and either source's error message
 * surfaces before falling back to `null`. Exported separately so this merge
 * logic is directly testable without renderHook.
 */
export function mapTeamAggregateState(
  roster: RosterState,
  query: QueryState,
): UseTeamAggregateDataResult {
  return {
    data: query.data ?? null,
    isLoading: roster.isLoading || query.isLoading,
    error: roster.error ?? (query.error ? query.error.message : null),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * The aggregate's query key: primaryTeamId, the UTC Monday, the environment and
 * the roster the totals are built from (its sorted assignmentIds). The roster is
 * its own query and refetches on its own (environment switch, direct-reports
 * refresh), but a new queryFn alone never refetches: under a key without it, a
 * fresh aggregate of an older roster (1.1's first 10 rows, restored from the
 * persisted cache) was kept for the 24h staleTime. Sorted, so the same
 * assignments in another order keep their cached totals.
 */
export function teamAggregateQueryKey(
  config: Pick<CrossoverConfig, 'primaryTeamId' | 'useQA'> | null | undefined,
  weekStartDate: string,
  roster: readonly TeamMember[],
) {
  const rosterKey = roster.map((m) => m.assignmentId).sort().join(',');
  return [
    'teamAggregate',
    config?.primaryTeamId,
    weekStartDate,
    config?.useQA ? 'qa' : 'prod',
    rosterKey,
  ] as const;
}

/**
 * Returns current-week team totals (paid hours, slot-weighted AI%, BrainLift
 * hours, successful report count) plus an ordered per-person breakdown, for
 * the authenticated manager's direct reports. Per-report failures (either
 * work-diary or timesheet) are isolated: excluded from all totals, retained
 * in `breakdown` with `fetchFailed: true`. When every report fails the query
 * errors and keeps the last good `data` (durable-data 03 FR3). Query key is
 * scoped by team, the current UTC Monday, the environment and the roster
 * (teamAggregateQueryKey) with a 24h staleTime — no custom refresh timers.
 */
export function useTeamAggregateData(): UseTeamAggregateDataResult {
  const { config } = useConfig();
  const { roster, isLoading: rosterLoading, error: rosterError } = useTeamRoster();
  const weekStartDate = getWeekStartDate(true);

  const query = useQuery<TeamAggregateData, Error>({
    queryKey: teamAggregateQueryKey(config, weekStartDate, roster),
    queryFn: buildTeamAggregateQueryFn(config, roster),
    enabled: !!config && !rosterLoading && !rosterError,
    staleTime: 24 * 60 * 60 * 1000,
    retry: shouldRetryOnce, // one retry, outages only (never a credential failure)
  });

  return mapTeamAggregateState(
    { isLoading: rosterLoading, error: rosterError },
    { data: query.data, isLoading: query.isLoading, error: query.error },
  );
}
