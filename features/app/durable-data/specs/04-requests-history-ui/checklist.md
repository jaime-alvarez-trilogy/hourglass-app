# Implementation Checklist

Spec: `04-requests-history-ui`
Feature: `durable-data`

Worktree: `hg-worktrees/sdk58`, branch `feat/sdk-58`.

- **Commit locally only.** No push, no PR, no `eas`/`asc.js`/OTA.
- **JS-only.** The fingerprint must stay `56d054fc723984e56892a367dca1efa79a9f8fad`. Never touch `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`.
- **Stage files by path.** Never `git add -A` / `.`.
- **Commits** use `test(FRn): …` / `feat(FRn): …` / `fix(04-requests-history-ui): …`. Write them with a HEREDOC and end them with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Index lock.** If `.git/index.lock` exists, wait ~3 s and retry (up to 5 times). Never delete it.
- **Base for diffs:** `821f567`.
- **Release coupling:** this spec ships together with spec 02 (never release 02 alone).

---

## Phase 4.0: Test Foundation

Write all tests first (red). Commit one `test(FRn): …` per FR.

### FR1: Bounded buckets and a collapsible, month-grouped Older section
New file: `src/lib/__tests__/requestRows.test.ts`. Use fixed `RequestRowBounds` (for example `currentMonday '2026-10-19'`, `prevMonday1 '2026-10-12'`, `prevMonday2 '2026-10-05'`) and no clock.
- [ ] `DD4.1` One entry in each recent week → `[header 'This Week', entry, header 'Last Week', entry, header '2 Weeks Ago', entry]`, with no `older-toggle`.
- [ ] `DD4.2` An entry on `prevMonday2` → "2 Weeks Ago". An entry on `prevMonday2 − 1 day` → not in any bucket, and counted by the toggle.
- [ ] `DD4.3` Recent entries plus 2 older ones (October and September 2026):
  - [ ] collapsed → the last row is `{ type: 'older-toggle', count: 2, expanded: false }`, and no older entry rows appear;
  - [ ] expanded → the toggle (`expanded: true`), then `header 'October 2026'` with its entries, then `header 'September 2026'` with its entries;
  - [ ] a year boundary → `'January 2026'` before `'December 2025'`.
- [ ] `DD4.4` `[]` → `[]`. Only older entries: collapsed → exactly `[toggle]`; expanded → the toggle plus the month groups.
- [ ] `DD4.5` A `'garbage'` date → never in a recent bucket, and counted by the toggle. Expanded, it sits under `'Other dates'`, after every month group. No throw.
- [ ] `DD4.6` `monthLabel`: `'2026-09-14'` → `'September 2026'`, `'2025-12-01'` → `'December 2025'`, `'garbage'` → `'Other dates'`.

### FR2: Honest freshness, banner and empty-state copy
Same file. Fixed `NOW` (a local wall-clock time, so the cases hold in any host time zone).
- [ ] `DD4.7` `formatUpdatedAgo`:
  - [ ] 30 s → `'just now'`; 5 min → `'5 min ago'`; 3 h → `'3 h ago'`;
  - [ ] the previous calendar day, 26 h earlier → `'yesterday'`; 4 days → `'4 days ago'`;
  - [ ] +5 min (future) → `'just now'`; `null`, `undefined` and `'not-a-date'` → `''`.
- [ ] `DD4.8` `freshnessNote` with entries and `updatedAt` 5 min old:
  - [ ] `'network'` → `'Showing saved requests · updated 5 min ago'`;
  - [ ] `'auth'` with `null`, and with `'AUTH_LOGIN_LATCHED'` → `"Can't sign in to Crossover right now · showing saved requests · updated 5 min ago"`;
  - [ ] `'auth'` with `'NO_CREDENTIALS'` → `'Saved sign-in missing · showing saved requests · sign out and back in from Settings'`;
  - [ ] no error with stale dates → `"Some days couldn't refresh · updated 5 min ago"`;
  - [ ] `'network'` with stale dates → the network text.
