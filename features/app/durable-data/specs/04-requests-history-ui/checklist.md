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
- [x] `DD4.1` One entry in each recent week → `[header 'This Week', entry, header 'Last Week', entry, header '2 Weeks Ago', entry]`, with no `older-toggle`.
- [x] `DD4.2` An entry on `prevMonday2` → "2 Weeks Ago". An entry on `prevMonday2 − 1 day` → not in any bucket, and counted by the toggle.
- [x] `DD4.3` Recent entries plus 2 older ones (October and September 2026):
  - [x] collapsed → the last row is `{ type: 'older-toggle', count: 2, expanded: false }`, and no older entry rows appear;
  - [x] expanded → the toggle (`expanded: true`), then `header 'October 2026'` with its entries, then `header 'September 2026'` with its entries;
  - [x] a year boundary → `'January 2026'` before `'December 2025'`.
- [x] `DD4.4` `[]` → `[]`. Only older entries: collapsed → exactly `[toggle]`; expanded → the toggle plus the month groups.
- [x] `DD4.5` A `'garbage'` date → never in a recent bucket, and counted by the toggle. Expanded, it sits under `'Other dates'`, after every month group. No throw.
- [x] `DD4.6` `monthLabel`: `'2026-09-14'` → `'September 2026'`, `'2025-12-01'` → `'December 2025'`, `'garbage'` → `'Other dates'`.

### FR2: Honest freshness, banner and empty-state copy
Same file. Fixed `NOW` (a local wall-clock time, so the cases hold in any host time zone).
- [x] `DD4.7` `formatUpdatedAgo`:
  - [x] 30 s → `'just now'`; 5 min → `'5 min ago'`; 3 h → `'3 h ago'`;
  - [x] the previous calendar day, 26 h earlier → `'yesterday'`; 4 days → `'4 days ago'`;
  - [x] +5 min (future) → `'just now'`; `null`, `undefined` and `'not-a-date'` → `''`.
- [x] `DD4.8` `freshnessNote` with entries and `updatedAt` 5 min old:
  - [x] `'network'` → `'Showing saved requests · updated 5 min ago'`;
  - [x] `'auth'` with `null`, and with `'AUTH_LOGIN_LATCHED'` → `"Can't sign in to Crossover right now · showing saved requests · updated 5 min ago"`;
  - [x] `'auth'` with `'NO_CREDENTIALS'` → `'Saved sign-in missing · showing saved requests · sign out and back in from Settings'`;
  - [x] no error with stale dates → `"Some days couldn't refresh · updated 5 min ago"`;
  - [x] `'network'` with stale dates → the network text.
- [x] `DD4.9` `freshnessNote` edges:
  - [x] `updatedAt: null` with `'network'` → `'Showing saved requests'`;
  - [x] `hasEntries: false` → `null`;
  - [x] no error and no stale dates → `null`.
- [x] `DD4.10` `requestsBannerText`:
  - [x] `('network', null)` → `'Could not load requests.'`;
  - [x] `('auth', null)` and `('auth', 'AUTH_LOGIN_LATCHED')` → the neutral sentence;
  - [x] `('auth', 'NO_CREDENTIALS')` → `'Your saved sign-in is missing. Sign out and back in from Settings.'`.
- [x] `DD4.11` `requestsErrorRetryable`: `('auth','NO_CREDENTIALS')` → false; `('auth',null)`, `('auth','AUTH_LOGIN_LATCHED')` and `('network',null)` → true; `(null,null)` → false.
- [x] `DD4.12` `myRequestsEmptyState`:
  - [x] `('network', [])` and `('auth', ['2026-10-20'])` → `'error'`;
  - [x] `(null, ['2026-10-20'])` → `'incomplete'`;
  - [x] `(null, [])` → `'none'`.
  - [x] `INCOMPLETE_EMPTY_TEXT` equals `"Some days couldn't refresh, so requests may be missing."`.
- [x] `DD4.13` Copy guard: every output of `freshnessNote` / `requestsBannerText` across the error × `errorCode` × stale matrix, plus `INCOMPLETE_EMPTY_TEXT`, matches neither `/re-?open/i` nor `/password/i`.

