# src/notifications/

Push notification handling. Pairs with `src/hooks/useScheduledNotifications.ts` (local scheduled notifications).

**Full map:** `docs/ARCHITECTURE.md` §1 (Notification Lifecycle) and §2 (Push & Refresh Pipeline).

## What lives here

- `handler.ts` — background push handler (`handleBackgroundPush`), local notification scheduler (`scheduleLocalNotification`), background listener registration (`registerBackgroundPushHandler`).

## Companion files (read together)

- `src/hooks/useScheduledNotifications.ts` — schedules Thursday, Monday summary, Monday expiry notifications.
- `src/lib/pushToken.ts` — registers the device's Expo push token with the Railway ping server.
- `server/push.ts` + `server/cron.ts` — silent push sender + 30-minute cron dispatcher.

## Invariants — do not break these

1. **`prev_approval_ids` is the dedup source of truth** (`handler.ts:18`). Set-difference (`currentIds \ prevIds`) decides whether to fire. The legacy `prev_approval_count` integer was replaced in spec `06-push-dedup`; the legacy key is removed on every write of the new key as a one-shot migration. The first-ever read of `prev_approval_ids` seeds without firing. See `docs/ARCHITECTURE.md` §8.1.
2. **`inFlightRef` only guards within `useScheduledNotifications.scheduleAll`.** It does not coordinate with `handleBackgroundPush`. Both can run concurrently. See §8.2.
3. **`cancel + setItem` is not atomic.** A crash between cancelling an old notification ID and persisting the new one leaves an orphan. See §8.3.
4. **iOS Calendar triggers persist past the app.** If AsyncStorage is cleared without cancelling the underlying iOS notification, the notification still fires. See §8.4.
5. **Errors in scheduling are silently swallowed.** Notifications are best-effort by design. If you change this, decide explicitly whether to surface errors.
6. **Permissions are checked, never re-requested, by `scheduleAll`.** Re-requesting is `registerPushToken`'s job (called once at setup).

## Before changing anything here

1. Read `docs/ARCHITECTURE.md` §1.
2. Establish baseline: run `npm test -- src/__tests__/notifications/ src/hooks/__tests__/useScheduledNotifications.test.ts app/__tests__/layout-notifications.test.tsx`.
3. Make change.
4. Re-run those tests + any test directory whose code path could be touched.

## Recurring symptom to be aware of

Notifications occasionally fire in bursts (e.g. multiple Thursday reminders). The four candidate root causes are catalogued in `docs/ARCHITECTURE.md` §8.1–8.4. Before adding "yet another guard," check whether the new symptom maps to one of those known surfaces.
