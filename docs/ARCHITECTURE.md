# Hourglass — Architecture Reference

**Last mapped:** 2026-05-22
**Scope:** `hourglassws/` (Expo iOS app). Excludes deprecated Scriptable widgets at the repo root.

A single document for understanding how the app fits together before touching any cross-cutting subsystem. Every section is keyed to file:line so claims are verifiable.

## Contents

1. [Notification Lifecycle](#1-notification-lifecycle)
2. [Push & Refresh Pipeline](#2-push--refresh-pipeline)
3. [State Stores Inventory](#3-state-stores-inventory)
4. [Cross-System Invalidation](#4-cross-system-invalidation)
5. [Screens & Routes (Expo Router)](#5-screens--routes-expo-router)
6. [Module Boundaries](#6-module-boundaries)
7. [Widget Data Contract](#7-widget-data-contract)
8. [Reference: Known Issues & Risk Surfaces](#8-reference-known-issues--risk-surfaces)

---

## 1. Notification Lifecycle

Four notification pathways. Three are scheduled local notifications managed by `useScheduledNotifications`; one is a push-triggered immediate notification handled in the background.

### 1.1 Triggers

| Name | Source | Trigger Mechanism | Content |
|---|---|---|---|
| Thursday Deadline Reminder | `src/hooks/useScheduledNotifications.ts:34-79` | Calendar trigger, iOS weekday 5 (Thu) 18:00 **local time**, repeats: false | "Hours Deadline Tonight" / `hoursRemaining` formatted |
| Monday Weekly Summary | `src/hooks/useScheduledNotifications.ts:90-133` | Calendar trigger, iOS weekday 2 (Mon) 09:00 **local time**, repeats: false | "Last Week Summary" / earnings + hours + optional AI% |
| Monday Approval Expiry (manager) | `src/hooks/useScheduledNotifications.ts:145-196` | Calendar trigger, iOS weekday 2 (Mon) 09:00 **UTC**, repeats: false | "Approvals Expiring Today" / "N pending approval(s)" |
| New Approvals (instant) | `src/notifications/handler.ts:51-59` (via `handleBackgroundPush`) | Immediate (`trigger: null`); fired in response to silent push | "New Approvals" / "N item(s) pending approval" |

Note the timezone mix: Thursday + Monday summary are local-time triggers; Monday expiry uses UTC because the underlying 3pm UTC approval deadline is a server-side cutoff.

### 1.2 The `scheduleAll()` function

`src/hooks/useScheduledNotifications.ts:219-255`. The orchestrator that runs all three local schedules.

**Call sites:**
- Hook mount (`:258`)
- Every `AppState` 'active' transition (`:261-265`)

**Execution flow:**

1. **Re-entry guard** (intra-hook). `inFlightRef: useRef(false)`. Set true on entry, reset in outer `finally`. Added in commit `bebfb0f` (spec 01-flood-guard).
   - **Protects against**: rapid back-to-back AppState 'active' events spawning concurrent runs from the same hook instance.
   - **Does NOT protect against**: a push handler running `scheduleLocalNotification` concurrently — that's `withScheduleLock`'s job (step 4).
2. **Permission check**. `getPermissionsAsync()`. Returns silently if not granted — sweep, lock, and the three scheduled notifications are all skipped.
3. **Orphan sweep** (`sweepOrphanNotifications`, `src/lib/scheduleLock.ts`). Spec 07. Iterates `getAllScheduledNotificationsAsync()`, cancels any `hourglass:*` identifier not in `EXPECTED_IDENTIFIERS`, then `multiRemove`s the legacy `notif_*_id` AsyncStorage keys. Runs outside the lock so contention doesn't block cleanup.
4. **Schedule lock** (`withScheduleLock`, AsyncStorage key `notif_schedule_lock`, stale-after-30s). Spec 07. Wraps the three scheduler calls below — coordinates against `handleBackgroundPush.scheduleLocalNotification` running concurrently. If contended, the wrapped block is skipped (best-effort; no throw).
5. **hoursRemaining read** (inside the lock). Defaults to `1` (positive sentinel — ensures Thursday reminder fires on fresh install before any data has been fetched). Attempts to parse `widget_data` from AsyncStorage and override; parse failure preserves the sentinel.
6. **Thursday** (inside the lock). Skipped if `hoursRemaining <= 0` (target hit). Calls `scheduleNotificationAsync({ identifier: 'hourglass:thursday', … })` — iOS replaces any prior same-id schedule.
7. **Monday summary** (inside the lock). Unconditional — has its own internal guards (`<2` snapshots, `0` hours last week). Identifier `hourglass:monday-summary`.
8. **Monday expiry** (inside the lock). Passed `isManager` flag; internally gates on Monday before 15:00 UTC and `pendingCount > 0`. Identifier `hourglass:monday-expiry`.
9. **Error handling**. All errors swallowed silently inside `scheduleAll`. `inFlightRef` cleared in outer `finally`.

### 1.3 Dedup state

| Notification | Storage | Mechanism |
|---|---|---|
| Thursday | iOS-managed (identifier `hourglass:thursday`) | Same-id replace. Spec 07. Orphan sweep cancels any non-expected `hourglass:*` at every `scheduleAll`. |
| Monday summary | iOS-managed (identifier `hourglass:monday-summary`) | Same-id replace. Spec 07. |
| Monday expiry | iOS-managed (identifier `hourglass:monday-expiry`) | Same-id replace. Spec 07. |
| Cross-handler coordination | AsyncStorage (`notif_schedule_lock`) | `withScheduleLock` (`src/lib/scheduleLock.ts`). Spec 07. Best-effort mutex; stale-after-30s. Wraps `scheduleAll` and `handleBackgroundPush.scheduleLocalNotification`. |
| New Approvals push | AsyncStorage (`prev_approval_ids`, `src/notifications/handler.ts:18`) | Set difference: fire `scheduleLocalNotification(newIds.length)` when `currentIds \ prevIds` is non-empty. First-ever read seeds without firing. Resolved in spec `06-push-dedup`. |

Calendar-triggered notifications rely on iOS same-id replace (no AsyncStorage ID tracking — eliminated in spec 07). The push-triggered approval notification uses ID-set diff (no cancel/reschedule needed since it's a transient `trigger: null` local). The legacy AsyncStorage keys `notif_thursday_id` / `notif_monday_id` / `notif_expiry_id` are no longer read or written; `sweepOrphanNotifications` `multiRemove`s them as one-shot migration cleanup.

### 1.4 Permission flow

- **Request**: `src/lib/pushToken.ts:22-40` (`registerPushToken`). Called once from `app/_layout.tsx:95-99` when `config.setupComplete` is true. Uses `requestPermissionsAsync()`. On failure, push token is never registered with the ping server.
- **Check**: `useScheduledNotifications.ts:224-225` uses `getPermissionsAsync()` on every foreground (no re-prompt).
- **Foreground handler**: `app/_layout.tsx:48-54`. `shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false`. Set at module scope.
- **Background listener**: `app/_layout.tsx:101-108` calls `registerBackgroundPushHandler()` (`src/notifications/handler.ts:65-67`) which wires `addNotificationReceivedListener(handleBackgroundPush)`. Unsubscribed on unmount.

### 1.5 iOS categories / actions

None. No custom `setNotificationCategoryAsync` registrations, no actionable approve/reject buttons. Tapping a notification opens the app.

### 1.6 Test coverage

- `src/hooks/__tests__/useScheduledNotifications.test.ts`
  - FR2 Thursday / FR3 Monday summary / FR4 Monday expiry: weekday/time guards, content shape, deterministic identifier (`hourglass:*`) on every `scheduleNotificationAsync` call — spec 07.
  - 06-notification-bootstrap: sentinel guard
  - 01-flood-guard: `inFlightRef` entry/finally pattern (still asserted; spec 07 preserves the guard)
  - 07-notification-lifecycle: sweep + lock wiring (sweep before lock, lock wraps scheduler calls, permission gate before both, `inFlightRef` first)
- `src/__tests__/notifications/handler.test.ts`
  - `handleBackgroundPush`: bg_refresh filter, fetch + widget update, ID-set dedup firing, manager gate, error swallow (spec 06)
  - FR6 lock wrapping: `withScheduleLock` called only when newIds non-empty + isManager; contention skips notification but still calls `savePrevIds` (spec 07)
  - `scheduleLocalNotification`: title, body, immediate trigger
- `src/lib/__tests__/scheduleLock.test.ts` (spec 07)
  - `withScheduleLock`: claim, contention, stale-after-30s recovery, non-numeric values, get/set/remove failure paths
  - `sweepOrphanNotifications`: mixed list, all-expected/empty, legacy-key cleanup, get/cancel/multiRemove failure paths
- `app/__tests__/layout-notifications.test.tsx`
  - Foreground handler config, `registerPushToken` lifecycle, background listener cleanup

---

## 2. Push & Refresh Pipeline

Silent push wakes the app, which fetches fresh data and updates the widget without rendering React.

### 2.1 Server side (Railway)

- **Sender** — `server/push.ts:34-83`. `sendPushBatch()` chunks tokens into batches of ≤100, posts to `https://exp.host/--/api/v2/push/send` with `data: { type: 'bg_refresh' }` and `_contentAvailable: true`. Returns sent/failed counts plus `DeviceNotRegistered` tokens for cleanup.
- **Dispatcher** — `server/cron.ts:14-47`. `runCron()` runs on `*/30 * * * *` via `node-cron`. Fetches registered tokens from DB, calls `sendPushBatch`, deletes stale tokens.

### 2.2 On-device flow

1. Silent push arrives. `expo-notifications` invokes the listener registered at `src/notifications/handler.ts:65-67`.
2. `handleBackgroundPush(notification)` (`handler.ts:51-84`) filters on `data.type === 'bg_refresh'`.
3. `fetchFreshData()` — loads config + credentials from SecureStore, fetches timesheet + payments + work diary + approval items in parallel, returns a `CrossoverSnapshot`.
4. `updateWidgetData(snapshot)` — writes `widget_data` to AsyncStorage and (on iOS) updates the widget App Group UserDefaults via `expo-widgets`.
5. **Manager ID-set diff** (`handler.ts:65-82`, spec `06-push-dedup`): if `config.isManager`, build `currentIds = new Set(approvalItems.map(it => it.id))`, read persisted `prev_approval_ids` via `getPrevIds()`. If absent/corrupt → seed and return (no notification). Otherwise compute `newIds = currentIds \ prevIds`; if non-empty, fire `scheduleLocalNotification(newIds.length)`. Then write back the full `currentIds` set, replacing prior state.

**Note**: this is the only background code path. It bypasses React entirely. The widget refreshes from AsyncStorage; the app picks up changes only on next foreground (TanStack Query will rehydrate from its persisted cache on cold start).

---

## 3. State Stores Inventory

Four persistence layers. The same logical data sometimes appears in multiple layers (e.g. hours data lives in `hours_cache` AsyncStorage **and** TanStack Query's persisted cache **and** in-memory query state).

### 3.1 SecureStore (encrypted, on-device only)

| Key | Type | Read/Write | Purpose |
|---|---|---|---|
| `crossover_username` | string | `loadCredentials` / `saveCredentials` (`src/store/config.ts:25`) | Username for `/api/v3/token` |
| `crossover_password` | string | same | Password for `/api/v3/token` |

`secureGet`/`secureSet` falls back to AsyncStorage on web/simulator where SecureStore is unavailable.

### 3.2 AsyncStorage

| Key | Shape | Writer | Reader |
|---|---|---|---|
| `crossover_config` | JSON `CrossoverConfig` | `saveConfig` (post-onboarding) | `useConfig` |
| `hours_cache` | JSON `{ data: HoursData, cachedAt }` | `useHoursData.ts:74` | `useHoursData.ts:40` on mount; failover when API fails |
| `ai_cache` | JSON `{ [YYYY-MM-DD]: TagData, _lastFetchedAt }` | `useAIData` (incremental per day) | `useAIData` on mount; pruned to current Mon–Sun window |
| `previousWeekAIPercent` | number | `useAIData` (Monday) | `useAIData` on mount (delta badge) |
| `app_history` | JSON array of `AppBreakdownEntry` | `src/lib/aiAppBreakdown.ts:123-138` | merged with fresh daily data |
| `widget_data` | JSON `WidgetData` | `src/widgets/bridge.ts:18` (`updateWidgetData`) | Android widget task handler; iOS reads via bridge |
| `weekly_history` | JSON array `WeekSnapshot[]` | `src/lib/weeklyHistory.ts:74-120` | `useScheduledNotifications` (Monday summary), `useOverviewData` |
| `notif_thursday_id` / `notif_monday_id` / `notif_expiry_id` | string | `useScheduledNotifications` | same; cancel-before-reschedule |
| `push_token` | string | `src/lib/pushToken.ts:15` | sent to Railway server on register; cleared on logout |
| `prev_approval_ids` | JSON `string[]` | `src/notifications/handler.ts` (`savePrevIds`) | set-difference dedup for instant approval notification. Legacy `prev_approval_count` is cleaned up on every write; both are in the `clearAll` wipe list. |
| `HOURGLASS_QUERY_CACHE` | TanStack Query persist payload | `PersistQueryClientProvider` (`app/_layout.tsx:80-83`) | full query cache, 24h max age |

### 3.3 TanStack Query

QueryClient configured at `app/_layout.tsx:68-76`: `staleTime: 15min`, retries 2, `gcTime: 24h`. Cache persisted to AsyncStorage key `HOURGLASS_QUERY_CACHE` via `PersistQueryClientProvider`.

| queryKey | Source hook | Endpoint(s) | staleTime |
|---|---|---|---|
| `['config']` | `useConfig` (`:13`) | AsyncStorage `crossover_config` | Infinity (manual invalidate) |
| `['timesheet', weekStartDate, userId]` | `useTimesheet` (`:18`) | `fetchTimesheet()` | 15min |
| `['payments', weekStartDate, userId]` | `usePayments` (`:18`) | payments API | 15min |
| `['myRequests', assignmentId]` | `useMyRequests` | manual requests API | default |
| `['approvals']` | `useApprovalItems` (`:24`) | 6 parallel calls: manual + overtime × 3 weeks | manual invalidate after approve/reject |
| `['paymentHistory', from, to, userId]` | `usePaymentHistory` | payments history | default |
| `['earningsHistory', from, to, userId]` | `useEarningsHistory` | earnings ledger | default |

### 3.4 React Context

`src/contexts/OnboardingContext.tsx` — wraps the `(auth)` stack. Provides `useSetup()` result (step machine, pending credentials, pending config) so credential entry → environment select → setup → success share state without prop drilling. Transient; cleared once config is saved.

### 3.5 Widget shared storage

- **Android**: AsyncStorage key `widget_data` (same JSON as the app reads), accessed by the widget task handler in `src/widgets/android/widgetTaskHandler.ts`.
- **iOS**: App Group UserDefaults, written via `expo-widgets` `createWidget(...).updateTimeline(entries)` (`src/widgets/bridge.ts:868-896`). The widget extension consumes a timeline of `{date, props}` entries.

---

## 4. Cross-System Invalidation

How a write at one layer reaches the others.

### 4.1 Approval action (manager)

1. UI fires `approveItem` / `rejectItem` from `useApprovalItems`.
2. Optimistic local state update — item removed from `optimisticItems` immediately.
3. API call to `approveManual` / `rejectManual` (`src/api/approvals.ts`).
4. On settle (success or failure): `queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })` (`useApprovalItems.ts:149, 191`).
5. Refetch → fresh 6-call parallel fetch (manual + overtime × current + 2 prior weeks).
6. `useWidgetSync` (mounted in `app/(tabs)/_layout.tsx`) observes `approvalItems` in deps → calls `updateWidgetData`.
7. Widget refreshes (Android via task handler reading AsyncStorage; iOS via timeline update).

### 4.2 Hours refresh

1. `useTimesheet` + `usePayments` resolve.
2. `useHoursData` composes them, computes `HoursData`, writes `hours_cache`.
3. `useWidgetSync` observes `hoursData` → `updateWidgetData`.

### 4.3 Background push (manager)

1. Silent push → `handleBackgroundPush` → `fetchFreshData` (parallel fetch, no React).
2. `updateWidgetData` writes new snapshot.
3. If `newCount > prevCount`, fire local notification.
4. TanStack Query is **not** touched — on next foreground, queries are either still within `staleTime` (rehydrated from persisted cache) or refetched normally.

---

## 5. Screens & Routes (Expo Router)

### 5.1 Route tree

```
app/
├── _layout.tsx                    Root layout
├── +not-found.tsx                 404 fallback
├── modal.tsx                      Settings modal (presentation: 'modal')
├── (tabs)/
│   ├── _layout.tsx                Tab navigator
│   ├── index.tsx                  Home / Hours
│   ├── overview.tsx               4W / 12W / 24W trends
│   ├── ai.tsx                     AI & BrainLift
│   ├── approvals.tsx              Requests (team + personal)
│   └── explore.tsx                Hidden placeholder (href: null)
└── (auth)/
    ├── _layout.tsx                Auth stack + OnboardingProvider
    ├── welcome.tsx
    ├── credentials.tsx
    ├── verifying.tsx              Auto-routes on step change
    ├── env-select.tsx             Prod vs QA
    ├── setup.tsx                  Hourly rate fallback
    └── success.tsx                Auto-pushes to (tabs)
```

### 5.2 Root layout

`app/_layout.tsx:154-164`. Provider stack (outermost → innermost):

`GestureHandlerRootView` → `PersistQueryClientProvider` (24h TTL) → `ThemeProvider` → router tree.

**Module-scope side effects**:
- `Notifications.setNotificationHandler` (`:48-54`)
- `SplashScreen.preventAutoHideAsync` (`:57`)

**Mount-time side effects** (run from the `RootLayout` component):
- Font preload (`:110-125`)
- `registerPushToken()` once after `setupComplete` (`:94-99`)
- `registerBackgroundPushHandler()` with cleanup (`:101-108`)
- `useRoleRefresh()` — periodic manager check (`:90`)
- `useScheduledNotifications()` (`:91`)
- Auth gating effect (`:135-143`): redirects between `(auth)/welcome` and `(tabs)` based on `config?.setupComplete` and current segment.

### 5.3 Tab layout

`app/(tabs)/_layout.tsx`. Platform-split rendering:

- **iOS** (`NativeTabs` from `expo-router/unstable-native-tabs`): native `UITabBarController` with glass pill on iOS 26+.
- **Android** (`Tabs` + custom `FloatingPillTabBar` at `:136-142`): default tab bar hidden, custom pill overlay; `contentStyle` adds `PILL_BOTTOM_OFFSET=112` padding.

`TAB_SCREENS` constant (`:50-56`): Home, Overview, AI, Requests + hidden `explore`. Approvals badge shown when `items.length > 0` (`:79`).

**Fire-and-forget data hooks called from the tab layout** (`:59-76`): `useHistoryBackfill`, `useHoursData`, `useAIData`, `useApprovalItems`, `useWeeklyHistory`, `useWidgetSync`. These warm the cache so individual tab screens render instantly.

### 5.4 Per-screen contract

| Screen | Route | Hooks | Endpoints | Manager gate |
|---|---|---|---|---|
| Home | `/(tabs)/index` | `useHoursData`, `useEarningsHistory`, `useAIData`, `useApprovalItems` | timesheet, payments, work-diary | `ApprovalUrgencyCard` (`index.tsx:271-276`) |
| Overview | `/(tabs)/overview` | `useOverviewData(4\|12\|24)`, `useEarningsHistory`, `useApprovalItems` | payments history, work-diary history | `ApprovalUrgencyCard` (`overview.tsx:365-371`) |
| AI | `/(tabs)/ai` | `useAIData`, `useAppBreakdown`, `useWeeklyHistory` | work-diary (per-day background fetch), local app-usage cache | none |
| Requests | `/(tabs)/approvals` | `useApprovalItems`, `useMyRequests`, `useConfig` | approvals/manual + overtime × 3 weeks | TEAM REQUESTS section (`approvals.tsx:304-339`); contributors see MY REQUESTS only |
| Settings | `/modal` | `useConfig` | auth/token, auth/buildConfig | dev toggles `devManagerView`, `devOvertimePreview` (dev-only). "Debug Log" section (Share / Clear buttons) visible to **all users** — spec 08. |

### 5.5 Auth gating

`app/_layout.tsx:135-143`:

```typescript
const inAuthGroup = segments[0] === '(auth)';
if (!config?.setupComplete && !inAuthGroup) router.replace('/(auth)/welcome');
else if (config?.setupComplete && inAuthGroup) router.replace('/(tabs)');
```

Splash screen held until `isLoading` resolves (`:128-132`).

### 5.6 Manager vs contributor

Detection (used at `index.tsx:170`, `overview.tsx:216`, `approvals.tsx:119`):

```typescript
const isManager = config?.isManager === true || config?.devManagerView === true;
```

Gated UI:
- `ApprovalUrgencyCard` on Home and Overview (manager + `approvalItems.length > 0`).
- TEAM REQUESTS section, Approve All button, team queue badge on Requests.
- Monday expiry notification (see §1.1).

---

## 6. Module Boundaries

### 6.1 Top-level

| Directory | Role |
|---|---|
| `app/` | Expo Router file-based routes (screens, layouts) |
| `src/` | All production app code (api, hooks, contexts, store, lib, components, widgets, notifications, types) |
| `components/`, `hooks/` (root) | **Legacy Expo Starter scaffolding** — themed-text, themed-view, use-color-scheme. Not used by the production app. Candidates for deletion. |
| `constants/theme.ts` | **Legacy** — superseded by `src/lib/colors.ts` |
| `server/` | Railway ping server (push dispatcher + cron) |
| `ios/`, `android/` | Native build artifacts |
| `assets/`, `dist/`, `patches/`, `scripts/` | Build / static assets |
| `__mocks__/`, `__tests__/` | Jest infrastructure + integration tests |

### 6.2 `src/` map

```
src/
├── api/               REST client + endpoint wrappers (no React)
├── store/             Persistent state (config + credentials)
├── lib/               Pure utilities (date math, calculations, formatting)
├── types/             TypeScript interfaces
├── hooks/             React Query + state hooks (data layer)
├── contexts/          Context providers (currently: OnboardingContext)
├── components/        Presentational components (~31 files)
├── widgets/           App ↔ widget bridge (iOS + Android)
└── notifications/     Push handler registration
```

### 6.3 `src/api/`

Pure async functions. No React, no hooks.

| File | Exports |
|---|---|
| `client.ts` | `getAuthToken` (cached), `mintAuthToken` (cache-bypass), `invalidateAuthToken`, `apiGet<T>`, `apiPut<T>` |
| `auth.ts` | `getProfileDetail`, `fetchAndBuildConfig`, `probeEnvironments` |
| `timesheet.ts` | `fetchTimesheet` (3-strategy fallback) |
| `approvals.ts` | `fetchPendingManual`, `fetchPendingOvertime`, `approveManual`, `rejectManual` |
| `payments.ts` | `fetchPaymentHistory` |
| `workDiary.ts` | `fetchWorkDiary` |
| `errors.ts` | `AuthError`, `NetworkError`, `ApiError` |

Auth token is **cached in module-scope memory** (`client.ts`, spec 04). First call mints via `POST /api/v3/token`; subsequent calls reuse the cached `userId:secret` string. Concurrent first-callers share a single in-flight mint (request dedup). `invalidateAuthToken()` wipes the cache; called from `app/modal.tsx` on sign-out and env switch. `apiGet`/`apiPut` accept an optional fifth `creds` arg that opts into single-retry on auth failure (401 or Tomcat HTML 5xx). `mintAuthToken` (exported) bypasses the cache for `probeEnvironments`. Empty response bodies (approve/reject PUTs) parsed as `undefined`. Base URL switched via `getApiBase(useQA)` from `src/store/config.ts`.

### 6.4 `src/hooks/` (21 files)

All data and stateful logic. Composition pattern: API call → React Query wrapper → optional AsyncStorage failover → derived domain object.

Major hooks:
- **Data**: `useTimesheet`, `usePayments`, `useHoursData`, `useAIData`, `useApprovalItems`, `useMyRequests`, `useOverviewData`, `useEarningsHistory`, `usePaymentHistory`, `useAppBreakdown`, `useWeeklyHistory`
- **Lifecycle**: `useAuth` (`useSetup`), `useConfig`, `useRoleRefresh`, `useHistoryBackfill`, `useListCascade`
- **System integration**: `useWidgetSync`, `useScheduledNotifications`
- **UI/animation**: `useScrubGesture`, `useStaggeredEntry`, `useFocusKey`

### 6.5 `src/lib/`

Pure functions, no state.

Notable:
- `hours.ts` — `calculateHours`, `getWeekStartDate`, `getUrgencyLevel`. Date math + urgency classification.
- `colors.ts` — design tokens for Skia canvas. Manually kept in sync with `tailwind.config.js`.
- `approvals.ts` — `parseManualItems`, `parseOvertimeItems`. Raw API → domain model.
- `ai.ts`, `aiAppBreakdown.ts`, `aiCone.ts`, `aiTier.ts` — AI% computation, app breakdown, tier classification.
- `weeklyHistory.ts` — snapshot persistence.
- `pushToken.ts` — Expo push token registration with Railway server.
- `approvalMeshSignal.ts`, `panelState.ts` — UI state machines.
- `devMock.ts` — `MOCK_TEAM_ITEMS` for `devManagerView` toggle.
- `log.ts` — local rolling error log (JSONL, 200 KB cap, 3s buffered flush). Spec 08. Imports only `expo-file-system/legacy` and `./redact`. Singleton `log` with `info/warn/error/flush/getLogFileUri/clear`. **Never throws** — I/O failures are swallowed; the logger cannot crash the app.
- `redact.ts` — pure deny-by-default redactor invoked at write time by `log.ts`. Drops PII-shaped keys (`password`, `auth*`, `*Id`, `username`, `email`, `memo`, `description`, `text`, `message`, `body`, `headers`); scrubs credential-shaped string values (`Basic …`, `Bearer …`, long base64, 32+-char tokens). Only primitive `string | number | boolean` survivors are written.

### 6.6 Layering (inferred — not lint-enforced)

```
app/ (screens)
  ↓
src/contexts/, src/hooks/         ←  composition layer
  ↓                                  (React Query lives here)
src/api/, src/store/, src/lib/    ←  pure / leaf layer
  ↓
src/types/
```

Rules observed in sampled imports:
- `src/api/*` imports `src/store`, `src/types`, `src/lib` only. No hooks or components.
- `src/store/*` imports only stdlib + types.
- `src/lib/*` imports only types + constants.
- `src/components/*` is presentational — data via props.

No ESLint rule enforces this; convention only.

### 6.7 Path alias

`tsconfig.json:8-11` defines `@/*` → `./*`. Used everywhere: `import { colors } from '@/src/lib/colors'`.

### 6.8 Babel

`babel.config.js`: NativeWind v4 (`jsxImportSource: 'nativewind'`, non-test), Reanimated plugin last. Test env uses vanilla React.

---

## 7. Widget Data Contract

The canonical handoff from app → widget. Defined in `src/widgets/types.ts:43-99`.

```typescript
WidgetData {
  // Display strings (pre-formatted by the app)
  hours: string                  // "32.5"
  hoursDisplay: string           // "32.5h"
  earnings: string               // "$1,300"
  earningsRaw: number
  today: string                  // "6.2h"
  hoursRemaining: string         // "7.5h left" | "2.5h OT"
  aiPct: string                  // "71%–75%" | "N/A"
  brainlift: string              // "3.2h"
  brainliftTarget: string        // "5h"
  todayDelta: string             // "+1.2h" | "-0.5h" | ""

  // State
  deadline: number               // Unix ms — Thursday 6pm EOW (used by widget timeline)
  cachedAt: number
  urgency: "none"|"low"|"high"|"critical"|"expired"
  paceBadge: "crushed_it"|"on_track"|"behind"|"critical"|"none"

  // User context
  isManager: boolean
  useQA: boolean
  pendingCount: number           // 0 for contributors

  // Weekly comparison
  weekDeltaHours: string         // "+2.1h" | "-3.4h" | ""
  weekDeltaEarnings: string      // "+$84" | "-$136" | ""

  // Action mode (max 3 items each)
  approvalItems: Array<{ id, name, hours, category: "MANUAL"|"OVERTIME" }>   // manager only
  myRequests:    Array<{ id, date, hours, memo, status: "PENDING"|"APPROVED"|"REJECTED" }>  // contributor only
  actionBg: string               // tint color for action cards

  // Bar chart — always exactly 7 entries, Mon[0]..Sun[6]
  daily: Array<{ day: string, hours: number, isToday: boolean, isFuture: boolean }>
}
```

### 7.1 Write path

`updateWidgetData(snapshot)` in `src/widgets/bridge.ts:18` writes the same JSON to:
- **AsyncStorage** `widget_data` (Android reads this directly via `readWidgetData()` at `:427-435`).
- **iOS App Group UserDefaults** via `expo-widgets` (`:868-896`): `createWidget('HourglassWidget', layoutJS).updateTimeline(entries)`.

### 7.2 iOS timeline

`buildTimelineEntries()` (`src/widgets/bridge.ts:389-418`) emits **96 entries** — 15-minute intervals across a 24-hour window. Each entry is `{ date, props: WidgetData }` with `urgency` recomputed for that timestamp vs `deadline`. This lets the widget visually transition through `low → high → critical → expired` without the extension having to wake.

### 7.3 iOS layout function

`src/widgets/bridge.ts:459-833` defines a ~900-line ES5 JS string compiled into the widget extension. Evaluated by the extension's JSContext to produce a SwiftUI tree. Implements three widget sizes (small/medium/large), deadline countdown, pace badge, glass cards, bar chart, approval rows, EOW urgency overlay.

---

## 8. Reference: Known Issues & Risk Surfaces

Not a TODO list — a catalog of things to remember when touching these subsystems.

### 8.1 Notification surfaces with no per-item dedup

- **Resolved** by spec `06-push-dedup`. `handler.ts` now persists `prev_approval_ids` (`Set<string>` serialized as JSON `string[]`) and fires `scheduleLocalNotification(newIds.length)` only when `currentIds \ prevIds` is non-empty. The legacy `prev_approval_count` key is removed on first write of the new key. First-ever read returns null and seeds without firing.
- **Residual risk**: a future widening of the approval-fetch window (analogous to commits `3636a64`, `8cedb63`) will still cause a one-shot burst — prior-window items appear as "new" to the dedup. Mitigation is procedural: any PR that widens the window should also clear `prev_approval_ids` as part of the deploy.

### 8.2 `inFlightRef` is intra-hook only

- **Resolved** by spec `07-notification-lifecycle`. `withScheduleLock` (`src/lib/scheduleLock.ts`) is the cross-handler layer; AsyncStorage key `notif_schedule_lock` (stale-after-30s) coordinates `scheduleAll` and `handleBackgroundPush.scheduleLocalNotification`. `inFlightRef` is preserved as intra-hook defense-in-depth.
- **Residual risk**: AsyncStorage operations are not atomic; two concurrent callers can both observe an absent lock and both run. Acceptable because the underlying scheduling is idempotent (deterministic identifiers, §8.3 resolution). True process-wide mutex would require native code.

### 8.3 Cancel + setItem is not atomic

- **Resolved** by spec `07-notification-lifecycle`. Calendar schedulers no longer track AsyncStorage IDs — each call passes a deterministic `identifier` (`hourglass:thursday`, `hourglass:monday-summary`, `hourglass:monday-expiry`). iOS replaces same-id schedules, so there is no cancel/setItem window. The legacy `notif_thursday_id` / `notif_monday_id` / `notif_expiry_id` keys are no longer referenced in code; `sweepOrphanNotifications` removes them as one-shot migration.

### 8.4 Calendar triggers persist past the app

- **Mitigated** by spec `07-notification-lifecycle`. On every `scheduleAll` mount, `sweepOrphanNotifications` calls `getAllScheduledNotificationsAsync()` and cancels any `hourglass:*` identifier not in `EXPECTED_IDENTIFIERS`. A reinstall (or any AsyncStorage wipe that leaves iOS schedules intact) is now self-healing on the next foreground.
- **Residual risk**: any new `hourglass:*` identifier introduced by a future spec must be added to `EXPECTED_IDENTIFIERS` in the same PR, or the sweep will quietly cancel it on next mount. Documented in `src/lib/scheduleLock.ts` JSDoc and `src/notifications/README.md` invariant 5.

### 8.5 ~~Auth token refetched every request~~ (resolved by spec 04)

Resolved 2026-05-28 by `04-auth-resilience` (resilience-fixes). `getAuthToken` (`src/api/client.ts:64`) now serves a module-scope `cachedToken`; concurrent first callers share a single in-flight mint via `mintInFlight`. `mintAuthToken` (exported) bypasses the cache for `probeEnvironments`. `invalidateAuthToken` is called from `app/modal.tsx` on sign-out (`handleSignOut` after `clearAll`) and env switch (`handleSwitchEnvironment` before `fetchAndBuildConfig`). `handleStatus` now recognizes Tomcat HTML 5xx (`content-type: text/html` on any `>= 500` response) as `AuthError(401, AUTH_HTML_500)` so the existing re-onboarding flow fires for expired tokens (the original CROSSOVER_API §15.F3 gap). Opt-in retry on `apiGet`/`apiPut` via optional fifth `creds` arg.

### 8.6 Two `components/` and two `hooks/` directories

Root-level `components/` and `hooks/` are Expo Starter scaffold leftovers. Production code lives in `src/components/` and `src/hooks/`. Imports from the root-level versions are legacy; check before adding new files in either spot.

### 8.7 Manager role can change mid-session

`useRoleRefresh` (`app/_layout.tsx:90`) re-checks `isManager` weekly (Mondays). UI gates like `ApprovalUrgencyCard` and the TEAM REQUESTS section read `config.isManager` directly; if role changes between mounts, screens may render with stale role until refetched.

### 8.8 TanStack Query persisted cache + AsyncStorage caches overlap

`hours_cache`, `ai_cache`, `widget_data`, `weekly_history`, and the `HOURGLASS_QUERY_CACHE` (full Query cache) all persist overlapping data. Manual AsyncStorage caches exist for instant-render on mount before queries resolve; Query persistence covers the rest. Clearing the Query cache does not clear the manual caches.

### 8.9 Observability: local error log only (no automatic phone-home)

Resolved 2026-05-28 by `08-observability-log` (resilience-fixes). The app's only post-ship debug surface is a local JSONL file at `documentDirectory + hourglass-debug.log` written by `src/lib/log.ts`. Every payload is redacted at write time by `src/lib/redact.ts` (deny-by-default key list; credential-shaped value scrubbers) and capped at 200 KB with mid-line-preserving rotation. Events leave the device **only** when the user invokes the "Share log" button in the Settings modal — there is no Sentry, no Crashlytics, no automatic upload, and the logger module imports zero network surface. Errors capture `err.constructor.name` only; `.message` text is never written.

**Residual surface**: call sites for `log.*` are not yet wired into the auth / push / onboarding paths — that wiring is deferred per spec 08's "Out of Scope §1" and tracked for follow-up commits in the affected specs.
