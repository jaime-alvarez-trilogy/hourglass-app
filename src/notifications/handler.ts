/**
 * FR5: App Background Push Handler
 * Processes incoming silent push notifications from the ping server.
 * On bg_refresh: fetches fresh Crossover data, updates widget, schedules local notification if needed.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFreshData } from '../lib/crossoverData';
import { updateWidgetData } from '../lib/widgetBridge';

const PREV_APPROVAL_COUNT_KEY = 'prev_approval_count';

/**
 * Handle an incoming push notification.
 * Only acts on notifications where data.type === 'bg_refresh'.
 * All errors are caught and logged — handler never throws.
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

    // Schedule local notification if manager has new approvals
    if (freshData.config.isManager) {
      const prevRaw = await AsyncStorage.getItem(PREV_APPROVAL_COUNT_KEY);
      const previousCount = prevRaw !== null ? parseInt(prevRaw, 10) : 0;
      const newCount = freshData.pendingCount;

      if (newCount > previousCount) {
        await scheduleLocalNotification(newCount);
      }

      await AsyncStorage.setItem(PREV_APPROVAL_COUNT_KEY, String(newCount));
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
