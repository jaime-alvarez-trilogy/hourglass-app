// FR5: Auth API — profile fetch, ID extraction, config assembly
// 05-onboarding-defense FR2-FR4: defensive parsing for the pure-manager /detail
// schema (no top-level `assignment`) and the /assignments Spring page envelope.

import { getAuthToken, apiGet, mintAuthToken } from './client';
import { AuthError, NetworkError, NotContributorError } from './errors';
import type { CrossoverConfig } from '../types/config';

// --- Internal types ---

// 05-onboarding-defense FR2: `assignment` and `userAvatars` are optional.
// A pure-manager account (avatarTypes: ['MANAGER', 'COMPANY_ADMIN']) returns
// neither in the /detail response — see docs/api-samples/02-user-detail.json.
interface DetailResponse {
  fullName?: string;
  avatarTypes?: string[];
  assignment?: {
    id?: number;
    salary?: number;
    weeklyLimit?: number;
    team?: { id: number; name: string };
    manager?: { id: number };
    selection?: {
      marketplaceMember?: {
        application?: { candidate?: { id: number } };
      };
    };
  };
  userAvatars?: Array<{ type: string; id: number }>;
}

interface AssignmentItem {
  id?: number;
  team?: { id: number; name?: string };
  manager?: { id: number };
  candidate?: { id: number };
}

// 05-onboarding-defense FR3: /assignments returns a Spring page envelope.
interface AssignmentsPage {
  content?: AssignmentItem[];
}

type PartialConfig = Omit<CrossoverConfig, 'setupComplete' | 'setupDate'>;

// --- Public API ---

/** Fetch the current user's identity detail. Re-used by useRoleRefresh. */
export async function getProfileDetail(
  token: string,
  useQA: boolean,
): Promise<DetailResponse> {
  return apiGet<DetailResponse>(
    '/api/identity/users/current/detail',
    {},
    token,
    useQA,
  );
}

/** Format a Date as YYYY-MM-DD in local time (NOT toISOString — avoids UTC shift). */
function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract all CrossoverConfig fields from the detail response.
 *
 * Returns `null` when the response lacks the data needed to build a config:
 * either `assignment` is missing/invalid OR there's no CANDIDATE avatar AND
 * no nested candidate id. The caller falls back to /assignments. See
 * 05-onboarding-defense FR2.
 */
function extractConfigFromDetail(
  detail: DetailResponse,
  useQA: boolean,
): PartialConfig | null {
  const assignment = detail.assignment;
  if (!assignment || !assignment.id || !assignment.team || !assignment.manager) {
    return null;
  }

  const candidateAvatar = detail.userAvatars?.find((a) => a.type === 'CANDIDATE');
  const nestedCandidateId =
    assignment.selection?.marketplaceMember?.application?.candidate?.id;
  const userId = String(candidateAvatar?.id ?? nestedCandidateId ?? 0);

  return {
    userId,
    fullName: detail.fullName ?? '',
    managerId: String(assignment.manager.id),
    primaryTeamId: String(assignment.team.id),
    assignmentId: String(assignment.id),
    hourlyRate: assignment.salary ?? 0,
    weeklyLimit: assignment.weeklyLimit ?? 40,
    isManager: detail.avatarTypes?.includes('MANAGER') ?? false,
    teams: [
      {
        id: String(assignment.team.id),
        name: assignment.team.name,
        company: '',
      },
    ],
    useQA,
    lastRoleCheck: new Date().toISOString(),
    debugMode: false,
  };
}

/**
 * Build a partial config from a single AssignmentItem (used by the
 * /assignments fallback). Internal helper for fetchConfigFromAssignments.
 */
function configFromAssignmentItem(
  a: AssignmentItem,
  useQA: boolean,
  fullName: string,
): PartialConfig {
  return {
    userId: String(a.candidate?.id ?? 0),
    fullName,
    managerId: String(a.manager?.id ?? 0),
    primaryTeamId: String(a.team?.id ?? 0),
    assignmentId: String(a.id ?? 0),
    hourlyRate: 0,
    weeklyLimit: 40,
    isManager: false,
    teams: a.team
      ? [{ id: String(a.team.id), name: a.team.name ?? '', company: '' }]
      : [],
    useQA,
    lastRoleCheck: new Date().toISOString(),
    debugMode: false,
  };
}