- [ ] `DD4.9` `freshnessNote` edges:
  - [ ] `updatedAt: null` with `'network'` → `'Showing saved requests'`;
  - [ ] `hasEntries: false` → `null`;
  - [ ] no error and no stale dates → `null`.
- [ ] `DD4.10` `requestsBannerText`:
  - [ ] `('network', null)` → `'Could not load requests.'`;
  - [ ] `('auth', null)` and `('auth', 'AUTH_LOGIN_LATCHED')` → the neutral sentence;
  - [ ] `('auth', 'NO_CREDENTIALS')` → `'Your saved sign-in is missing. Sign out and back in from Settings.'`.
- [ ] `DD4.11` `requestsErrorRetryable`: `('auth','NO_CREDENTIALS')` → false; `('auth',null)`, `('auth','AUTH_LOGIN_LATCHED')` and `('network',null)` → true; `(null,null)` → false.
- [ ] `DD4.12` `myRequestsEmptyState`:
  - [ ] `('network', [])` and `('auth', ['2026-10-20'])` → `'error'`;
  - [ ] `(null, ['2026-10-20'])` → `'incomplete'`;
  - [ ] `(null, [])` → `'none'`.
  - [ ] `INCOMPLETE_EMPTY_TEXT` equals `"Some days couldn't refresh, so requests may be missing."`.
- [ ] `DD4.13` Copy guard: every output of `freshnessNote` / `requestsBannerText` across the error × `errorCode` × stale matrix, plus `INCOMPLETE_EMPTY_TEXT`, matches neither `/re-?open/i` nor `/password/i`.

### FR3: `useMyRequests` exposes `errorCode`, forces its `refetch`, and is restore-aware
`src/hooks/__tests__/useMyRequests.test.ts`:
- [ ] Mock update (C7): add `useIsRestoring: jest.fn(() => false)` to the `@tanstack/react-query` factory, and reset it to `false` in the DD2.55 `beforeEach`.
- [ ] Update DD2.56. The `toEqual` objects gain `errorCode: null`, except "missing credentials on a cold cache", which gets `errorCode: 'NO_CREDENTIALS'`.
- [ ] Update DD2.55 "returns the selected view …":
  - [ ] `rest` gains `errorCode: null`;
  - [ ] replace `expect(returnedRefetch).toBe(refetch)` with the DD4.16 behaviour.
- [ ] `DD4.14` `selectMyRequests` `errorCode`:
  - [ ] `NO_CREDENTIALS` → `('auth','NO_CREDENTIALS')`;
  - [ ] `AUTH_LOGIN_LATCHED` → `('auth','AUTH_LOGIN_LATCHED')`;
  - [ ] `AuthError(401)` → `('auth', null)`;
  - [ ] `AUTH_HTML_500` → `('network', null)`;
  - [ ] `NetworkError` → `('network', null)`;
  - [ ] `{}` → `('network', null)`;
  - [ ] no error → `(null, null)`;
  - [ ] legacy blob `error: 'auth'` → `('auth', null)`.
- [ ] `DD4.15` Static check (comments stripped, `__tests__/helpers/stripComments.ts`):
  - [ ] imports `useIsRestoring` from `@tanstack/react-query`;
  - [ ] the returned `refetch` calls `markMyRequestsForcedRefresh()` before `query.refetch()`;
  - [ ] there is no `useCallback`.
- [ ] `DD4.16` Through `useMyRequestsWith`:
  - [ ] `result.refetch()` calls the query `refetch` exactly once and returns the same value. The mock returns a sentinel promise; assert `toBe`.
  - [ ] Then a `buildMyRequestsQueryFn(...)` run (the DD2.51 setup) plans every `catchUpStart..today` date, and the next run is normal.
- [ ] `DD4.17` `isLoading`:
  - [ ] `useIsRestoring` → `true` with the query idle → `true`;
  - [ ] `useConfig().isLoading: true` with no data → `true`;
  - [ ] `useConfig().isLoading: true` with data → `false`;
  - [ ] neither → mirrors the query's `isLoading` (`true`/`false`).

