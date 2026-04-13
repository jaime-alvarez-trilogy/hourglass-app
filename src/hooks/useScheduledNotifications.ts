// FR1–FR3: useScheduledNotifications — 10-scheduled-notifications
//
// Schedules two local notifications on mount and every app foreground transition:
//   1. Thursday 6pm deadline reminder (FR2)
//   2. Monday 9am weekly summary (FR3)
//
// No API calls — uses only locally cached AsyncStorage data.
// Permissions checked via getPermissionsAsync (not request — handled in spec 09).

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadWeeklyHistory } from '../lib/weeklyHistory';
import type { CrossoverConfig } from '../types/config';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const WIDGET_DATA_KEY = 'widget_data';
const THURSDAY_NOTIF_ID_KEY = 'notif_thursday_id';
const MONDAY_NOTIF_ID_KEY = 'notif_monday_id';
const EXPIRY_NOTIF_ID_KEY = 'notif_expiry_id';

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

    // Guard: skip if deadline window has already passed this week.
    // Use local time — notification fires at local 6pm Thursday.
    const now = new Date();
    const localDay = now.getDay(); // 0=Sun,1=Mon,...,4=Thu,5=Fri,6=Sat
    const localHour = now.getHours();
    // Fri or Sat: deadline passed
    if (localDay === 5 || localDay === 6) return;
    // Thursday after 6pm: window closed — scheduling now would fire immediately
    if (localDay === 4 && localHour >= 18) return;

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

// ── FR4: scheduleMondayExpiryReminder ────────────────────────────────────────

/**
 * Schedules a 9am Monday notification warning managers that pending approvals
 * expire at 15:00 UTC. Only fires on Mondays before the 15:00 UTC cutoff.
 * Manager-only — contributors cannot approve items.
 *
 * Reads pendingCount from widget_data; skips if zero or data unavailable.
 * Cancels any existing expiry notification before rescheduling.
 */
async function scheduleMondayExpiryReminder(isManager: boolean): Promise<void> {
  try {
    // Manager-only
    if (!isManager) return;

    // Only schedule on Monday before 15:00 UTC
    const now = new Date();
    const localDay = now.getDay();   // 0=Sun, 1=Mon, ..., 6=Sat
    const utcHour = now.getUTCHours();
    if (localDay !== 1) return;
    if (utcHour >= 15) return;

    // Read pendingCount from widget_data
    const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (!raw) return;
    let pendingCount = 0;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const count = typeof parsed?.pendingCount === 'number' ? parsed.pendingCount : 0;
      pendingCount = count;
    } catch {
      return;
    }
    if (pendingCount <= 0) return;

    // Cancel existing
    const existingId = await AsyncStorage.getItem(EXPIRY_NOTIF_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }

    // Schedule
    const body = `${pendingCount} pending approval${pendingCount === 1 ? '' : 's'} — must be reviewed by 3pm UTC`;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Approvals Expiring Today',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 2,    // Monday
        hour: 9,
        minute: 0,
        repeats: false,
      } as any,
    });

    await AsyncStorage.setItem(EXPIRY_NOTIF_ID_KEY, id);
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
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!config?.setupComplete) return;

    // scheduleAll: orchestrates both notifications; swallows all errors.
    // inFlightRef guards against concurrent calls (e.g. rapid AppState 'active' events).
    const scheduleAll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Check permissions — spec 09 handles request; we only check here
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;

        // Default to 1 (positive sentinel): assume hours remain when widget data
        // is not yet available (fresh install, first open before useWidgetSync fires).
        // This ensures the Thursday deadline notification is always scheduled on week 1.
        let hoursRemaining = 1;
        const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            // hoursRemaining in widget_data is a formatted string ("12.2h left", "2.5h OT").
            // parseFloat extracts the leading number; only override default if valid.
            const hoursRemainingStr = typeof parsed?.hoursRemaining === 'string' ? parsed.hoursRemaining : '';
            const hoursFloat = parseFloat(hoursRemainingStr);
            if (!isNaN(hoursFloat)) hoursRemaining = hoursFloat;
          } catch {
            // JSON parse failed — keep hoursRemaining = 1 (schedule notification)
          }
        }

        if (hoursRemaining > 0) {
          await scheduleThursdayReminder(hoursRemaining, config.weeklyLimit);
        }
        await scheduleMondaySummary();
        await scheduleMondayExpiryReminder(config.isManager ?? false);
      } catch {
        // Silently swallow — notifications are best-effort
      } finally {
        inFlightRef.current = false;
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
  scheduleMondayExpiryReminder,
};
