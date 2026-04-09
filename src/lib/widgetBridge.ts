/**
 * FR3 (01-widget-activation): widgetBridge — thin wrapper over widgets/bridge
 *
 * Translates CrossoverSnapshot (used by background push handler) into the
 * individual args expected by widgets/bridge.updateWidgetData().
 *
 * handler.ts calls: updateWidgetData(snapshot)
 * widgets/bridge expects: updateWidgetData(hoursData, aiData, pendingCount, config, approvalItems, myRequests)
 *
 * Extended in 08-widget-enhancements: forwards approvalItems and myRequests from snapshot.
 */

import { updateWidgetData as _updateWidgetData } from '../widgets/bridge';
import type { CrossoverSnapshot } from './crossoverData';

/**
 * Write fresh Crossover data to the home screen widget store.
 * Delegates to widgets/bridge.updateWidgetData — no data transformation.
 *
 * @param data CrossoverSnapshot from fetchFreshData()
 */
export async function updateWidgetData(data: CrossoverSnapshot): Promise<void> {
  await _updateWidgetData(
    data.hoursData,
    data.aiData,
    data.pendingCount,
    data.config,
    data.approvalItems ?? [],
    data.myRequests ?? [],
    // prevWeekSnapshot intentionally omitted on background path (Decision 2, 01-data-extensions):
    // Background handler does not have AsyncStorage history available mid-execution.
    // weekDeltaHours and weekDeltaEarnings will be "" on background-triggered widget updates.
    // The foreground path (_layout.tsx) provides the full snapshot via useWeeklyHistory.
  );
}
