# Feature: Stability Fixes — Bug Batch April 2026

## Feature ID

`stability-fixes`

## Metadata

| Field | Value |
|-------|-------|
| **Domain** | app |
| **Feature Name** | Stability Fixes |
| **Contributors** | @jaime-alvarez-trilogy |

## Files Touched

### API Layer
- `src/api/client.ts` (modify)
- `src/lib/pushToken.ts` (modify)

### Hours / Deadline Logic
- `src/lib/hours.ts` (modify)
- `app/(tabs)/index.tsx` (modify)

### Hooks
- `src/hooks/useHoursData.ts` (modify)
- `src/hooks/__tests__/useHoursData.test.ts` (create)
- `src/hooks/useAIData.ts` (modify)
- `src/hooks/useScheduledNotifications.ts` (modify)

### Config / Cache
- `src/store/config.ts` (modify)
- `app/modal.tsx` (modify)

### Approvals
- `src/lib/approvals.ts` (modify)

## Table of Contents

- [Feature Overview](#feature-overview)
- [Intended State](#intended-state)
- [System Architecture](#system-architecture)
- [Changelog of Feature Specs](#changelog-of-feature-specs)

## Feature Overview

### Summary

Seven targeted bug fixes addressing crashes, data integrity issues, and UX regressions found in a comprehensive April 2026 code review. All fixes are surgical — no refactors, no new features.

### Problem Statement

The codebase review identified 11 bugs ranging from crash-risk to silent data leaks. These are grouped into 7 independent specs based on file locality. Before wider TestFlight distribution or App Store review, the following issues must be resolved:

1. `apiGet`/`apiPut` throw raw `TypeError` on network failure — callers expect `NetworkError`
2. Push token registration silently ignores server errors
3. Deadline countdown frozen at mount time; urgency banner uses Sunday while countdown uses Thursday
4. `useHoursData` returns infinite loading state when exactly one of two queries fails
5. `useAIData` stale closure fires 7 extra API calls on every refresh
6. Sign-out only clears 3 of 14 AsyncStorage keys; prior user's data leaks to next user
7. First-install users get zero Thursday notifications their first week
8. Past days with 0 hours display as "future" (grayed out) instead of as real zero-work days
9. Modal env-switch invalidates wrong query key; stale env data persists 15 minutes
10. `parseOvertimeItems` crashes with undefined on malformed API response
11. `clearAll` + modal don't clear TanStack Query cache on sign-out/env-switch

### Goals

- All API calls throw typed errors (`NetworkError`, `AuthError`, `ApiError`) — no raw `TypeError` escapes
- One canonical Thursday deadline used everywhere hours remaining is computed
- Countdown re-ticks every 60 seconds while app is foregrounded
- `useHoursData` falls back to cache if either query fails (not only when both fail)
- `useAIData` fires at most 1 previous-week fetch per app session, not on every refresh
- `clearAll` removes all 14 known AsyncStorage keys + clears TanStack Query cache
- New installs schedule the Thursday notification on first data load
- Zero-hour past days display as real zero bars in the daily chart
- Modal env-switch triggers full cache invalidation for all affected query keys
- `parseOvertimeItems` uses optional chaining and filters null candidates

### Non-Goals

- No new UI features — these are pure bug fixes
- No changes to the Railway server or push notification infrastructure
- No changes to the API schemas or Crossover endpoints
- No changes to widget data format

## Intended State

When complete, the app:

1. **Never crashes** on network loss during approvals — approval actions roll back UI optimistically and surface a typed error to the user
2. **Shows a single consistent deadline** — both the "X remaining" metric and the countdown pill count down to Thursday 23:59:59 UTC (Crossover's timesheet cutoff). After Friday, both advance to next Thursday.
3. **Countdown updates in real time** — a 60-second tick updates the countdown and pacing signal while the screen is visible; no frozen clock
4. **Recovers gracefully from partial API failure** — if timesheet succeeds but payments fails (or vice versa), the hours screen shows cached data with a stale indicator rather than an infinite spinner
5. **AI tab refreshes efficiently** — previous-week data is fetched at most once per session; the stale-closure bug is removed
6. **Sign-out is clean** — every AsyncStorage key and all TanStack Query data is cleared; the next user to log in sees no prior account's data
7. **Thursday notification arrives on week 1** — notification scheduling does not depend on widget data being written first
8. **Daily chart shows honest zeros** — a day where you worked 0 hours shows a real (not grayed-out) zero bar
9. **Env-switch is instant** — switching QA↔prod clears all cached query data immediately
10. **Approval list never crashes on malformed API data** — overtime items with missing candidate fields are skipped/filtered rather than throwing

### Key Behaviors

1. **Typed network errors everywhere**: `apiGet`/`apiPut` wrap `fetch()` in try/catch and convert `TypeError` → `NetworkError`
2. **Thursday-only deadline**: `calculateHours()` computes `deadline` and `timeRemaining` to Thursday; `computeDeadlineCountdown()` already correct; both agree
3. **60-second tick**: `useEffect` + `setInterval(60_000)` in index.tsx drives `now` state; `countdown` and `pacing` depend on `now`
4. **Either-error cache fallback**: `useHoursData` uses `eitherError` (not `bothError`) to trigger cache/error path
5. **Ref-based previous week tracking**: `useAIData` uses `useRef` for `previousWeekPercent` so the check is always fresh without adding it to `useCallback` deps
6. **Full clearAll**: Removes all 14 AsyncStorage keys; call site in `_layout.tsx` calls `queryClient.clear()` separately (keeps `config.ts` free of React/TanStack coupling)
7. **Bootstrap notifications**: `scheduleAll` extracts the Thursday reminder into a path that only needs permission, not widget data
8. **isFuture = !entry**: A day with an entry (even 0 hours) is never future

## System Architecture

### Component Structure

```
Hours / Deadline
  calculateHours() [src/lib/hours.ts]
    └── getThursdayDeadlineGMT()   ← NEW: replaces getSundayMidnightGMT call
  computeDeadlineCountdown() [src/lib/hours.ts]   (already Thursday, no change)
  index.tsx
    ├── useEffect → setInterval(60s) → setNow(new Date())
    ├── countdown = useMemo(..., [now])
    └── pacing    = useMemo(..., [data?.total, weeklyLimit, now])

API Layer
  apiGet / apiPut [src/api/client.ts]
    └── try/catch fetch → throw NetworkError on TypeError

Cache / Sign-out
  clearAll(queryClient?) [src/store/config.ts]
    └── removes all 14 keys + queryClient.clear()
  modal.tsx env-switch
    └── queryClient.resetQueries() or invalidate actual keys

AI Data
  useAIData.ts
    └── prevWeekPercentRef = useRef(undefined)
        read ref.current inside fetchData (no stale closure)
```

### Data Flow

```
Crossover API ──► apiGet/apiPut (NetworkError-safe)
                      │
               useHoursData.ts
                 ├─ timesheetQuery
                 ├─ paymentsQuery
                 └─ eitherError → cache fallback (not bothError)
                      │
               calculateHours()
                 └─ getThursdayDeadlineGMT() → HoursData.deadline / timeRemaining
                      │
               index.tsx
                 ├─ now (60s tick)
                 ├─ countdown = computeDeadlineCountdown(now)
                 └─ pacing = computePacingSignal(..., now)
```

## Changelog of Feature Specs

| Date | Spec | Description |
|------|------|-------------|
| 2026-04-09 | [01-api-resilience](specs/01-api-resilience/spec.md) | Wrap fetch in NetworkError; check pushToken response.ok |
| 2026-04-09 | [02-deadline-clock](specs/02-deadline-clock/spec.md) | Unify Thursday deadline; add 60s countdown tick; fix isFuture |
| 2026-04-09 | [03-hours-resilience](specs/03-hours-resilience/spec.md) | useHoursData either-error cache fallback |
| 2026-04-09 | [04-ai-data-closure](specs/04-ai-data-closure/spec.md) | Fix stale closure in useAIData previousWeekPercent |
| 2026-04-09 | [05-cache-hygiene](specs/05-cache-hygiene/spec.md) | clearAll all 14 keys + modal proper invalidation |
| 2026-04-09 | [06-notification-bootstrap](specs/06-notification-bootstrap/spec.md) | Schedule Thursday notification without widget data dependency |
| 2026-04-09 | [07-approvals-safety](specs/07-approvals-safety/spec.md) | parseOvertimeItems null guards via optional chaining |
