// 07-notification-lifecycle: cross-handler scheduling coordination.
//
// withScheduleLock — best-effort AsyncStorage-backed mutex coordinating
// calendar-trigger scheduling (useScheduledNotifications.scheduleAll) and
// push-trigger scheduling (handleBackgroundPush). See docs/ARCHITECTURE.md §8.2.
//
// sweepOrphanNotifications — at every scheduleAll mount, cancel ANY scheduled
// notification whose identifier is not in EXPECTED_IDENTIFIERS (any prefix), and
// remove the legacy notif_*_id AsyncStorage keys. Mitigates §8.3 — including the
// random-UUID orphans left by the pre-07 cancel/reschedule pattern (build 9) that
// the old `hourglass:`-only sweep could not see (09-orphan-sweep-migration) — and
// §8.4 (calendar triggers surviving uninstall/reinstall).

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCK_KEY = 'notif_schedule_lock';
const STALE_MS = 30_000;

/**
 * Canonical set of identifiers scheduled by useScheduledNotifications.
 *
 * IMPORTANT: the orphan sweep cancels EVERY scheduled notification whose id is
 * not in this set. Any future spec that schedules a new notification MUST add
 * its identifier here in the same PR, or the sweep will cancel it on next mount.
 */
export const EXPECTED_IDENTIFIERS: ReadonlySet<string> = new Set([
  'hourglass:thursday',
  'hourglass:monday-summary',
  'hourglass:monday-expiry',
]);

const LEGACY_ID_KEYS = [
  'notif_thursday_id',
  'notif_monday_id',
  'notif_expiry_id',
] as const;

/**
 * Best-effort AsyncStorage-backed mutex.
 *
 * Returns `fn`'s result on success, or `undefined` when the lock is held
 * by another caller. AsyncStorage operations are not atomic, so two
 * concurrent callers can both observe an absent lock and both run; this
 * is acceptable because the underlying scheduling is idempotent thanks
 * to deterministic identifiers.
 *
 * Lock auto-clears after STALE_MS (30s) to recover from crashed holders.
 * See docs/ARCHITECTURE.md §8.2.
 */
export async function withScheduleLock<T>(
  fn: () => Promise<T>,
): Promise<T | undefined> {
  // Read existing lock — failure is treated as "no lock present"
  let existing: string | null = null;
  try {
    existing = await AsyncStorage.getItem(LOCK_KEY);
  } catch {
    existing = null;
  }

  if (existing !== null) {
    const heldAt = Number(existing);
    if (Number.isFinite(heldAt) && Date.now() - heldAt < STALE_MS) {
      return undefined;
    }
  }

  // Claim — failure is logged but we run anyway (best-effort).
  try {
    await AsyncStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch (err) {
    console.warn('[scheduleLock] claim failed; running anyway:', err);
  }

  try {
    return await fn();
  } finally {
    try {
      await AsyncStorage.removeItem(LOCK_KEY);
    } catch {
      // Swallow — lock will go stale after STALE_MS.
    }
  }
}

/**
 * Cancel ANY scheduled notification whose identifier is not in
 * EXPECTED_IDENTIFIERS (regardless of prefix), and remove the legacy notif_*_id
 * AsyncStorage keys. `getAllScheduledNotificationsAsync` returns only this app's
 * notifications, so this safely clears stray/orphaned schedules — including the
 * random-UUID orphans left by the pre-07 cancel/reschedule pattern (build 9),
 * which the old `hourglass:`-prefixed sweep could not see.
 * Idempotent. All errors swallowed. See docs/ARCHITECTURE.md §8.3 and §8.4.
 */
export async function sweepOrphanNotifications(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = [];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[scheduleLock] sweep getAllScheduled failed:', err);
    // Still attempt the legacy-key cleanup below.
  }

  for (const n of scheduled) {
    const id = n.identifier;
    if (typeof id === 'string' && !EXPECTED_IDENTIFIERS.has(id)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Swallow per-orphan errors; continue to next.
      }
    }
  }

  try {
    await AsyncStorage.multiRemove([...LEGACY_ID_KEYS]);
  } catch {
    // Swallow.
  }
}