### FR4: The Requests screen shows history, honest freshness and a real pull-to-refresh
`app/(tabs)/__tests__/approvals.test.tsx` (extend `setupMocks` with `staleDates`, `updatedAt`, `errorCode` and an injectable `refetch`):
- [ ] Fixture update (C9): `MOCK_ENTRY_PENDING.date` and `id` use `getCurrentMondayString()`. Also in `approvals-mesh.test.tsx`: `MOCK_ENTRY` uses a current-Monday helper of the same shape.
- [ ] `DD4.18` Older toggle, with entries built relative to the current week (one this week, two at `prevMonday2 − 7` and `− 8` days):
  - [ ] collapsed: "Show older requests (2)" is present and the older memos are absent;
  - [ ] press `older-toggle` in `act`: the computed month label(s) and both memos appear, and the toggle reads "Hide older requests".
- [ ] `DD4.19` With entries:
  - [ ] `'network'`: `my-requests-note` starts with "Showing saved requests"; "Could not load requests." and "Authentication error" are absent; the cards render; pressing Retry calls `refetch` once.
  - [ ] `'auth'` with `errorCode` unset: "Can't sign in to Crossover right now · showing saved requests", and Retry is present.
  - [ ] `'auth'` with `'NO_CREDENTIALS'`: "Saved sign-in missing", and no Retry in My Requests.
  - [ ] stale dates with no error: "Some days couldn't refresh", and no Retry.
- [ ] `DD4.20` No entries:
  - [ ] `'auth'` unset → `my-requests-banner` with the neutral sentence, plus Retry, and "No requests yet" absent;
  - [ ] `'auth'` with `'NO_CREDENTIALS'` → "Your saved sign-in is missing. Sign out and back in from Settings.", with no Retry;
  - [ ] `'network'` → "Could not load requests.", with Retry, and "No requests yet" absent.
- [ ] `DD4.21` **(C3)** No entries, no error, `staleDates: ['2026-10-20']` → `INCOMPLETE_EMPTY_TEXT`, not "No requests yet". Retry is present, and pressing it calls `refetch` once. With no stale dates → "No requests yet".
- [ ] `DD4.22` Pull-to-refresh:
  - [ ] `refetch` returns a deferred promise. After `onRefresh`, `refreshing` is `true`. Resolve it and flush (`await act(async () => {})`): `refreshing` is `false`.
  - [ ] Same with a rejected promise: back to `false`, and nothing is unhandled.
  - [ ] `isLoading: true` with no pull → `refreshing` is `false`.
- [ ] `DD4.23` Copy guard: over the DD4.19-DD4.21 matrix, no rendered text matches `/re-?open/i` or `/password/i`. The `approvals.tsx` source (comments stripped) matches neither.
- [ ] `DD4.24` Static check (comments stripped): no `function buildMyRequestRows` in `approvals.tsx`, and it imports `buildMyRequestRows` from `@/src/lib/requestRows`.

### FR5: The root gate waits for the cache restore
`app/__tests__/layout-notifications.test.tsx`:
- [ ] Mock update (C7):
  - [ ] `let mockIsRestoring = false`, with `useIsRestoring: () => mockIsRestoring` in the `@tanstack/react-query` factory;
  - [ ] a hoisted `const mockReplace = jest.fn()`, returned by `useRouter: () => ({ replace: mockReplace })`;
  - [ ] reset both in `beforeEach`.
- [ ] `DD4.25` `mockIsRestoring = true`, `{ setupComplete: false }`, `isLoading: false`:
  - [ ] `mockReplace` is not called, `SplashScreen.hideAsync` is not called, and the overlay renders (no `MockStack` in the tree);
  - [ ] then `mockIsRestoring = false` and `update` in `act` → `mockReplace` is called with `'/(auth)/welcome'`, and `hideAsync` is called.
