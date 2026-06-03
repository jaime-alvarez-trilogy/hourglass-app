// FR1–FR3: useScheduledNotifications — 10-scheduled-notifications
//
// Schedules three local notifications on mount and every app foreground:
//   1. Thursday 6pm mid-week PACE-CHECK reminder (FR2) — NOT the hard deadline.
//      The hours week closes Sunday 23:59:59 UTC (05-sunday-gmt-deadline);
//      the true Sunday-night deadline reminder is deferred to spec 06.
//   2. Monday 9am weekly summary (FR3)
//   3. Monday 9am approval-expiry warning for managers (FR4)
//
// No API calls — uses only locally cached AsyncStorage data.
// Permissions checked via getPermissionsAsync (request handled in spec 09).
//
// 07-notification-lifecycle: each scheduler uses a deterministic identifier
// (`hourglass:thursday` / `hourglass:monday-summary` / `hourglass:monday-expiry`)
// so iOS replaces same-id schedules — no AsyncStorage ID tracking, no
// cancel/setItem race. scheduleAll runs sweepOrphanNotifications (mitigates
// §8.3 leftovers and §8.4 reinstall orphans) then wraps the three scheduler
// calls in withScheduleLock (cross-handler coordination with handleBackgroundPush).
// inFlightRef from spec 01 (bebfb0f) preserved as intra-hook defense-in-depth.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadWeeklyHistory } from '../lib/weeklyHistory';
import { withScheduleLock, sweepOrphanNotifications } from '../lib/scheduleLock';
import type { CrossoverConfig } from '../types/config';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const WIDGET_DATA_KEY = 'widget_data';

// ── Deterministic notification identifiers (07-notification-lifecycle FR1) ───

const THURSDAY_ID = 'hourglass:thursday';
const MONDAY_SUMMARY_ID = 'hourglass:monday-summary';
const MONDAY_EXPIRY_ID = 'hourglass:monday-expiry';

// ── FR2: scheduleThursdayReminder ─────────────────────────────────────────────

/**
 * Schedules the Thursday 6pm local mid-week PACE-CHECK reminder. iOS replaces
 * any prior schedule with the same identifier (`hourglass:thursday`).
 *
 * NOT the hard deadline — the Crossover hours week closes Sunday 23:59:59 UTC
 * (05-sunday-gmt-deadline). This is a mid-week nudge on remaining hours; the
 * true Sunday-night deadline reminder is deferred to spec 06.
 *
 * Skips scheduling on Friday and Saturday and on Thursday after 6pm (window
 * closed — scheduling then would fire immediately).
 */
async function scheduleThursdayReminder(
  hoursRemaining: number,
  weeklyLimit: number,
): Promise<void> {
  try {
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

    await Notifications.scheduleNotificationAsync({
      identifier: THURSDAY_ID,
      content: {
        title: 'Hours Pace Check',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 5, // iOS convention: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        hour: 18,
        minute: 0,
        repeats: false,
      } as any,
    });
  } catch {
    // Silently swallow — notifications are best-effort
  }
}

// ── FR3: scheduleMondaySummary ────────────────────────────────────────────────

/**
 * Schedules the Monday 9am local weekly-summary notification.
 * iOS replaces any prior schedule with the same identifier.
 *
 * Skips if fewer than 2 history snapshots exist (no "last week" data),
 * or if last week had 0 hours (empty week).
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

    // Build notification body — earnings + hours + optional AI%
    const earningsStr = `$${Math.round(lastWeek.earnings).toLocaleString()}`;
    const hoursStr = `${lastWeek.hours.toFixed(1)}h`;
    const aiStr = lastWeek.aiPct > 0 ? ` · ${lastWeek.aiPct}% AI` : '';
    const body = `${earningsStr} · ${hoursStr}${aiStr}`;

    await Notifications.scheduleNotificationAsync({
      identifier: MONDAY_SUMMARY_ID,
      content: {
        title: 'Last Week Summary',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 2, // iOS convention: Monday = 2
        hour: 9,
        minute: 0,
        repeats: false,
      } as any,
    });
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
 * iOS replaces any prior schedule with the same identifier.
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

    // Schedule
    const body = `${pendingCount} pending approval${pendingCount === 1 ? '' : 's'} — must be reviewed by 3pm UTC`;
    await Notifications.scheduleNotificationAsync({
      identifier: MONDAY_EXPIRY_ID,
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
  } catch {
    // Silently swallow — notifications are best-effort
  }
}

// ── FR1: useScheduledNotifications ───────────────────────────────────────────

/**
 * Schedules local notifications (Thursday 6pm mid-week pace check, Monday 9am
 * weekly summary, Monday 9am approval-expiry warning for managers) on mount and
 * on every AppState 'active' transition. Reads from AsyncStorage 'widget_data'
 * and weekly history; no API calls.
 *
 * Three concurrency guards layered:
 *   1. inFlightRef — intra-hook re-entry (spec 01-flood-guard, bebfb0f).
 *   2. sweepOrphanNotifications — cancels `hourglass:*` orphans before scheduling
 *      (07-notification-lifecycle FR4/FR5).
 *   3. withScheduleLock — cross-handler mutex against handleBackgroundPush
 *      (07-notification-lifecycle FR2/FR3).
 *
 * No-op when config is null, setupComplete is false, or permissions are not granted.
 * See ARCHITECTURE.md §1 and §8.2.
 */
export function useScheduledNotifications(
  config: CrossoverConfig | null,
): void {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!config?.setupComplete) return;

    // scheduleAll: orchestrates all three notifications; swallows all errors.
    // inFlightRef guards against intra-hook concurrent calls (e.g. rapid AppState
    // 'active' events). Cross-handler concurrency is handled by withScheduleLock.
    const scheduleAll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Check permissions — spec 09 handles request; we only check here
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;

        // 07-notification-lifecycle FR4/FR5: sweep before lock so contention
        // doesn't block orphan cleanup.
        await sweepOrphanNotifications();

        // 07-notification-lifecycle FR3: cross-handler mutex wraps the three
        // scheduler calls. Returns undefined silently if a concurrent handler
        // (e.g. handleBackgroundPush) holds the lock.
        await withScheduleLock(async () => {
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
        });
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