### FR3: `useMyRequests` exposes `errorCode`, forces its `refetch`, and is restore-aware
`src/hooks/__tests__/useMyRequests.test.ts`:
- [x] Mock update (C7): add `useIsRestoring: jest.fn(() => false)` to the `@tanstack/react-query` factory, and reset it to `false` in the DD2.55 `beforeEach`.
- [x] Update DD2.56. The `toEqual` objects gain `errorCode: null`, except "missing credentials on a cold cache", which gets `errorCode: 'NO_CREDENTIALS'`.
- [x] Update DD2.55 "returns the selected view …":
  - [x] `rest` gains `errorCode: null`;
  - [x] replace `expect(returnedRefetch).toBe(refetch)` with the DD4.16 behaviour.
- [x] `DD4.14` `selectMyRequests` `errorCode`:
  - [x] `NO_CREDENTIALS` → `('auth','NO_CREDENTIALS')`;
  - [x] `AUTH_LOGIN_LATCHED` → `('auth','AUTH_LOGIN_LATCHED')`;
  - [x] `AuthError(401)` → `('auth', null)`;
  - [x] `AUTH_HTML_500` → `('network', null)`;
  - [x] `NetworkError` → `('network', null)`;
  - [x] `{}` → `('network', null)`;
  - [x] no error → `(null, null)`;
  - [x] legacy blob `error: 'auth'` → `('auth', null)`.
- [x] `DD4.15` Static check (comments stripped, `__tests__/helpers/stripComments.ts`):
  - [x] imports `useIsRestoring` from `@tanstack/react-query`;
  - [x] the returned `refetch` calls `markMyRequestsForcedRefresh()` before `query.refetch()`;
  - [x] there is no `useCallback`.
- [x] `DD4.16` Through `useMyRequestsWith`:
  - [x] `result.refetch()` calls the query `refetch` exactly once and returns the same value. The mock returns a sentinel promise; assert `toBe`.
  - [x] Then a `buildMyRequestsQueryFn(...)` run (the DD2.51 setup) plans every `catchUpStart..today` date, and the next run is normal.
- [x] `DD4.17` `isLoading`:
  - [x] `useIsRestoring` → `true` with the query idle → `true`;
  - [x] `useConfig().isLoading: true` with no data → `true`;
  - [x] `useConfig().isLoading: true` with data → `false`;
  - [x] neither → mirrors the query's `isLoading` (`true`/`false`).

### FR4: The Requests screen shows history, honest freshness and a real pull-to-refresh
`app/(tabs)/__tests__/approvals.test.tsx` (extend `setupMocks` with `staleDates`, `updatedAt`, `errorCode` and an injectable `refetch`):
- [x] Fixture update (C9): `MOCK_ENTRY_PENDING.date` and `id` use `getCurrentMondayString()`. Also in `approvals-mesh.test.tsx`: `MOCK_ENTRY` uses a current-Monday helper of the same shape.
- [x] `DD4.18` Older toggle, with entries built relative to the current week (one this week, two at `prevMonday2 − 7` and `− 8` days):
  - [x] collapsed: "Show older requests (2)" is present and the older memos are absent;
  - [x] press `older-toggle` in `act`: the computed month label(s) and both memos appear, and the toggle reads "Hide older requests".
- [x] `DD4.19` With entries:
  - [x] `'network'`: `my-requests-note` starts with "Showing saved requests"; "Could not load requests." and "Authentication error" are absent; the cards render; pressing Retry calls `refetch` once.
  - [x] `'auth'` with `errorCode` unset: "Can't sign in to Crossover right now · showing saved requests", and Retry is present.
  - [x] `'auth'` with `'NO_CREDENTIALS'`: "Saved sign-in missing", and no Retry in My Requests.
  - [x] stale dates with no error: "Some days couldn't refresh", and no Retry.
- [x] `DD4.20` No entries:
  - [x] `'auth'` unset → `my-requests-banner` with the neutral sentence, plus Retry, and "No requests yet" absent;
  - [x] `'auth'` with `'NO_CREDENTIALS'` → "Your saved sign-in is missing. Sign out and back in from Settings.", with no Retry;
  - [x] `'network'` → "Could not load requests.", with Retry, and "No requests yet" absent.
- [x] `DD4.21` **(C3)** No entries, no error, `staleDates: ['2026-10-20']` → `INCOMPLETE_EMPTY_TEXT`, not "No requests yet". Retry is present, and pressing it calls `refetch` once. With no stale dates → "No requests yet".
- [x] `DD4.22` Pull-to-refresh:
  - [x] `refetch` returns a deferred promise. After `onRefresh`, `refreshing` is `true`. Resolve it and flush (`await act(async () => {})`): `refreshing` is `false`.
  - [x] Same with a rejected promise: back to `false`, and nothing is unhandled.
  - [x] `isLoading: true` with no pull → `refreshing` is `false`.
