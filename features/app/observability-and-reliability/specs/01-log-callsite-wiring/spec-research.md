# Spec 01 — Wire `log.*` into deferred call sites

**Status:** Research complete
**Complexity:** M
**Blocks:** 03 (silent-catch-audit should route through the conventions this spec establishes)

## Problem context

`resilience-fixes` spec 08 built the logger (`src/lib/log.ts` — `Logger` singleton with `.info`/`.warn`/`.error`, JSONL rolling file, `redact()` at write time) and its own spec table already wired several call sites (`api.error_envelope`, `auth.token_minted`, `auth.token_retried`, `auth.html_500_detected`, `onboarding.not_contributor`, `push.bg_refresh_handled`, `notif.scheduled`, `notif.orphan_swept`, `notif.lock_not_acquired`). A repo-wide grep confirms only **one** of those call sites actually landed in code: `src/hooks/useAuth.ts:69` (`log.error('onboarding.not-contributor', err, {avatarTypes: err.avatarTypes})`). All the other categories spec 08 designed for — token retry, push dedup, notification scheduling lock/orphan-sweep — have no corresponding `log.*` call anywhere in `src/` today.

This means the "Share debug log" button ships a nearly-empty file for the exact failure modes it was built to capture. A user reporting "I didn't get my Thursday reminder" today produces a debug log with zero relevant entries.

## Exploration findings

- `src/api/client.ts` — has 4 catch blocks (lines 42, 53, 160, 227) around what's presumably token-fetch/retry logic and request handling. None currently call `log.*`. This is the `auth.token_retried`/`api.error_envelope` territory spec 08 designed for but never implemented.
- `src/lib/pushToken.ts` — 2 catch blocks (40, 73), no logging. Push token registration/dedup logic — spec 08's `push.bg_refresh_handled` target.
- `src/lib/scheduleLock.ts` — 6 catch blocks (58, 72, 81, 100, 110, 118), no logging. This is exactly `notif.lock_not_acquired`/`notif.orphan_swept` territory — the lock/orphan-sweep mechanism that fixed the notification barrage bug (`project_notification_barrage` memory) has literally zero observability today, meaning if it regresses, nothing will show it.
- `src/hooks/useScheduledNotifications.ts` — 6 catch blocks, no logging — `notif.scheduled` category target.
- `src/notifications/handler.ts` — the actual push-received handler; needs reading in full during spec-writing to find the precise dedup-decision branch point (where `prevIdsCount`/`currentIdsCount`/`newIdsCount` would be computed).
- `src/hooks/useAuth.ts:66,123,154` — 3 catch blocks; only line 69 (inside the block starting at 66) logs. Lines 123 and 154 do not — these are exactly the gaps identified in `onboarding-trust-and-help` spec 03 (the `submitCredentials` outer catch and a third block not yet inspected).

## Key decisions

**1. Wire exactly the categories spec 08 already designed, in the files identified above — don't invent new categories.** Spec 08's table is the contract; this spec's job is to make code match documentation, not redesign the taxonomy.

**2. One `log.*` call per meaningful decision point, not per catch block.** Some catch blocks are pure best-effort cleanup (e.g. AsyncStorage write failing during a non-critical cache update) where logging would be noise — spec 08's own risk note ("only log decisions and errors, not 'I made a request'") governs. This spec should log: token retry attempts/outcomes, lock-acquisition failures, orphan-sweep counts, notification-scheduling outcomes, push dedup decisions. It should NOT blanket-add a `log.warn` to every one of the ~14 catch blocks found above — some are legitimately silent (verify case-by-case during implementation, informed by spec 03's audit which runs after this one, or concurrently with shared context).

**3. Establish the call-site convention other specs (03, and any future spec) should follow: `log.<level>(category, meta)` where `category` is `domain.event_name` (already the pattern), and `meta` contains only counts/booleans/enums — never IDs, messages, or free text.** This spec's PR is the reference example spec 03's audit points back to.

## Interface contracts

No new logger API — `log.info`/`log.warn`/`log.error` already exist and are sufficient (confirmed via `src/lib/log.ts` read). This spec only adds call sites:

```typescript
// src/api/client.ts — token retry path (exact line TBD after reading in full)
log.warn('auth.token_retried', { triggerStatusCode: response.status });

// src/lib/scheduleLock.ts — lock acquisition failure
log.warn('notif.lock_not_acquired', {});

// src/lib/scheduleLock.ts — orphan sweep
log.info('notif.orphan_swept', { sweptCount });

// src/lib/pushToken.ts — dedup decision
log.info('push.bg_refresh_handled', { prevIdsCount, currentIdsCount, newIdsCount, notificationFired });

// src/hooks/useScheduledNotifications.ts — scheduling outcome
log.info('notif.scheduled', { count });
```

## Test plan

- [ ] `src/api/client.ts` token-retry path — mock a 401-then-retry sequence, assert `log.warn('auth.token_retried', ...)` fires with `triggerStatusCode`.
- [ ] `src/lib/scheduleLock.ts` — lock already held → `log.warn('notif.lock_not_acquired', {})` fires.
- [ ] `src/lib/scheduleLock.ts` — orphan IDs found and cancelled → `log.info('notif.orphan_swept', {sweptCount: N})` fires with correct count.
- [ ] `src/lib/pushToken.ts` / push handler — silent-push-driven refresh with N new items → `log.info('push.bg_refresh_handled', ...)` fires with correct counts and `notificationFired` boolean.
- [ ] `src/hooks/useScheduledNotifications.ts` — successful scheduling → `log.info('notif.scheduled', ...)` fires.
- [ ] No PII/free-text leaks into any new `meta` payload — assert against the `redact()` deny-list already established in spec 08's tests.
- [ ] Regression: existing `onboarding.not-contributor` log call at `useAuth.ts:69` still fires unchanged.

## Files to reference

| File | Why |
|---|---|
| `src/lib/log.ts` | The existing logger — no changes needed, just import and call. |
| `src/api/client.ts:42,53,160,227` | Token/request retry catch blocks — primary wiring target. |
| `src/lib/scheduleLock.ts` (6 catch blocks) | Lock/orphan-sweep logic — the exact mechanism `project_notification_barrage` memory says fixed the duplicate-notification bug; needs observability so a regression is visible. |
| `src/lib/pushToken.ts:40,73` | Push token dedup logic. |
| `src/hooks/useScheduledNotifications.ts` (6 catch blocks) | Notification scheduling — `notif.scheduled` category target. |
| `src/notifications/handler.ts` | Push-received handler — read in full to find the exact dedup decision point. |
| `features/app/resilience-fixes/specs/08-observability-log/spec-research.md` | The original call-site table this spec is completing. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Mock `log` module, assert call args at each wired site |
| Live-QA probe | ✗ | No new API surface |
| TestFlight | ✓ | Force a 401/retry, a lock contention, an orphan sweep (multi-device or rapid relaunch), a silent push — confirm each produces a log line via Share Log |
| Error log | ✓ | This spec's entire purpose is populating tier 4 — self-verifying once merged |
