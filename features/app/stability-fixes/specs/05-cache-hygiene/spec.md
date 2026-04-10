# Cache Hygiene

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What is Being Built

This spec fixes two related cache hygiene bugs that cause stale data to persist when it should not:

1. **Sign-out cache leak** (`clearAll` gap): `clearAll()` in `src/store/config.ts` removes only 3 of 14 AsyncStorage keys. The remaining 11 keys — containing hours, earnings, AI%, weekly history, push token, and notification IDs — survive across sign-out. If a second user signs in on the same device, they see the first user's stale data until fresh API data loads, creating a privacy concern.

2. **Modal env-switch no-op** (wrong query key): `app/modal.tsx` attempts to clear query cache on QA↔prod environment switch by calling `queryClient.invalidateQueries({ queryKey: ['hours'] })` and `queryClient.invalidateQueries({ queryKey: ['approvals'] })`. No registered query uses either of those exact keys. The actual keys include `['timesheet', weekStart, userId]`, `['payments', weekStart, userId]`, `['approvals', teamId, weekStart]`, etc. The invalidation silently does nothing; old-environment data persists for up to 15 minutes (the configured staleTime).

### How It's Fixed

**FR1 — clearAll removes all 14 keys**: Replace the 3-key `removeItem` chain in `clearAll()` with a single `AsyncStorage.multiRemove([...all 14 keys...])` call. The raw string literals are used directly in `config.ts` (no cross-file constant imports to avoid potential import cycles).

**FR2 — Call site clears TanStack Query cache on sign-out**: The call site in `app/_layout.tsx` calls `queryClient.clear()` immediately after `clearAll()`, and also calls `Notifications.cancelAllScheduledNotificationsAsync()` to clean up scheduled notifications. This keeps `config.ts` free of React/TanStack dependencies.

**FR3 — Modal env-switch uses `resetQueries()`**: Replace the two broken `invalidateQueries` calls in `app/modal.tsx` with a single `queryClient.resetQueries()`. This clears all cached query data and triggers immediate refetch for any active queries — exactly what an environment switch requires.

---

## Out of Scope

1. **Push token server-side unregistration** — When a user signs out, the push token stored on the Crossover/Railway server is not explicitly unregistered. If the unregister call fails it would delay sign-out; the next registration will overwrite the old token. **Descoped:** Acceptable risk; no separate spec needed.

2. **TanStack persister AsyncStorage key cleanup** — `@tanstack/query-async-storage-persister` writes its own key (e.g. `REACT_QUERY_OFFLINE_CACHE`) to AsyncStorage. This key is not included in `clearAll()`. When `queryClient.clear()` is called at the sign-out call site, the in-memory cache is cleared and the persisted cache is invalidated on next load because the config is gone. **Descoped:** Handled implicitly; manual removal not needed.

3. **Adding new AsyncStorage key constants centrally** — A possible refactor would export all key constants from a single `src/store/keys.ts` file so `clearAll` can import them without cycles. **Deferred to future refactor:** Out of scope for this surgical bug fix. The raw string literals in `clearAll` are the correct approach here.

4. **Notification permission revocation on sign-out** — Cancelling scheduled notifications and clearing the stored notification IDs is in scope (handled by the call site). Revoking OS-level notification permissions is not. **Descoped:** Platform-level permission management is not part of sign-out flow.

5. **Per-query cache invalidation in env-switch** — An alternative approach would enumerate every specific query key and invalidate them individually. **Descoped:** `queryClient.resetQueries()` is sufficient and simpler; enumeration would be brittle as new queries are added.

---

## Functional Requirements

### FR1 — clearAll removes all 14 AsyncStorage keys

`clearAll()` in `src/store/config.ts` must remove all known AsyncStorage keys in a single atomic call.

**Implementation:**

