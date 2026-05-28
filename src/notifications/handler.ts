/**
 * FR5: App Background Push Handler
 * Processes incoming silent push notifications from the ping server.
 * On bg_refresh: fetches fresh Crossover data, updates widget, schedules local notification
 * when the manager has newly-arrived approval items (set-difference dedup vs `prev_approval_ids`).
 *
 * 06-push-dedup: dedup is keyed on a Set<string> of ApprovalItem IDs persisted to AsyncStorage,
 * not on a raw integer count. This fixes the Thursday-flood class of bugs documented in
 * docs/ARCHITECTURE.md §8.1 (approve-then-arrive inversion, cross-week window expansion).
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFreshData } from '../lib/crossoverData';
import { updateWidgetData } from '../lib/widgetBridge';
import { withScheduleLock } from '../lib/scheduleLock';

const PREV_APPROVAL_IDS_KEY = 'prev_approval_ids';
const PREV_APPROVAL_COUNT_KEY_LEGACY = 'prev_approval_count';

/**
 * Read the persisted set of previously-seen approval item IDs.
 * Returns null on any failure path (missing key, malformed JSON, non-array payload,
 * AsyncStorage rejection). Callers treat null as a first-run signal and seed without firing.
 */
async function getPrevIds(): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREV_APPROVAL_IDS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return null;
  }
}

/**
 * Persist the current snapshot's approval IDs and clean up the legacy `prev_approval_count` key.
 * The legacy-key removal is best-effort: a rejection is caught and ignored so it cannot mask
 * a successful primary write. The primary setItem rejection IS allowed to propagate; the caller's
 * try/catch logs it via console.error (FR7).
 */
async function savePrevIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(PREV_APPROVAL_IDS_KEY, JSON.stringify([...ids]));
  await AsyncStorage.removeItem(PREV_APPROVAL_COUNT_KEY_LEGACY).catch(() => {});
}

/**
 * Handle an incoming push notification.
 * Only acts on notifications where data.type === 'bg_refresh'.
 * All errors are caught and logged — handler never throws.
 *
 * 07-notification-lifecycle FR6: when spec-06 dedup decides to fire, the
 * scheduleLocalNotification call is wrapped in withScheduleLock to coordinate
 * with useScheduledNotifications.scheduleAll. If the lock is contended, the
 * notification is skipped — but savePrevIds still advances the dedup state so
 * the next push doesn't re-evaluate the same items as new.
 */
export async function handleBackgroundPush(
  notification: Notifications.Notification
): Promise<void> {
  const dataType = notification?.request?.content?.data?.type;
  if (dataType !== 'bg_refresh') {
    return;
  }

  try {
    const freshData = await fetchFreshData();
    await updateWidgetData(freshData);

    // 06-push-dedup: ID-set diff vs persisted set; manager-only.
    if (freshData.config.isManager) {
      const currentIds = new Set(
        (freshData.approvalItems ?? []).map((item) => item.id)
      );
      const prevIds = await getPrevIds();

      if (prevIds === null) {
        // First-ever run (or corrupt/missing storage). Seed without notifying.
        await savePrevIds(currentIds);
        return;
      }

      const newIds = [...currentIds].filter((id) => !prevIds.has(id));
      if (newIds.length > 0) {
        // 07-notification-lifecycle FR6: cross-handler mutex. Lock may be
        // contended by useScheduledNotifications.scheduleAll; if so, skip
        // the notification but still advance dedup state below.
        await withScheduleLock(() => scheduleLocalNotification(newIds.length));
      }
      await savePrevIds(currentIds);
    }
  } catch (err) {
    console.error('[handler] Background push refresh failed:', err);
  }
}

/**
 * Schedule an immediate local notification for pending approvals.
 */
export async function scheduleLocalNotification(count: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Approvals',
      body: `${count} item(s) pending approval`,
    },
    trigger: null,
  });
}

/**
 * Register the background push handler with expo-notifications.
 * Call this from the app entry point.
 */
export function registerBackgroundPushHandler(): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handleBackgroundPush);
}
