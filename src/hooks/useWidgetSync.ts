// FR5 (01-widget-activation): useWidgetSync — foreground widget update hook
//
// Fires updateWidgetData() whenever hoursData and config become non-null,
// keeping the home screen widget fresh on every app open.
//
// Errors are swallowed — widget sync failure must never crash or disrupt the UI.
//
// Extended in 08-widget-enhancements: optional approvalItems and myRequests params.

import { useEffect } from 'react';
import { updateWidgetData } from '../widgets/bridge';
import type { HoursData } from '../lib/hours';
import type { AIWeekData } from '../lib/ai';
import type { CrossoverConfig } from '../types/config';
import type { ApprovalItem } from '../lib/approvals';
import type { ManualRequestEntry } from '../types/requests';

/**
 * Foreground widget sync hook.
 * Call from (tabs)/_layout.tsx to keep widgets updated whenever the app is open.
 *
 * @param hoursData         Weekly hours/earnings data (null = still loading)
 * @param aiData            AI% and BrainLift data (null = unavailable, not blocking)
 * @param pendingCount      Pending approval count (legacy — now derived from approvalItems)
 * @param config            App configuration (null = still loading)
 * @param approvalItems     Manager's pending approval items (default [])
 * @param myRequests        Contributor's manual time requests (default [])
 * @param prevWeekSnapshot  Previous week snapshot for delta fields (not in deps — hoursData change sufficient)
 */
export function useWidgetSync(
  hoursData: HoursData | null,
  aiData: AIWeekData | null,
  pendingCount: number,
  config: CrossoverConfig | null,
  approvalItems?: ApprovalItem[],
  myRequests?: ManualRequestEntry[],
  prevWeekSnapshot?: { hours: number; earnings: number } | null,
): void {
  useEffect(() => {
    // Guard: only sync when we have the minimum required data
    if (hoursData === null || config === null) {
      return;
    }

    updateWidgetData(
      hoursData,
      aiData,
      pendingCount,
      config,
      approvalItems ?? [],
      myRequests ?? [],
      prevWeekSnapshot,
    ).catch((err: unknown) => {
      console.error('[useWidgetSync] Widget update failed:', err);
    });
  // approvalItems in deps: managers need re-sync when approvals change
  // aiData in deps: widget must update when AI% loads (loads async after hoursData)
  // myRequests intentionally omitted: contributor request changes don't need independent re-trigger
  // prevWeekSnapshot intentionally omitted: history changes don't need independent re-trigger;
  //   hoursData change is sufficient to pick up the latest snapshot value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursData, pendingCount, config, approvalItems, aiData]);
}