```typescript
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

**Success Criteria:**
- After `clearAll()` resolves, `AsyncStorage.getItem` for all 14 keys returns `null`
- `AsyncStorage.multiRemove` is called with exactly 14 keys (not 3)
- Keys not yet written (missing from storage) are silently skipped — no error thrown
- Signature remains `async clearAll(): Promise<void>` — no parameter changes

---

### FR2 — Sign-out call site clears TanStack Query cache and cancels notifications

`app/_layout.tsx` (or wherever `clearAll` is called on sign-out/auth failure) must:
1. Await `clearAll()`
2. Call `queryClient.clear()` to wipe in-memory TanStack Query cache
3. Call `await Notifications.cancelAllScheduledNotificationsAsync()` to cancel pending notifications

**Success Criteria:**
- `queryClient.clear()` is called at the sign-out call site after `clearAll()` resolves
- `Notifications.cancelAllScheduledNotificationsAsync()` is called at the sign-out call site
- `config.ts` has no import of `QueryClient`, React, or TanStack — it remains a pure AsyncStorage module
- If either `queryClient.clear()` or `cancelAllScheduledNotificationsAsync()` throws, it does not prevent the rest of sign-out from completing (use try/catch or sequential calls that don't gate routing)

---

### FR3 — Modal env-switch clears all query cache

`app/modal.tsx` must replace the two incorrect `invalidateQueries` calls with `queryClient.resetQueries()`.

**Implementation:**

```typescript
// BEFORE (broken — no query uses ['hours'] or ['approvals'] exact keys):
queryClient.invalidateQueries({ queryKey: ['hours'] });
queryClient.invalidateQueries({ queryKey: ['approvals'] });

// AFTER:
queryClient.resetQueries();
```

**Success Criteria:**
- `queryClient.resetQueries()` is called when the environment is switched (QA↔prod)
- `queryClient.invalidateQueries({ queryKey: ['hours'] })` is removed
- `queryClient.invalidateQueries({ queryKey: ['approvals'] })` is removed
- Active queries (timesheet, payments, approvals, etc.) immediately refetch from the new environment after reset
- No stale-environment data survives in cache after env-switch

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/store/config.ts` | Contains `clearAll()`, `CONFIG_KEY`, `USERNAME_KEY`, `PASSWORD_KEY` constants |
| `app/_layout.tsx` | Calls `clearAll()` on sign-out/auth failure; has `queryClient` in scope |
| `app/modal.tsx` | Environment switch UI; calls broken `invalidateQueries` |
| `src/hooks/useHoursData.ts` | Defines `CACHE_KEY = 'hours_cache'` |
| `src/hooks/useAIData.ts` | Defines `CACHE_KEY = 'ai_cache'` and `PREV_WEEK_KEY = 'previousWeekAIPercent'` |
| `src/hooks/useEarningsHistory.ts` | Defines `CACHE_KEY = 'earnings_history_v1'` |
| `src/lib/weeklyHistory.ts` | Defines `WEEKLY_HISTORY_KEY = 'weekly_history_v2'` |
| `src/lib/pushToken.ts` | Defines `PUSH_TOKEN_KEY = 'push_token'` |
| `src/lib/aiAppBreakdown.ts` | Defines `APP_HISTORY_KEY = 'ai_app_history'` |
| `src/hooks/useScheduledNotifications.ts` | Defines `WIDGET_DATA_KEY = 'widget_data'`, `THURSDAY_NOTIF_ID_KEY`, `MONDAY_NOTIF_ID_KEY` |
| `src/notifications/handler.ts` | Defines `PREV_APPROVAL_COUNT_KEY = 'prev_approval_count'` |

### Files to Create/Modify

| File | Action | Change |
|------|--------|--------|
| `src/store/config.ts` | **Modify** | Replace 3-key `removeItem` calls with `AsyncStorage.multiRemove([...14 keys...])` |
| `app/_layout.tsx` | **Modify** | Add `queryClient.clear()` and `Notifications.cancelAllScheduledNotificationsAsync()` after `clearAll()` at sign-out call site |
| `app/modal.tsx` | **Modify** | Remove two broken `invalidateQueries` calls; replace with `queryClient.resetQueries()` |
| `src/__tests__/store/config.test.ts` | **Create or modify** | Tests for `clearAll` covering all 14 keys |

