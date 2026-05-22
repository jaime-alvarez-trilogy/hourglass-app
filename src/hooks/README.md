# src/hooks/

The data layer. React Query wrappers around `src/api/*` calls, plus stateful logic (onboarding state machine, role refresh, scheduled notifications, widget sync, animations).

**Full map:** `docs/ARCHITECTURE.md` §3.3 (TanStack Query keys) and §6.4 (hooks inventory).

## What lives here

### Data hooks (React Query wrappers)
- `useTimesheet`, `usePayments`, `useHoursData` — current week hours + earnings
- `useAIData`, `useAppBreakdown` — AI% + BrainLift + per-app breakdown
- `useApprovalItems` — manager approval queue (6 parallel calls: manual + overtime × 3 weeks)
- `useMyRequests` — contributor's own pending/approved/rejected requests
- `useOverviewData(4|12|24)`, `useEarningsHistory`, `usePaymentHistory`, `useWeeklyHistory` — historical/aggregate views

### Lifecycle hooks
- `useAuth` (exports `useSetup`) — onboarding state machine; consumed via `OnboardingContext`
- `useConfig` — wraps `loadConfig` from `src/store/config.ts`
- `useRoleRefresh` — re-checks manager status weekly (Mondays)
- `useHistoryBackfill` — populates `weekly_history` on mount
- `useListCascade` — sequential async loading with failover

### System integration
- `useWidgetSync` — syncs `WidgetData` to AsyncStorage + iOS App Group whenever underlying data changes
- `useScheduledNotifications` — schedules Thursday/Monday local notifications (see `src/notifications/README.md`)

### UI / animation
- `useScrubGesture`, `useStaggeredEntry`, `useFocusKey` — Reanimated helpers

## Layering — what hooks may import

```
src/hooks/*  may import from:
  - src/api/*         (network calls)
  - src/store/*       (config / credentials)
  - src/lib/*         (pure utilities)
  - src/types/*       (interfaces)
  - @tanstack/react-query, react, etc.

src/hooks/*  must NOT import from:
  - src/components/*  (presentation only — hooks feed components, not the reverse)
  - app/*             (screens compose hooks, never the reverse)
```

See `docs/ARCHITECTURE.md` §6.6 for the full layering diagram.

## Invariants — do not break these

1. **Auth token is fetched on every API call.** No in-memory token cache exists. If you add caching, decide TTL, invalidation, and refresh-on-401 semantics explicitly. See `docs/ARCHITECTURE.md` §8.5.
2. **Manual AsyncStorage caches (`hours_cache`, `ai_cache`, etc.) overlap with the persisted Query cache.** Don't add a third cache layer for the same data. See §8.8.
3. **`useApprovalItems` mutations invalidate `APPROVALS_KEY` on settle (both success AND failure).** Optimistic updates are reverted by the refetch. Do not skip the invalidate.
4. **`useWidgetSync` runs as a side effect of data changes.** It must not throw or block rendering. Errors should be swallowed and logged.
5. **`useRoleRefresh` can change `config.isManager` mid-session.** Screens that gate on `isManager` may see stale role until next refetch. Don't assume role is fixed for the session.
6. **15-minute `staleTime` is the default for timesheet/payments queries.** If you change it, also update the persistent cache TTL (`PersistQueryClientProvider` in `app/_layout.tsx`).

## Before changing anything here

1. Read `docs/ARCHITECTURE.md` §3, §4, §6.4.
2. Establish baseline: `npm test -- src/hooks/__tests__/ src/__tests__/hooks/`.
3. Make change.
4. Re-run those tests + anything in `src/__tests__/` that exercises your hook's consumers (screens, widget sync, notifications).

## Common pitfalls

- Adding a new data hook without persisting failover. Most existing hooks write to a manual AsyncStorage cache so the UI renders instantly on cold start before queries resolve.
- Calling `queryClient.setQueryData` to "optimistically update" then forgetting to invalidate on settle.
- Reading `config` synchronously without going through `useConfig` — `config` can be `null` during initial load.
- Importing from `src/components/` (illegal under the layering rule).
