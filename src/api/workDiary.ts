// FR6 (04-ai-brainlift): Work diary API call
// Uses assignmentId (NOT userId) — critical distinction per MEMORY.md

import { getAuthToken, apiGet } from './client';
import type { Credentials } from '../types/config';
import type { WorkDiarySlot } from '../types/api';

/**
 * Fetches work diary slots for a single day.
 *
 * @param assignmentId  assignment.id from config (e.g. "79996") — NOT userId
 * @param date          YYYY-MM-DD format (local timezone, no conversion)
 * @param credentials   username + password for Basic auth token fetch
 * @param useQA         toggles between QA and production base URL
 */
export async function fetchWorkDiary(
  assignmentId: string,
  date: string,
  credentials: Credentials,
  useQA: boolean,
): Promise<WorkDiarySlot[]> {
  const token = await getAuthToken(credentials.username, credentials.password, useQA);
  return apiGet<WorkDiarySlot[]>(
    '/api/timetracking/workdiaries',
    { assignmentId, date },
    token,
    useQA,
  );
}
