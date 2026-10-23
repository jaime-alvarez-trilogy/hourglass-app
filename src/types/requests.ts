// FR1 (01-my-requests-data): Types for contributor manual time request visibility

/**
 * Status of a manual time request entry.
 * Mirrors the status field on WorkDiarySlot — same values.
 */
export type ManualRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * A single grouped manual time request entry.
 * Multiple 10-minute work diary slots with the same (date, memo) are grouped
 * into one entry — matching the user's mental model of a single submission.
 */
export interface ManualRequestEntry {
  /** Stable composite key "{date}|{memo}" — safe for use as FlatList keyExtractor */
  id: string;
  /** Submission date in YYYY-MM-DD format */
  date: string;
  /** Total duration in minutes (slot count × 10) */
  durationMinutes: number;
  /** Description the contributor entered when submitting */
  memo: string;
  /** Worst-case status across all grouped slots: REJECTED > PENDING > APPROVED */
  status: ManualRequestStatus;
  /** Manager's rejection comment, or null if not rejected / no comment provided */
  rejectionReason: string | null;
}

/**
 * Value cached by TanStack Query under ['myRequests', assignmentId] (durable-data 02).
 * A view derived from the my_requests_v1 store. A persisted 1.1/1.2.0 blob
 * (`{entries, error}`) still type-checks: every field after `error` is optional.
 */
export interface MyRequestsData {
  /** Stored days in retention plus view-only carry-forward, sorted by date descending */
  entries: ManualRequestEntry[];
  /** Always null from the store-backed queryFn; kept for legacy blobs */
  error: 'auth' | 'network' | null;
  /** Planned dates (YYYY-MM-DD, descending) whose fetch failed in the last run */
  staleDates?: string[];
  /** Latest fetchedAt (ISO-8601) within catchUpStart..today, or null if none */
  updatedAt?: string | null;
  /** `${assignmentId}|${'qa' | 'prod'}`, or 'dev-mock'. Undefined only on legacy blobs */
  ownerKey?: string;
}

/**
 * Return type of the useMyRequests hook.
 */
export interface UseMyRequestsResult {
  /** Stored manual time request entries (up to the retention window), sorted by date descending */
  entries: ManualRequestEntry[];
  /** True until there is something to show: the query's first load, the persister's cache
   *  restore, or config still loading with no data yet */
  isLoading: boolean;
  /** 'auth' for 401/403 errors, 'network' for connectivity errors, null if ok */
  error: 'auth' | 'network' | null;
  /** The thrown AuthError's errorCode (e.g. 'NO_CREDENTIALS') when `error` is 'auth', else null.
   *  Optional, so hand-built hook mocks still type-check */
  errorCode?: string | null;
  /** Forced refresh (pull-to-refresh / Retry): re-fetches the whole 3-week window. Returns the
   *  query's refetch promise; mocks may return nothing */
  refetch: () => Promise<unknown> | void;
  /** Dates whose last refresh failed (their stored record is shown) */
  staleDates?: string[];
  /** Latest successful fetch within the 3-week window, or null */
  updatedAt?: string | null;
}