### Data Flow

**Sign-out flow (after fix):**
```
User taps Sign Out / Auth failure detected
  └── _layout.tsx:
        1. await clearAll()
              └── AsyncStorage.multiRemove([14 keys])   ← removes all user data
        2. queryClient.clear()                          ← wipes TanStack in-memory cache
        3. await Notifications.cancelAllScheduledNotificationsAsync()
        4. router.replace('/auth')                      ← redirect to login
```

**Environment switch flow (after fix):**
```
User toggles QA↔prod in modal.tsx
  └── saves new env to config
  └── queryClient.resetQueries()     ← clears all query data, triggers refetch
  └── active queries refetch from new base URL
```

**Key constant mapping (used in clearAll):**

| Raw string | Constant | Defined in |
|-----------|----------|------------|
| `'crossover_config'` | `CONFIG_KEY` | `config.ts` |
| `'crossover_username'` | `USERNAME_KEY` | `config.ts` |
| `'crossover_password'` | `PASSWORD_KEY` | `config.ts` |
| `'hours_cache'` | `CACHE_KEY` | `useHoursData.ts` |
| `'ai_cache'` | `CACHE_KEY` | `useAIData.ts` |
| `'previousWeekAIPercent'` | `PREV_WEEK_KEY` | `useAIData.ts` |
| `'earnings_history_v1'` | `CACHE_KEY` | `useEarningsHistory.ts` |
| `'weekly_history_v2'` | `WEEKLY_HISTORY_KEY` | `weeklyHistory.ts` |
| `'push_token'` | `PUSH_TOKEN_KEY` | `pushToken.ts` |
| `'ai_app_history'` | `APP_HISTORY_KEY` | `aiAppBreakdown.ts` |
| `'widget_data'` | `WIDGET_DATA_KEY` | `useScheduledNotifications.ts` |
| `'notif_thursday_id'` | `THURSDAY_NOTIF_ID_KEY` | `useScheduledNotifications.ts` |
| `'notif_monday_id'` | `MONDAY_NOTIF_ID_KEY` | `useScheduledNotifications.ts` |
| `'prev_approval_count'` | `PREV_APPROVAL_COUNT_KEY` | `handler.ts` |

### Edge Cases

1. **Keys not yet written**: `AsyncStorage.multiRemove` silently skips keys that don't exist — no error thrown for fresh installs or partially initialized state.

2. **Import cycle prevention**: `clearAll` in `config.ts` uses raw string literals for the 14 keys rather than importing constants from hook files. Hook files import from `config.ts`, so reverse imports would create cycles.

3. **TanStack persister key**: `@tanstack/query-async-storage-persister` writes its own cache key (e.g. `REACT_QUERY_OFFLINE_CACHE`). This is NOT included in `clearAll`'s key list. Calling `queryClient.clear()` at the call site clears in-memory cache; since `config` is gone, the persisted cache is effectively stale and will be ignored or overwritten on next login. No manual removal needed.

4. **Push token server state**: The stored `push_token` key is cleared by `clearAll`. The Railway server retains the token record until it expires or is overwritten by the next user's registration. This is acceptable — silent push delivery to the wrong device is benign (the notification is dropped if the app is not logged in as the token's owner).

5. **Notification cancellation failure**: If `cancelAllScheduledNotificationsAsync()` throws (e.g. permission revoked), sign-out should still complete. The routing away from the authenticated screens effectively prevents stale notifications from triggering visible effects.

6. **queryClient.resetQueries vs clear in modal**: `resetQueries()` (not `clear()`) is used in the modal because it preserves the query structure while clearing data — active query observers immediately trigger refetches. `clear()` removes all query registrations, which could cause observers to stop watching. `resetQueries()` is the correct choice for env-switch.
