# 09-orphan-sweep-migration
**Status:** Draft
**Created:** 2026-06-05
**Last Updated:** 2026-06-05
**Owner:** @jaime-alvarez-trilogy

## Overview
Users hit a **barrage of duplicate "Hours Deadline Tonight" notifications** — non-identical bodies (different `hoursRemaining`: 28.3h, 35.8h ×N, 35.3h), all firing together at Thursday 6pm.

Root cause: **build 9** (`efc3641`) scheduled the Thursday reminder with a cancel-then-reschedule pattern that produced a **random UUID identifier** on every app foreground. The non-atomic cancel/setItem step (ARCHITECTURE.md §8.3) leaked a pending Thursday-6pm notification on each open — each capturing that moment's `hoursRemaining` — and they all fired together at 6pm.

**Build 10/11** fixed go-forward scheduling with deterministic identifiers (`hourglass:thursday` etc.) and an orphan sweep — **but the sweep only cancels identifiers that start with `hourglass:`** (`scheduleLock.ts:103-106`). Build-9's orphans have random UUID identifiers, so the sweep skips them; they survive the update and still detonate at Thursday 6pm. This is a **migration gap**.

This spec broadens `sweepOrphanNotifications` to cancel **any** scheduled notification not in `EXPECTED_IDENTIFIERS` (regardless of prefix), so the next app foreground after the update clears the build-9 orphans.

## Out Of Scope
- The deterministic-id scheduling (07-notification-lifecycle — already shipped, prevents *new* accumulation).
- The immediate "New Approvals" notification (`handler.ts`, `trigger: null`) — it fires immediately and is never in the scheduled/pending list, so it is unaffected by the sweep.

## Functional Requirements

### FR1: Broaden the orphan sweep to all non-expected identifiers
**Requirements:**
- In `sweepOrphanNotifications` (`src/lib/scheduleLock.ts`), cancel every scheduled notification whose identifier is **not** in `EXPECTED_IDENTIFIERS` — remove the `id.startsWith('hourglass:')` guard (and the now-unused `PREFIX` constant).
- `getAllScheduledNotificationsAsync()` returns **only this app's** scheduled notifications, so cancelling all non-expected is safe (no cross-app collateral).
- Update the file header, the function JSDoc, and the `EXPECTED_IDENTIFIERS` comment to state the sweep now cancels ANY non-expected identifier.

**Success Criteria:**
- A scheduled notification with a **random UUID** identifier (the build-9 orphan shape) **is cancelled**.
- The three `EXPECTED_IDENTIFIERS` are **not** cancelled.
- A non-`hourglass:` identifier (e.g. `'legacy-uuid-xyz'`) **is cancelled** (it is still this app's notification).
- Empty list / `getAllScheduled` rejection / per-orphan cancel rejection behavior unchanged; legacy-key `multiRemove` still runs.

## Technical Design
### Files to Reference
- `src/lib/scheduleLock.ts:92-121` — current narrow sweep.
- `src/hooks/useScheduledNotifications.ts:229` — sweep is invoked here on mount + every foreground, before scheduling the canonical three.

### Files to Create/Modify
- `src/lib/scheduleLock.ts` — broaden the condition; remove `PREFIX`; update comments.
- `src/lib/__tests__/scheduleLock.test.ts` — update T9; add a build-9 random-UUID regression test.
- `docs/ARCHITECTURE.md` §8.3/§8.4 — note the sweep now cancels ALL non-expected (closes the migration gap).
- `app.json` — bump `ios.buildNumber` 11 → 12.

### Data Flow
`scheduleAll` (mount + every foreground) → `sweepOrphanNotifications()` (now cancels every pending notification not in `EXPECTED_IDENTIFIERS`, including build-9 random-id orphans) → schedules/replaces the three deterministic notifications. Net result: only the three canonical notifications ever remain pending.

### Edge Cases
- Already-**delivered** orphans (in Notification Center) are not removed by the sweep (it cancels **pending** only); the user dismisses those. Future deliveries are prevented.
- A future spec adding a new scheduled notification MUST add its identifier to `EXPECTED_IDENTIFIERS` or the sweep will cancel it (stricter contract — documented).

## Dependencies
### Internal
- 07-notification-lifecycle (the deterministic-id scheduling + sweep this extends).
### External
- `expo-notifications` (`getAllScheduledNotificationsAsync`, `cancelScheduledNotificationAsync`).

## Definition of Done
- FR1 has passing tests: random-UUID orphan cancelled · expected three kept · non-`hourglass:` cancelled · existing T10–T14 still green.
- Full `npm test` suite green vs the pre-spec baseline (`--runInBand`).
- `docs/ARCHITECTURE.md` §8.3/§8.4 updated.
- `app.json` `buildNumber` = 12.
- Commits: `test(09-orphan-sweep-migration)` → `feat(09-orphan-sweep-migration)` → `docs(09-orphan-sweep-migration)`.
- Device note (deferred): on a build-9→build-12 upgrade, confirm the leftover Thursday orphans are swept on first open (no 6pm barrage).