- [ ] `DD4.26` `mockIsRestoring = true`, `{ setupComplete: true }`, segments `['(tabs)']` → `mockReplace` is never called with `'/(auth)/welcome'`, either while restoring or after the flip.
- [ ] `DD4.27` Static check (comments stripped): `_layout.tsx` imports `useIsRestoring` from `@tanstack/react-query` and contains `isLoading || isRestoring`.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run the `red-phase-test-validator` agent.
- [ ] Every FR1-FR5 success criterion has test coverage (DD4.1-DD4.27, plus the updated DD2.55/DD2.56).
- [ ] Assertions are specific (exact strings, exact row arrays, call counts). None is just "exists" or "doesn't throw".
- [ ] Mocks return realistic data matching the interface contracts: real `AuthError`/`NetworkError` instances with spec 01's codes, and `ManualRequestEntry` with `{date}|{memo}` ids.
- [ ] Screen and row fixtures are relative to the current week or to fixed bounds. No hardcoded calendar date may decide which bucket a fixture lands in (C9).
- [ ] Fix any issues identified before proceeding.

---

## Phase 4.1: Implementation

Commit one `feat(FRn): …` per FR.

### FR1: Bounded buckets and a collapsible, month-grouped Older section
- [ ] Create `src/lib/requestRows.ts` (with a header comment in the style of `requestsStore.ts`), containing `MyRequestRow`, `RequestRowBounds`, `buildMyRequestRows` and `monthLabel` (fixed `MONTH_NAMES`, the date regex, and "Other dates").
- [ ] Remove the local `MyRequestRow` and `buildMyRequestRows` from `app/(tabs)/approvals.tsx`, and import them from the new module. Leave `buildTeamQueueRows`/`TeamQueueRow` untouched.

### FR2: Honest freshness, banner and empty-state copy
- [ ] Add `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `MyRequestsEmptyState`, `myRequestsEmptyState` and `INCOMPLETE_EMPTY_TEXT` to `src/lib/requestRows.ts`. Import `NO_CREDENTIALS` from `../api/errors`.

### FR3: `useMyRequests` exposes `errorCode`, forces its `refetch`, and is restore-aware
- [ ] `src/types/requests.ts`: add `errorCode?: string | null`, set `refetch: () => Promise<unknown> | void`, and update the doc comments.
- [ ] `src/hooks/useMyRequests.ts`:
  - [ ] `selectMyRequests` returns `errorCode` (C2);
  - [ ] import `useIsRestoring`, and read `isLoading` from `useConfig()`;
  - [ ] apply the restore-aware `isLoading`;
  - [ ] make the forced `refetch` a plain closure;
  - [ ] extend the header comment with a `durable-data 04-requests-history-ui` line.

### FR4: The Requests screen shows history, honest freshness and a real pull-to-refresh
- [ ] `app/(tabs)/approvals.tsx`:
  - [ ] destructure the new fields with defaults;
  - [ ] add the `olderExpanded` state and the toggle row (C10);
  - [ ] add the note (C13);
  - [ ] switch the empty state on `myRequestsEmptyState` (banner / incomplete / none), with Retry gated by `requestsErrorRetryable`;
  - [ ] add `pulling` with `Promise.allSettled`, and set `refreshing={pulling}`;
  - [ ] remove `isRefreshing` and the old auth copy;
  - [ ] update the file's header comment (durable-data 04).
- [ ] Confirm that `__tests__/approvals-screen.test.tsx`, `MotionUniversality.test.tsx` FR2 and `approvals-mesh.test.tsx` still pass.
- [ ] `docs/ARCHITECTURE.md` §4.4 step 6: add `errorCode`, the forced `refetch`, restore-aware `isLoading`, the note/banner/incomplete split and Older grouping (C16).

### FR5: The root gate waits for the cache restore
- [ ] `app/_layout.tsx`:
  - [ ] import `useIsRestoring`;
  - [ ] the splash, gate and overlay conditions and their deps include `isRestoring`;
  - [ ] update the `SC1.x` comments to mention the restore.

---

## Phase 4.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run the `spec-implementation-alignment` agent.
- [ ] All FR1-FR5 success criteria are verified in code.
- [ ] Interface contracts match the implementation:
  - [ ] `MyRequestRow`, `RequestRowBounds`, `buildMyRequestRows`, `monthLabel`;
  - [ ] `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `myRequestsEmptyState`, `INCOMPLETE_EMPTY_TEXT`;
  - [ ] `selectMyRequests`'s `errorCode`, the `UseMyRequestsResult` fields, and the forced `refetch`.
