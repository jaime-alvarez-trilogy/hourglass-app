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
2. **`inFlightRef` only guards within `useScheduledNotifications.scheduleAll`.** Still true; spec `07-notification-lifecycle` added `withScheduleLock` (`src/lib/scheduleLock.ts`) as the cross-handler layer above it. Two layers: intra-hook (`inFlightRef`) and inter-handler (`withScheduleLock`). See §8.2.
3. **`cancel + setItem` is not atomic — RESOLVED by spec 07.** Calendar schedulers now pass deterministic `identifier`s (`hourglass:thursday`, `hourglass:monday-summary`, `hourglass:monday-expiry`). iOS replaces same-id schedules; no AsyncStorage ID tracking remains. See §8.3.
4. **iOS Calendar triggers persist past the app — MITIGATED by spec 07.** `sweepOrphanNotifications` (`src/lib/scheduleLock.ts`) runs on every `scheduleAll` mount, cancels any `hourglass:*` identifier not in `EXPECTED_IDENTIFIERS`, and `multiRemove`s the legacy `notif_*_id` keys. See §8.4.
5. **Calendar schedulers use deterministic identifiers (`hourglass:*`).** Any new `hourglass:*` identifier must be added to `EXPECTED_IDENTIFIERS` in `src/lib/scheduleLock.ts` in the same PR, or the sweep will quietly cancel it on next mount.
6. **Errors in scheduling are silently swallowed.** Notifications are best-effort by design. If you change this, decide explicitly whether to surface errors.
7. **Permissions are checked, never re-requested, by `scheduleAll`.** Re-requesting is `registerPushToken`'s job (called once at setup).

## Before changing anything here

1. Read `docs/ARCHITECTURE.md` §1.
2. Establish baseline: run `npm test -- src/__tests__/notifications/ src/hooks/__tests__/useScheduledNotifications.test.ts app/__tests__/layout-notifications.test.tsx`.
3. Make change.
4. Re-run those tests + any test directory whose code path could be touched.

## Recurring symptom to be aware of

Notifications occasionally fire in bursts (e.g. multiple Thursday reminders). The four candidate root causes are catalogued in `docs/ARCHITECTURE.md` §8.1–8.4. Before adding "yet another guard," check whether the new symptom maps to one of those known surfaces.
