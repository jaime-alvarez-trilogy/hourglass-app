# Spec Research: Cache Hygiene

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `05-cache-hygiene`

---

## Problem Context

Two related issues involving stale data persisting when it shouldn't:

**Issue #3 — Sign-out cache leak**: `clearAll()` in `src/store/config.ts` removes only 3 keys:
- `'crossover_config'`
- `'crossover_username'`  
- `'crossover_password'`

It leaves behind 11 other keys containing the prior user's data. If a second person signs into the same device, they see the first user's hours, earnings, AI%, weekly history, and cached push token until fresh data loads. Privacy concern.

**Issue #9 — Modal env-switch clears wrong query key**: In `app/modal.tsx`, the QA↔prod environment switch calls:
```typescript
queryClient.invalidateQueries({ queryKey: ['hours'] });
queryClient.invalidateQueries({ queryKey: ['approvals'] });
```
But no registered query uses key `['hours']`. The actual keys are:
- `['timesheet', weekStart, userId]`
- `['payments', weekStart, userId]`
- `['approvals', teamId, weekStart]`
- `['config']`
- `['myRequests', assignmentId]`
- etc.

Nothing gets cleared. The app continues serving old-environment data for up to 15 minutes (staleTime).

---

## Exploration Findings

### All AsyncStorage Keys in the Codebase

| Key | Constant | File | Purpose |
|-----|----------|------|---------|
| `'crossover_config'` | `CONFIG_KEY` | `src/store/config.ts:23` | App config |
| `'crossover_username'` | `USERNAME_KEY` | `src/store/config.ts:24` | Auth username |
| `'crossover_password'` | `PASSWORD_KEY` | `src/store/config.ts:25` | Auth password |
| `'hours_cache'` | `CACHE_KEY` | `src/hooks/useHoursData.ts:14` | Hours cache |
| `'ai_cache'` | `CACHE_KEY` | `src/hooks/useAIData.ts:36` | AI data cache |
| `'previousWeekAIPercent'` | `PREV_WEEK_KEY` | `src/hooks/useAIData.ts:39` | AI prev week |
| `'earnings_history_v1'` | `CACHE_KEY` | `src/hooks/useEarningsHistory.ts:22` | Earnings history |
| `'weekly_history_v2'` | `WEEKLY_HISTORY_KEY` | `src/lib/weeklyHistory.ts:21` | Weekly snapshots |
| `'push_token'` | `PUSH_TOKEN_KEY` | `src/lib/pushToken.ts:15` | Push token |
| `'ai_app_history'` | `APP_HISTORY_KEY` | `src/lib/aiAppBreakdown.ts:23` | App breakdown |
| `'widget_data'` | `WIDGET_DATA_KEY` | `src/hooks/useScheduledNotifications.ts:20` | Widget bridge |
| `'notif_thursday_id'` | `THURSDAY_NOTIF_ID_KEY` | `src/hooks/useScheduledNotifications.ts:21` | Notif ID |
| `'notif_monday_id'` | `MONDAY_NOTIF_ID_KEY` | `src/hooks/useScheduledNotifications.ts:22` | Notif ID |
| `'prev_approval_count'` | `PREV_APPROVAL_COUNT_KEY` | `src/notifications/handler.ts:12` | Push handler state |

**Total: 14 keys.** `clearAll` removes 3.

### TanStack Query Cache

The app uses `PersistQueryClientProvider` which persists the query cache to AsyncStorage under the TanStack persister key (usually `'REACT_QUERY_OFFLINE_CACHE'` or similar — need to verify exact key). On sign-out, `queryClient.clear()` must be called to wipe in-memory cache. The persisted cache will be cleared on next load since the config is gone.

### Key Files

| File | Relevance |
|------|-----------|
| `src/store/config.ts` | `clearAll()` — add all keys |
| `app/modal.tsx` | Env-switch — fix query invalidation |
| `app/_layout.tsx` | Where `clearAll` is called on sign-out |
| `src/hooks/useApprovalItems.ts` | APPROVALS_KEY constant |

### Integration Points

- `clearAll()` is called from `_layout.tsx` on auth failure / sign-out
- The `queryClient` instance lives in `_layout.tsx` (or its provider)
- `clearAll()` currently takes no params — must accept optional `queryClient`

---

## Key Decisions

### Decision 1: How to clear TanStack Query cache from `clearAll`

**Options considered:**
1. Accept optional `queryClient` param in `clearAll(queryClient?)` — call `queryClient.clear()` if provided
2. Don't clear in `clearAll`; let the call site in `_layout.tsx` call `queryClient.clear()` separately
3. Use a module-level singleton queryClient that `clearAll` can access

