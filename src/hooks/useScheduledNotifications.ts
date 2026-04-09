// FR1–FR3: useScheduledNotifications — 10-scheduled-notifications
//
// Schedules two local notifications on mount and every app foreground transition:
//   1. Thursday 6pm deadline reminder (FR2)
//   2. Monday 9am weekly summary (FR3)
//
// No API calls — uses only locally cached AsyncStorage data.
// Permissions checked via getPermissionsAsync (not request — handled in spec 09).

import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadWeeklyHistory } from '../lib/weeklyHistory';
import type { CrossoverConfig } from '../types/config';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const WIDGET_DATA_KEY = 'widget_data';
const THURSDAY_NOTIF_ID_KEY = 'notif_thursday_id';
const MONDAY_NOTIF_ID_KEY = 'notif_monday_id';

// ── FR2: scheduleThursdayReminder ─────────────────────────────────────────────

/**
 * Cancels any existing Thursday deadline notification and schedules a fresh one
 * for 6pm local Thursday with current hoursRemaining content.
 *
 * Skips scheduling on Friday (UTC day 5) and Saturday (UTC day 6) — deadline
 * has already passed for this week.
 */
async function scheduleThursdayReminder(
  hoursRemaining: number,
  weeklyLimit: number,
): Promise<void> {
  try {
    // Cancel existing notification before rescheduling
    const existingId = await AsyncStorage.getItem(THURSDAY_NOTIF_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }

    // Guard: skip if deadline already passed for this week (Fri=5 or Sat=6)
    const utcDay = new Date().getUTCDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
    if (utcDay === 5 || utcDay === 6) return;

    // Build notification content
    const body =
      hoursRemaining > 0
        ? `${hoursRemaining.toFixed(1)}h to go`
        : `You've hit your ${weeklyLimit}h target 🎯`;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hours Deadline Tonight',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 5, // iOS convention: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        hour: 18,
        minute: 0,
        repeats: false, // Reschedule each week on app open for fresh content
      } as any,
    });

    await AsyncStorage.setItem(THURSDAY_NOTIF_ID_KEY, id);
  } catch {
    // Silently swallow — notifications are best-effort
  }
}

// ── FR3: scheduleMondaySummary ────────────────────────────────────────────────

/**
 * Cancels any existing Monday summary notification and schedules a fresh one
 * for 9am local Monday showing last week's performance stats.
 *
 * Skips scheduling if fewer than 2 history snapshots exist (no "last week" data).
 * Skips if last week had 0 hours (empty week).
 */
async function scheduleMondaySummary(): Promise<void> {
  try {
    // Load weekly history from AsyncStorage
    const snapshots = await loadWeeklyHistory();

    // Need at least 2 snapshots: last week + current week
    if (snapshots.length < 2) return;

    const lastWeek = snapshots[snapshots.length - 2];

    // Skip if last week was empty
    if (lastWeek.hours === 0) return;

    // Cancel existing notification before rescheduling
    const existingId = await AsyncStorage.getItem(MONDAY_NOTIF_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }

    // Build notification body — earnings + hours + optional AI%
    const earningsStr = `$${Math.round(lastWeek.earnings).toLocaleString()}`;
    const hoursStr = `${lastWeek.hours.toFixed(1)}h`;
    const aiStr = lastWeek.aiPct > 0 ? ` · ${lastWeek.aiPct}% AI` : '';
    const body = `${earningsStr} · ${hoursStr}${aiStr}`;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Last Week Summary',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 2, // iOS convention: Monday = 2
        hour: 9,
        minute: 0,
        repeats: false, // Reschedule each week on app open for fresh content
      } as any,
    });

    await AsyncStorage.setItem(MONDAY_NOTIF_ID_KEY, id);
  } catch {
    // Silently swallow — notifications are best-effort
  }
}

// ── FR1: useScheduledNotifications ───────────────────────────────────────────

/**
 * Hook: schedules local notifications on mount and every app foreground event.
 *
 * - Thursday 6pm: deadline reminder with live hoursRemaining
 * - Monday 9am: last week's earnings/hours/AI% summary
 *
 * Does nothing if config is null or setupComplete is false.
 * Silently skips if notification permissions are not granted.
 */
export function useScheduledNotifications(
  config: CrossoverConfig | null,
): void {
  useEffect(() => {
    if (!config?.setupComplete) return;

    // scheduleAll: orchestrates both notifications; swallows all errors
    const scheduleAll = async () => {
      try {
        // Check permissions — spec 09 handles request; we only check here
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;

        // Read hoursRemaining from the last widget bridge write.
        // If no widget data exists yet (new install, first open), skip the
        // Thursday reminder entirely — it will be scheduled once real data loads.
        const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const hoursRemaining = (parsed?.hoursRemaining as number) ?? 0;

        await scheduleThursdayReminder(hoursRemaining, config.weeklyLimit);
        await scheduleMondaySummary();
      } catch {
        // Silently swallow — notifications are best-effort
      }
    };

    // Run immediately on mount
    scheduleAll();

    // Re-run on every foreground transition
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        scheduleAll();
      }
    });

    return () => sub.remove();
  }, [config?.setupComplete, config?.weeklyLimit]);
}

// ── Test-only exports ─────────────────────────────────────────────────────────
// These expose internal async functions for direct unit testing.
// They are NOT part of the public API and should not be imported in production code.

export const __testOnly = {
  scheduleThursdayReminder,
  scheduleMondaySummary,
};