/**
 * Fallback: fetch IDs from /api/v2/teams/assignments when /detail didn't yield
 * a usable assignment.
 *
 * Reads the Spring page envelope `{content: AssignmentItem[]}` and treats
 * `response.content[0]` as the assignment. Falls back to reading `response`
 * as a bare array for defense against shape drift. Returns `null` when no
 * assignment is present — caller throws NotContributorError. See
 * 05-onboarding-defense FR3.
 */
async function fetchConfigFromAssignments(
  token: string,
  useQA: boolean,
  username: string,
): Promise<PartialConfig | null> {
  const response = await apiGet<AssignmentsPage | AssignmentItem[] | null>(
    '/api/v2/teams/assignments',
    { avatarType: 'CANDIDATE', status: 'ACTIVE', page: '0' },
    token,
    useQA,
  );

  let list: AssignmentItem[] = [];
  if (response && typeof response === 'object') {
    const maybeContent = (response as AssignmentsPage).content;
    if (Array.isArray(maybeContent)) {
      list = maybeContent;
    } else if (Array.isArray(response)) {
      list = response;
    }
  }

  if (list.length === 0) {
    return null;
  }

  return configFromAssignmentItem(list[0], useQA, username);
}

/**
 * Full onboarding pipeline: token → detail (with /assignments fallback) →
 * payments → config. Returns a CrossoverConfig with setupComplete: false.
 *
 * Throws NotContributorError when neither /detail nor /assignments yields a
 * usable assignment (05-onboarding-defense FR4). AuthError/NetworkError from
 * the auth/detail steps propagate unchanged.
 */
export async function fetchAndBuildConfig(
  username: string,
  password: string,
  useQA: boolean,
): Promise<CrossoverConfig> {
  // Step 1: Auth
  const token = await getAuthToken(username, password, useQA);

  // Step 2: Try /detail. If it succeeds with usable data, use it. Otherwise
  // try /assignments. If neither yields an assignment, throw NotContributorError.
  let partial: PartialConfig | null = null;
  let avatarTypes: string[] = [];

  try {
    const detail = await getProfileDetail(token, useQA);
    avatarTypes = detail.avatarTypes ?? [];
    partial = extractConfigFromDetail(detail, useQA);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (err instanceof NetworkError) throw err;
    // ApiError or unknown: fall through to the /assignments fallback —
    // /detail could be down for reasons unrelated to the account shape.
    // avatarTypes stays [] since /detail never returned a readable body.
  }

  if (!partial) {
    try {
      partial = await fetchConfigFromAssignments(token, useQA, username);
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err instanceof NetworkError) throw err;
      // ApiError / unknown: leave partial null, fall through to terminal throw.
    }
  }

  if (!partial) {
    throw new NotContributorError(avatarTypes);
  }

  // Step 3: Payment history for hourly rate (try/catch — failure is non-fatal)
  let hourlyRate = partial.hourlyRate;
  if (!hourlyRate) {
    try {
      const to = localDateStr(new Date());
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 3);
      const from = localDateStr(fromDate);
      const payments = await apiGet<Array<{ amount: number; paidHours: number }>>(
        '/api/v3/users/current/payments',
        { from, to },
        token,
        useQA,
      );
      if (Array.isArray(payments)) {
        for (const p of payments) {
          if (p.paidHours > 0) {
            hourlyRate = Math.round(p.amount / p.paidHours);
            break;
          }
        }
      }
    } catch {
      hourlyRate = 0;
    }
  }

  const now = new Date().toISOString();
  return {
    ...partial,
    hourlyRate,
    setupComplete: false,
    setupDate: now,
  };
}

export type EnvProbeResult =
  | { type: 'prod_only' }
  | { type: 'qa_only' }
  | { type: 'both' }
  | { type: 'none' };

/**
 * Try authenticating against both prod and QA in parallel.
 * Returns which environments accepted the credentials.
 */
export async function probeEnvironments(
  username: string,
  password: string,
): Promise<EnvProbeResult> {
  // Spec 04 FR8: probe must bypass the cache (we don't yet know which env the
  // user will pick, and we want to verify both creds work, not return a stale
  // cached answer).
  const [prodResult, qaResult] = await Promise.allSettled([
    mintAuthToken(username, password, false),
    mintAuthToken(username, password, true),
  ]);

  const hasProd = prodResult.status === 'fulfilled';
  const hasQA = qaResult.status === 'fulfilled';

  if (hasProd && hasQA) return { type: 'both' };
  if (hasProd) return { type: 'prod_only' };
  if (hasQA) return { type: 'qa_only' };
  return { type: 'none' };
}