**Chosen:** Option 2 — clear AsyncStorage keys in `clearAll`; call `queryClient.clear()` at the call site

**Rationale:** `clearAll` is in `src/store/config.ts` which has no dependency on React/TanStack. Keeping it pure (just AsyncStorage operations) avoids coupling. The call site (`_layout.tsx`) already has `queryClient` access and can call `queryClient.clear()` after `clearAll()`.

### Decision 2: Should sign-out cancel push notification subscription?

**Options considered:**
1. Cancel scheduled notifications + unregister push token in `clearAll` or at call site
2. Only clear the stored token key (unregister on next login attempt)
3. Leave notification cleanup to a separate flow

**Chosen:** Option 1 — cancel scheduled notifications and unregister push token at the sign-out call site in `_layout.tsx`

**Rationale:** If user B signs in on a device that had user A's push token registered, user A's push token is still active. We should unregister it on sign-out.

### Decision 3: Modal env-switch invalidation

**Options considered:**
1. `queryClient.resetQueries()` — clears all query data and marks as stale
2. `queryClient.clear()` — removes all queries from cache entirely
3. Invalidate specific known keys that change per environment

**Chosen:** Option 1 — `queryClient.resetQueries()` for simplicity, plus remove the wrong `['hours']` and `['approvals']` invalidation calls

**Rationale:** `resetQueries()` clears all cached data and triggers immediate refetch for any active queries. This is exactly what env-switch needs — force fresh data from the new environment. Simpler than enumerating every key.

---

## Interface Contracts

### `clearAll` — modified signature

```typescript
// BEFORE:
export async function clearAll(): Promise<void>

// AFTER (same signature, more keys):
export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove([
    'crossover_config',
    'crossover_username', 
    'crossover_password',
    'hours_cache',
    'ai_cache',
    'previousWeekAIPercent',
    'earnings_history_v1',
    'weekly_history_v2',
    'push_token',
    'ai_app_history',
    'widget_data',
    'notif_thursday_id',
    'notif_monday_id',
    'prev_approval_count',
  ]);
}
```

Note: Use `AsyncStorage.multiRemove([...])` instead of individual `removeItem` calls for atomicity and performance.

### Call site update (`_layout.tsx`)

```typescript
// On sign-out, after clearAll():
await clearAll();
await Notifications.cancelAllScheduledNotificationsAsync();
queryClient.clear();
// optional: await unregisterPushToken(currentToken);
```

### Modal env-switch fix

```typescript
// BEFORE (modal.tsx):
queryClient.invalidateQueries({ queryKey: ['hours'] });
queryClient.invalidateQueries({ queryKey: ['approvals'] });

// AFTER:
queryClient.resetQueries();   // clears all, triggers immediate refetch of active queries
```

### Source Tracing

| Change | Source |
|--------|--------|
| All 14 AsyncStorage keys | Enumerated from grep of full codebase |
| `queryClient.clear()` at sign-out | `_layout.tsx` call site |
| `queryClient.resetQueries()` | Replaces wrong key invalidation in modal.tsx |

---

## Test Plan

### `clearAll` — removes all keys

**Happy Path:**
- After `clearAll()`, `AsyncStorage.getItem` for all 14 keys returns null

**Edge Cases:**
- Keys that don't exist (not yet written) — `multiRemove` on missing keys is a no-op

**Mocks Needed:**
- `AsyncStorage` mock with pre-populated keys

### Modal env-switch — cache cleared

**Happy Path:**
- After env-switch, `queryClient.resetQueries()` called
- No stale data from previous environment served

**Mocks Needed:**
- `queryClient.resetQueries` spy

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/store/config.ts` | modify | `clearAll` uses `multiRemove` with all 14 keys |
| `app/_layout.tsx` | modify | Call `queryClient.clear()` + cancel notifications after `clearAll()` |
| `app/modal.tsx` | modify | Replace wrong invalidation with `queryClient.resetQueries()` |
| `src/__tests__/store/config.test.ts` | create or modify | Verify all 14 keys cleared |

---

## Edge Cases to Handle

1. **Key constants are defined in different files** — `clearAll` in `config.ts` can't import the constants from `useHoursData.ts` etc. without creating import cycles. Use the raw string literals directly in `clearAll`, matching the constants exactly.
2. **TanStack persister key** — The `@tanstack/query-async-storage-persister` may write its own key to AsyncStorage. If `queryClient.clear()` is called, the persister's cached data is invalidated on next load. No manual removal needed.
3. **Push token unregistration race** — If the unregister call fails, the server still has the old token. This is acceptable; the next registration will overwrite it.

---

## Open Questions

None remaining.
