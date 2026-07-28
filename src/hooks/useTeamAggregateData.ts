// FR1-FR5 (02-team-aggregate-hook): useTeamAggregateData hook
//
// Turns the current-week direct-report roster into team-wide hours/AI%/
// BrainLift totals plus a per-person breakdown. Mirrors useAIData's
// day-fan-out per report, but fans out across reports too (Promise.all),
// isolating per-report failures so one bad report never fails the whole
// query. AI% is slot-weighted: raw TagData counts are summed across
// successful reports BEFORE the percentage is computed — never averaged.

import { useQuery } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { useTeamRoster } from './useTeamRoster';
import { loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
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

interface MemberFetchResult {
  breakdown: TeamMemberBreakdown;
  cache: Record<string, TagData> | null; // null when the member's fetch failed
}

/**
 * Returns the TanStack Query queryFn for useTeamAggregateData. Exported
 * separately so it can be tested in isolation without renderHook, matching
 * the useMyRequests.ts convention.
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

          const timesheet = await fetchReportTimesheet(member, weekStartDate, token, config.useQA);
          const hours = extractPaidHours(timesheet);

          const aiData = aggregateAICache(memberCache, today);
          const aiPct = Math.round((aiData.aiPctLow + aiData.aiPctHigh) / 2);

          return {
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
            breakdown: {
              member,
              hours: 0,
              aiPct: 0,
              brainliftHours: 0,
              fetchFailed: true,
            },
            cache: null,
          };
        }
      }),
    );

    let weekHours = 0;
    let reportCount = 0;
    const teamCache: Record<string, TagData> = {};

    for (const { breakdown, cache } of memberResults) {
      if (breakdown.fetchFailed || !cache) continue;
      weekHours += breakdown.hours;
      reportCount++;
      for (const [date, tagData] of Object.entries(cache)) {
        teamCache[date] = sumTagData(teamCache[date] ?? zeroTagData(), tagData);
      }
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
 * Returns current-week team totals (paid hours, slot-weighted AI%, BrainLift
 * hours, successful report count) plus an ordered per-person breakdown, for
 * the authenticated manager's direct reports. Per-report failures (either
 * work-diary or timesheet) are isolated: excluded from all totals, retained
 * in `breakdown` with `fetchFailed: true`. Query key is scoped by team and
 * the current UTC Monday with a 24h staleTime — no custom refresh timers.
 */
export function useTeamAggregateData(): UseTeamAggregateDataResult {
  const { config } = useConfig();
  const { roster, isLoading: rosterLoading, error: rosterError } = useTeamRoster();
  const weekStartDate = getWeekStartDate(true);

  const query = useQuery<TeamAggregateData, Error>({
    queryKey: ['teamAggregate', config?.primaryTeamId, weekStartDate],
    queryFn: buildTeamAggregateQueryFn(config, roster),
    enabled: !!config && !rosterLoading && !rosterError,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return mapTeamAggregateState(
    { isLoading: rosterLoading, error: rosterError },
    { data: query.data, isLoading: query.isLoading, error: query.error },
  );
}