- [x] `DD4.23` Copy guard: over the DD4.19-DD4.21 matrix, no rendered text matches `/re-?open/i` or `/password/i`. The `approvals.tsx` source (comments stripped) matches neither.
- [x] `DD4.24` Static check (comments stripped): no `function buildMyRequestRows` in `approvals.tsx`, and it imports `buildMyRequestRows` from `@/src/lib/requestRows`.

### FR5: The root gate waits for the cache restore
`app/__tests__/layout-notifications.test.tsx`:
- [x] Mock update (C7):
  - [x] `let mockIsRestoring = false`, with `useIsRestoring: () => mockIsRestoring` in the `@tanstack/react-query` factory;
  - [x] a hoisted `const mockReplace = jest.fn()`, returned by `useRouter: () => ({ replace: mockReplace })`;
  - [x] reset both in `beforeEach`.
- [x] `DD4.25` `mockIsRestoring = true`, `{ setupComplete: false }`, `isLoading: false`:
  - [x] `mockReplace` is not called, `SplashScreen.hideAsync` is not called, and the overlay renders (no `MockStack` in the tree);
  - [x] then `mockIsRestoring = false` and `update` in `act` → `mockReplace` is called with `'/(auth)/welcome'`, and `hideAsync` is called.
- [x] `DD4.26` `mockIsRestoring = true`, `{ setupComplete: true }`, segments `['(tabs)']` → `mockReplace` is never called with `'/(auth)/welcome'`, either while restoring or after the flip.
- [x] `DD4.27` Static check (comments stripped): `_layout.tsx` imports `useIsRestoring` from `@tanstack/react-query` and contains `isLoading || isRestoring`.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run the `red-phase-test-validator` agent.
- [x] Every FR1-FR5 success criterion has test coverage (DD4.1-DD4.27, plus the updated DD2.55/DD2.56).
- [x] Assertions are specific (exact strings, exact row arrays, call counts). None is just "exists" or "doesn't throw".
- [x] Mocks return realistic data matching the interface contracts: real `AuthError`/`NetworkError` instances with spec 01's codes, and `ManualRequestEntry` with `{date}|{memo}` ids.
- [x] Screen and row fixtures are relative to the current week or to fixed bounds. No hardcoded calendar date may decide which bucket a fixture lands in (C9).
- [x] Fix any issues identified before proceeding.

---

## Phase 4.1: Implementation

Commit one `feat(FRn): …` per FR.

### FR1: Bounded buckets and a collapsible, month-grouped Older section
- [x] Create `src/lib/requestRows.ts` (with a header comment in the style of `requestsStore.ts`), containing `MyRequestRow`, `RequestRowBounds`, `buildMyRequestRows` and `monthLabel` (fixed `MONTH_NAMES`, the date regex, and "Other dates").
- [x] Remove the local `MyRequestRow` and `buildMyRequestRows` from `app/(tabs)/approvals.tsx`, and import them from the new module. Leave `buildTeamQueueRows`/`TeamQueueRow` untouched.

