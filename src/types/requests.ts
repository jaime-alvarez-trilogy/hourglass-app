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
 * Return type of the useMyRequests hook.
 */
export interface UseMyRequestsResult {
  /** Manual time request entries for the current week, sorted by date descending */
  entries: ManualRequestEntry[];
  isLoading: boolean;
  /** 'auth' for 401/403 errors, 'network' for connectivity errors, null if ok */
  error: 'auth' | 'network' | null;
  /** Triggers a fresh fetch */
  refetch: () => void;
}