- [ ] No scope creep and no shortfall:
  - [ ] Out Of Scope items 1-11 are untouched;
  - [ ] `MyRequestCard.tsx`, `useApprovalItems.ts`, `requestsStore.ts`, `requestsPlanner.ts`, `queryPersist.ts` and `src/api/*` are unchanged.

### Step 1: Comprehensive PR Review
- [ ] Run the `pr-review-toolkit:review-pr` skill (6 specialized agents) on the spec's diff (`git diff 821f567..HEAD`), **locally only**: no PR, no push.

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues.
- [ ] Fix MEDIUM severity issues, or document why they are deferred.
- [ ] Re-run the focused tests after the fixes.
- [ ] Commit the fixes: `fix(04-requests-history-ui): {description}`.

### Step 3: Test Quality Optimization
- [ ] Run the `test-optimiser` agent on the new and modified tests.
- [ ] Apply the improvements that strengthen confidence.
- [ ] Re-run the tests to confirm they pass.
- [ ] Commit if anything changed: `fix(04-requests-history-ui): strengthen test assertions`.

### Final Verification
- [ ] Focused suite green:
  ```
  npx jest src/lib/__tests__/requestRows.test.ts src/hooks/__tests__/useMyRequests.test.ts \
    "app/(tabs)/__tests__/approvals.test.tsx" "app/(tabs)/__tests__/approvals-mesh.test.tsx" \
    __tests__/approvals-screen.test.tsx src/components/__tests__/MotionUniversality.test.tsx \
    src/components/__tests__/MyRequestCard.test.tsx __tests__/build-team-queue-rows.test.ts \
    app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx \
    app/__tests__/modal-auth-cache.test.tsx src/lib/__tests__/queryPersist.test.ts
  ```
- [ ] Full suite green: `npx jest` (no regressions in existing tests).
- [ ] `npm run typecheck` is clean.
- [ ] `npm run lint` reports 0 errors.
- [ ] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`.
- [ ] No changes to `package.json`/`app.json`/native: `git diff --stat 821f567..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty.
- [ ] Code follows existing patterns:
  - [ ] pure helpers in `src/lib` with unit tests;
  - [ ] NativeWind classes only;
  - [ ] `AnimatedPressable` for touchables;
  - [ ] comment density matching the neighbours;
  - [ ] no new log events (C14).
- [ ] Update `FEATURE.md`:
  - [ ] the changelog row for `04-requests-history-ui` (status, commits, test counts);
  - [ ] the "Files Touched" list (add `app/(tabs)/__tests__/approvals-mesh.test.tsx` and `docs/ARCHITECTURE.md` for spec 04).
  - [ ] Commit as `docs(04-requests-history-ui): update checklist and FEATURE.md`.

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-22**: Spec and checklist written (autonomous, not committed). Deviations from spec-research and the decisions, all recorded in spec.md C1-C17:
- C3: a new `'incomplete'` empty state (with Retry) replaces "No requests yet" when a partial failure leaves nothing visible.
- C4: the "No requests yet" card is no longer rendered under the no-data error banner.
- C2: `errorCode` is reported only for `'auth'`.
- C5: `refetch` widens to `() => Promise<unknown> | void`.
- C7: two test mocks need `useIsRestoring`, and the layout router mock needs a shared `replace`.
- C9: the March-dated screen fixtures must become current-week relative, or the bounded buckets hide them behind the Older toggle.
- C10: the Older toggle uses neutral `textSecondary`, not violet.