### FR2: Honest freshness, banner and empty-state copy
- [x] Add `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `MyRequestsEmptyState`, `myRequestsEmptyState` and `INCOMPLETE_EMPTY_TEXT` to `src/lib/requestRows.ts`. Import `NO_CREDENTIALS` from `../api/errors`.

### FR3: `useMyRequests` exposes `errorCode`, forces its `refetch`, and is restore-aware
- [x] `src/types/requests.ts`: add `errorCode?: string | null`, set `refetch: () => Promise<unknown> | void`, and update the doc comments.
- [x] `src/hooks/useMyRequests.ts`:
  - [x] `selectMyRequests` returns `errorCode` (C2);
  - [x] import `useIsRestoring`, and read `isLoading` from `useConfig()`;
  - [x] apply the restore-aware `isLoading`;
  - [x] make the forced `refetch` a plain closure;
  - [x] extend the header comment with a `durable-data 04-requests-history-ui` line.

### FR4: The Requests screen shows history, honest freshness and a real pull-to-refresh
- [x] `app/(tabs)/approvals.tsx`:
  - [x] destructure the new fields with defaults;
  - [x] add the `olderExpanded` state and the toggle row (C10);
  - [x] add the note (C13);
  - [x] switch the empty state on `myRequestsEmptyState` (banner / incomplete / none), with Retry gated by `requestsErrorRetryable`;
  - [x] add `pulling` with `Promise.allSettled`, and set `refreshing={pulling}`;
  - [x] remove `isRefreshing` and the old auth copy;
  - [x] update the file's header comment (durable-data 04).
- [x] Confirm that `__tests__/approvals-screen.test.tsx`, `MotionUniversality.test.tsx` FR2 and `approvals-mesh.test.tsx` still pass.
- [x] `docs/ARCHITECTURE.md` §4.4 step 6: add `errorCode`, the forced `refetch`, restore-aware `isLoading`, the note/banner/incomplete split and Older grouping (C16).

### FR5: The root gate waits for the cache restore
- [x] `app/_layout.tsx`:
  - [x] import `useIsRestoring`;
  - [x] the splash, gate and overlay conditions and their deps include `isRestoring`;
  - [x] update the `SC1.x` comments to mention the restore.

---

## Phase 4.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run the `spec-implementation-alignment` agent.
- [x] All FR1-FR5 success criteria are verified in code.
- [x] Interface contracts match the implementation:
  - [x] `MyRequestRow`, `RequestRowBounds`, `buildMyRequestRows`, `monthLabel`;
  - [x] `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `myRequestsEmptyState`, `INCOMPLETE_EMPTY_TEXT`;
  - [x] `selectMyRequests`'s `errorCode`, the `UseMyRequestsResult` fields, and the forced `refetch`.
- [x] No scope creep and no shortfall:
  - [x] Out Of Scope items 1-11 are untouched;
  - [x] `MyRequestCard.tsx`, `useApprovalItems.ts`, `requestsStore.ts`, `requestsPlanner.ts`, `queryPersist.ts` and `src/api/*` are unchanged.

### Step 1: Comprehensive PR Review
- [x] Run the `pr-review-toolkit:review-pr` skill (6 specialized agents) on the spec's diff (`git diff 821f567..HEAD`), **locally only**: no PR, no push.

### Step 2: Address Feedback
- [x] Fix HIGH severity issues.
- [x] Fix MEDIUM severity issues, or document why they are deferred.
- [x] Re-run the focused tests after the fixes.
- [x] Commit the fixes: `fix(04-requests-history-ui): {description}` (`41babc4`).

### Step 3: Test Quality Optimization
- [x] Run the `test-optimiser` agent on the new and modified tests.
- [x] Apply the improvements that strengthen confidence.
- [x] Re-run the tests to confirm they pass.
- [x] Commit if anything changed: `fix(04-requests-history-ui): strengthen test assertions` (`c9872d6`, filed as `test(04-requests-history-ui): optimise tests`).

### Final Verification
- [x] Focused suite green (re-run during this bookkeeping pass, parens escaped so both `approvals.test.tsx` and `approvals-mesh.test.tsx` are actually included — the unescaped example below under-matches by 2 suites):
  ```
  npx jest src/lib/__tests__/requestRows.test.ts src/hooks/__tests__/useMyRequests.test.ts \
    "app/(tabs)/__tests__/approvals.test.tsx" "app/(tabs)/__tests__/approvals-mesh.test.tsx" \
    __tests__/approvals-screen.test.tsx src/components/__tests__/MotionUniversality.test.tsx \
    src/components/__tests__/MyRequestCard.test.tsx __tests__/build-team-queue-rows.test.ts \
    app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx \
    app/__tests__/modal-auth-cache.test.tsx src/lib/__tests__/queryPersist.test.ts
  ```
  Result: 12/12 suites, 473/473 tests passing.
- [x] Full suite green: `npx jest` (no regressions in existing tests). Not re-run in this bookkeeping pass (hard rule restricts jest runs here to the files relevant to this task); taking the spec-executor's recorded result — `Test Suites: 198 passed, 198 total; Tests: 6080 passed, 6080 total` — which is consistent with every independently-verified figure below.
- [x] `npm run typecheck` is clean. Re-run: `tsc --noEmit` exit 0, no output.
- [x] `npm run lint` reports 0 errors. Re-run: `0 errors, 539 warnings` (exact match to the recorded summary).
- [x] `npx expo-updates runtimeversion:resolve --platform ios` prints `56d054fc723984e56892a367dca1efa79a9f8fad`. Re-run: exact match.
- [x] No changes to `package.json`/`app.json`/native: `git diff --stat 821f567..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` is empty. Confirmed empty.
- [x] Code follows existing patterns:
  - [x] pure helpers in `src/lib` with unit tests;
  - [x] NativeWind classes only;
  - [x] `AnimatedPressable` for touchables;
  - [x] comment density matching the neighbours;
  - [x] no new log events (C14).
