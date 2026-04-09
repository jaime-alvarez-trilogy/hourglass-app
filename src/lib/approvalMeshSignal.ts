// approvalMeshSignal.ts
// FR1 (02-mesh-urgency-signal): getApprovalMeshState — time-aware ambient mesh signal
// for pending team approvals. Pure function, injectable `now` for testing.
//
// Signal:
//   null     → no pending approvals (earningsPace drives Node C normally)
//   'behind' → pending, Mon–Wed UTC (warnAmber #FCD34D — early-week ambient urgency)
//   'critical'→ pending, Thu–Sun UTC (desatCoral #F87171 — end-of-week alarm)
//
// Week boundary: Mon-Sun UTC (Crossover standard, same as payments API).
// End-of-week threshold: Thursday (day 4) onwards, including Sunday (day 0).

import type { PanelState } from '@/src/lib/panelState';

/**
 * Returns the AnimatedMeshBackground panelState for the pending approval urgency signal.
 *
 * @param pendingCount - Number of pending team approval items (items.length)
 * @param now - Injectable date for testing (defaults to current date)
 * @returns PanelState | null
 */
export function getApprovalMeshState(
  pendingCount: number,
  now: Date = new Date(),
): PanelState | null {
  if (pendingCount === 0) return null;
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const isEndOfWeek = day === 0 || day >= 4; // Thu, Fri, Sat, Sun
  return isEndOfWeek ? 'critical' : 'behind';
}
