/**
 * FR2 (01-widget-activation): fetchFreshData
 * Pure async function — no React. Used by the background push handler (handler.ts)
 * to fetch a fresh Crossover snapshot and write it to the widget store.
 *
 * Reads ai_cache from AsyncStorage (written by React hooks) but does NOT write back.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadConfig, loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
import { fetchTimesheet } from '../api/timesheet';
import { fetchPayments } from '../api/payments';
import { fetchWorkDiary } from '../api/workDiary';
import { fetchPendingManual, fetchPendingOvertime } from '../api/approvals';
import { calculateHours, getWeekStartDate } from './hours';
import { countDiaryTags, aggregateAICache } from './ai';
import { parseManualItems, parseOvertimeItems } from './approvals';
import type { ApprovalItem } from './approvals';
import type { ManualRequestEntry } from '../types/requests';
import type { HoursData } from './hours';
import type { AIWeekData, TagData } from './ai';
import type { CrossoverConfig } from '../types/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrossoverSnapshot {
  hoursData: HoursData;
  aiData: AIWeekData | null;
  pendingCount: number;      // pending approvals count; 0 for contributors
  config: CrossoverConfig;
  // 08-widget-enhancements: optional fields for widget action mode
  approvalItems?: ApprovalItem[];       // manager's pending items; undefined for contributors
  myRequests?: ManualRequestEntry[];    // contributor's requests; undefined in background path
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in local timezone (for work diary API) */
function getTodayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── fetchFreshData ────────────────────────────────────────────────────────────

/**
 * Fetch a fresh snapshot of Crossover data using on-device credentials.
 * Used by background push handler and foreground widget bridge.
 *
 * Throws if:
 * - loadConfig() returns null (not configured)
 * - loadCredentials() returns null (not authenticated)
 * - getAuthToken() fails (AuthError propagates up)
 *
 * Non-fatal (caught internally):
 * - fetchTimesheet / fetchPayments failures → calculateHours(null, null, ...)
 * - fetchWorkDiary failure → aiData: null
 * - AsyncStorage read failure → empty ai_cache
 * - fetchPendingManual / fetchPendingOvertime failures → pendingCount: 0
 */
export async function fetchFreshData(): Promise<CrossoverSnapshot> {
  // 1. Load config — throw if not configured
  const config = await loadConfig();
  if (!config) {
    throw new Error('fetchFreshData: config not available — app not configured');
  }

  // 2. Load credentials — throw if not authenticated
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error('fetchFreshData: credentials not available — user not authenticated');
  }

  // 3. Auth token
  const token = await getAuthToken(credentials.username, credentials.password, config.useQA);

  // 4. Week start for API calls (UTC-safe)
  const weekStart = getWeekStartDate(true);

  // 5. Parallel: timesheet + payments (each non-fatal on failure)
  const [timesheetData, paymentsData] = await Promise.all([
    fetchTimesheet(config, token).catch(() => null),
    fetchPayments(config, token).catch(() => null),
  ]);

  // 6. Compute hours (handles null inputs — returns zero-state)
  const hoursData = calculateHours(timesheetData, paymentsData, config.hourlyRate, config.weeklyLimit);

  // 7. AI data: read existing cache + fetch today fresh
  const today = getTodayLocal();

  // Read existing ai_cache (written by React hooks; non-fatal on failure)
  let existingCache: Record<string, TagData> = {};
  try {
    const raw = await AsyncStorage.getItem('ai_cache');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Filter out non-TagData entries (e.g. _lastFetchedAt string)
      existingCache = Object.fromEntries(
        Object.entries(parsed).filter(
          ([, v]) =>
            typeof v === 'object' &&
            v !== null &&
            'total' in v &&
            'aiUsage' in v
        )
      ) as Record<string, TagData>;
    }
  } catch {
    // Corrupt cache or AsyncStorage failure — use empty cache
  }

  // Fetch today's work diary fresh (non-fatal on failure)
  let aiData: AIWeekData | null = null;
  const slots = await fetchWorkDiary(config.assignmentId, today, credentials, config.useQA).catch(
    () => null
  );

  if (slots !== null) {
    const todayTags = countDiaryTags(slots);
    const mergedCache: Record<string, TagData> = { ...existingCache, [today]: todayTags };
    aiData = aggregateAICache(mergedCache, today);
  }

  // 8. Approval count (manager only)
  let pendingCount = 0;
  let approvalItems: ApprovalItem[] | undefined;

  if (config.isManager) {
    const [rawManual, rawOvertime] = await Promise.all([
      fetchPendingManual(token, config.useQA, weekStart).catch(() => null),
      fetchPendingOvertime(token, config.useQA, weekStart).catch(() => null),
    ]);

    const manualItems = rawManual ? parseManualItems(rawManual, weekStart) : [];
    const overtimeItems = rawOvertime ? parseOvertimeItems(rawOvertime) : [];
    pendingCount = manualItems.length + overtimeItems.length;
    // 08-widget-enhancements: include items in snapshot for widget action mode
    approvalItems = [...manualItems, ...overtimeItems];
  }

  // 9. Return snapshot
  // myRequests is not populated in the background path (foreground-only in v1)
  return { hoursData, aiData, pendingCount, config, approvalItems };
}
