// FR5: Auth API — profile fetch, ID extraction, config assembly

import { getAuthToken, apiGet } from './client';
import { AuthError } from './errors';
import type { CrossoverConfig } from '../types/config';

// --- Internal types ---

interface DetailResponse {
  fullName: string;
  avatarTypes: string[];
  assignment: {
    id: number;
    salary: number;
    weeklyLimit?: number;
    team: { id: number; name: string };
    manager: { id: number };
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

/** Extract all CrossoverConfig fields from the detail response. */
function extractConfigFromDetail(
  detail: DetailResponse,
  useQA: boolean,
): Omit<CrossoverConfig, 'setupComplete' | 'setupDate'> {
  const candidateAvatar = detail.userAvatars?.find(
    (a) => a.type === 'CANDIDATE',
  );
  const nestedCandidateId =
    detail.assignment.selection?.marketplaceMember?.application?.candidate?.id;
  const userId = String(candidateAvatar?.id ?? nestedCandidateId ?? 0);

  return {
    userId,
    fullName: detail.fullName,
    managerId: String(detail.assignment.manager.id),
    primaryTeamId: String(detail.assignment.team.id),
    assignmentId: String(detail.assignment.id),
    hourlyRate: detail.assignment.salary ?? 0,
    weeklyLimit: detail.assignment.weeklyLimit ?? 40,
    isManager: detail.avatarTypes.includes('MANAGER'),
    teams: [
      {
        id: String(detail.assignment.team.id),
        name: detail.assignment.team.name,
        company: '',
      },
    ],
    useQA,
    lastRoleCheck: new Date().toISOString(),
    debugMode: false,
  };
}

/**
 * Fallback: fetch IDs from assignments API when detail endpoint fails.
 * Mirrors the old widget's fallback strategy.
 */
async function fetchConfigFromAssignments(
  token: string,
  useQA: boolean,
  username: string,
): Promise<Omit<CrossoverConfig, 'setupComplete' | 'setupDate'>> {
  const assignments = await apiGet<AssignmentItem[]>(
    '/api/v2/teams/assignments',
    { avatarType: 'CANDIDATE', status: 'ACTIVE', page: '0' },
    token,
    useQA,
  );

  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new Error('No active assignment found');
  }

  const a = assignments[0];
  return {
    userId: String(a.candidate?.id ?? 0),
    fullName: username,
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
 * Full onboarding pipeline: token → detail (with assignments fallback) → payments → config.
 * Returns a CrossoverConfig with setupComplete: false.
 */
export async function fetchAndBuildConfig(
  username: string,
  password: string,
  useQA: boolean,
): Promise<CrossoverConfig> {
  // Step 1: Auth
  const token = await getAuthToken(username, password, useQA);

  // Extract userId from token string — token format is "userId:secret" (after JSON unwrapping in client.ts)
  const tokenUserId = String(parseInt(token.split(':')[0], 10) || 0);

  // Step 3: Try detail endpoint to enrich with candidate ID, team, manager
  let partial: Omit<CrossoverConfig, 'setupComplete' | 'setupDate'>;
  try {
    const detail = await getProfileDetail(token, useQA);
    partial = extractConfigFromDetail(detail, useQA);
    if (partial.userId === '0') partial = { ...partial, userId: tokenUserId };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    try {
      partial = await fetchConfigFromAssignments(token, useQA, username);
      if (partial.userId === '0') partial = { ...partial, userId: tokenUserId };
    } catch {
      // Last resort: token userId — timesheet strategy 3 (userId-only) still works
      const now = new Date().toISOString();
      partial = {
        userId: tokenUserId,
        fullName: username,
        managerId: '0',
        primaryTeamId: '0',
        assignmentId: '0',
        hourlyRate: 0,
        weeklyLimit: 40,
        isManager: false,
        teams: [],
        useQA,
        lastRoleCheck: now,
        debugMode: false,
      };
    }
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
  const [prodResult, qaResult] = await Promise.allSettled([
    getAuthToken(username, password, false),
    getAuthToken(username, password, true),
  ]);

  const hasProd = prodResult.status === 'fulfilled';
  const hasQA = qaResult.status === 'fulfilled';

  if (hasProd && hasQA) return { type: 'both' };
  if (hasProd) return { type: 'prod_only' };
  if (hasQA) return { type: 'qa_only' };
  return { type: 'none' };
}