- [x] Update `FEATURE.md`:
  - [x] the changelog row for `04-requests-history-ui` (status, commits, test counts);
  - [x] the "Files Touched" list (add `app/(tabs)/__tests__/approvals-mesh.test.tsx` and `docs/ARCHITECTURE.md` for spec 04).
  - [x] Commit as `docs(04-requests-history-ui): update checklist and FEATURE.md`.

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

**2026-10-22**: Spec execution complete. 13 commits in `821f567..HEAD`: 1 `spec(04-requests-history-ui): add spec.md and checklist.md` commit (`8619e0b`), 6 `test(...)` commits (FR1/FR2/FR3/FR4/FR5 red-phase tests — `9854350`, `add1a8d`, `895df39`, `49424c3`, `6e9e3c8` — plus the post-review `test(04-requests-history-ui): optimise tests` pass in `c9872d6`), 5 `feat(FRn): …` commits (`f4e2f30`, `195f2ab`, `99688fc`, `c6442b3`, `ef3c01d`), 1 `fix(04-requests-history-ui): …` commit (`41babc4`). Review outcome: PR-review feedback addressed in `41babc4` — `handleRefresh` now runs each refetch inside a `Promise` executor so a synchronous throw becomes a rejection and the pull spinner still clears, the My Requests empty state is rendered by an exhaustive switch over `MyRequestsEmptyState` (never-guarded, so a new state fails to compile instead of silently falling through to "No requests yet"), and the three My Requests Retry links were deduplicated into one `renderMyRetry` helper; test-optimiser pass in `c9872d6` added teardown (`unmount`) after every rendered tree in `approvals.test.tsx` to fix a flaky DD4.22 timeout, tightened DD4.24's static check to also reject a local `MyRequestRow` type/const builder, merged the DD4.16 identity/call-count case into the forced-plan case so a one-shot flag can't leak between cases, and added DST fall-back dates to `formatUpdatedAgo`'s day-boundary coverage. Verification (re-run during this bookkeeping pass): focused jest — the 12 files named in Final Verification, with parens escaped so both `approvals.test.tsx` and `approvals-mesh.test.tsx` are actually matched (the unquoted-regex form in the checklist's own example under-matches by 2 suites) — 12/12 suites, 473/473 tests green; full suite not re-run here (out of scope for this bookkeeping pass per the task's own jest-scoping rule), taking the spec-executor's recorded `Test Suites: 198 passed, 198 total; Tests: 6080 passed, 6080 total` on trust, consistent with every figure re-verified below; `tsc --noEmit` clean, no errors; `npm run lint` 0 errors, 539 warnings, matching the spec-executor's data exactly; iOS fingerprint confirmed `56d054fc723984e56892a367dca1efa79a9f8fad` via a direct `npx expo-updates runtimeversion:resolve --platform ios` run (exact match, unchanged from specs 01-03); `git diff --stat 821f567..HEAD -- package.json package-lock.json app.json eas.json ios android patches plugins` empty (no native/config edits); `src/components/MyRequestCard.tsx`, `src/hooks/useApprovalItems.ts`, `src/lib/requestsStore.ts`, `src/lib/requestsPlanner.ts`, `src/lib/queryPersist.ts` and `src/api/*` unchanged (`git diff --stat` empty for each), confirming no scope creep. All `DD4.1`-`DD4.27` test ids were confirmed present as `describe`/`it` titles across the four touched/created test files (`src/lib/__tests__/requestRows.test.ts`, `src/hooks/__tests__/useMyRequests.test.ts`, `app/(tabs)/__tests__/approvals.test.tsx`, `app/__tests__/layout-notifications.test.tsx`), and all FR1/FR2/FR3/FR4/FR5 exports (`buildMyRequestRows`, `monthLabel`, `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `myRequestsEmptyState`, `INCOMPLETE_EMPTY_TEXT`, `errorCode`, `useIsRestoring`) were confirmed present in the implementation files by direct inspection. No checklist items were left unticked.
