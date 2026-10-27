# Spec Research: Requests History UI

**Date:** 2026-10-22
**Author:** @jaime-alvarez-trilogy
**Spec:** `04-requests-history-ui`

---

## Problem Context

After spec 02, `useMyRequests` returns up to 24 weeks of stored requests, plus `staleDates` and `updatedAt`. The Requests screen (and the root gate in front of it) is not ready for that in five ways:

1. **Buckets.** It has exactly three buckets, and "2 Weeks Ago" is `date < prevMonday1` (`app/(tabs)/approvals.tsx:90-115`), so every older entry would land in "2 Weeks Ago". There is no "Older" group (requests explorer §2; critique correction 4).
2. **Error banner.** The banner is all-or-nothing:
   - The red "Authentication error. Please re-open the app." / "Could not load requests." shows whenever `myError` is set (`:345-356`), even while the stored list is on screen.
   - The auth copy is wrong: re-opening does not reset the token. And after specs 01-02, `'auth'` does **not** mean the password was rejected. `toRequestsError` maps every `AuthError` except `AUTH_HTML_500` to `'auth'` (spec 02), and that has three different causes:
     1. **The login was refused.** The token endpoint answered 401/403 to the stored credentials, or the 60 s latch refused a retry (`AUTH_LOGIN_LATCHED`, spec 01 Decision 2). This is usually a changed password.
     2. **No saved credentials** (`NO_CREDENTIALS`). A config exists but `loadCredentials()` returned `null`, because a SecureStore item is missing (`src/store/config.ts:52-58`; spec 02 Decision 4). No request was even made.
     3. **The endpoint refused a fresh token.** The login succeeded, but the data endpoint still answered 401/403 (spec 01 edge case 8). This is an authorization problem, not a password one.

     So the copy must be neutral about the cause. Only case 2 can be told apart (by `errorCode`), and only case 2 is certain not to be fixed by Retry.
   - A partial refresh failure shows nothing at all.
3. **Pull-to-refresh.** It calls `myRefetch()`, but `isRefreshing = myLoading || …` (`:143`). `isLoading` is false during a refetch when data exists, so the spinner snaps back immediately. Nothing tells the store to re-check the whole 3-week window.
4. **Cold-start flicker.** While the persister restores, `useConfig` reports `config = null` with `isLoading = false`. `useMyRequests` is disabled, so `isLoading` is false and `entries` is `[]`, and the screen flashes "No requests yet" (`approvals.tsx:214,363-371`; critique correction 7 citing `useBaseQuery.ts:86-87`, `queryObserver.ts:631-633,722`). That looks exactly like "it disappeared".
5. **Cold-start welcome bounce** (critique correction 7, second half). The root auth gate runs `router.replace('/(auth)/welcome')` as soon as `!isLoading && !config?.setupComplete` (`app/_layout.tsx:135-144`). During the restore window that condition is true for a signed-in user. The gate then bounces back to `/(tabs)` once the config query resolves, so the user can see the welcome screen flash, which reads as "I was signed out". The splash also hides on the same `isLoading` (`:129-133`).

---

## Exploration Findings

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Pure row builder for a sectioned list | `buildMyRequestRows` (`approvals.tsx:90-115`), the team queue rows (`teamQueueRows`) | Extract to `src/lib/requestRows.ts` for unit tests (today it is private to the screen) |
| Screen tests mock the hook and render with `react-test-renderer` | `app/(tabs)/__tests__/approvals.test.tsx:21,214-539` | New cases use mocked hook returns. `fireRefresh` helper at `:395-401`. |
| NativeWind className assertions via a source read | `src/components/__tests__/MyRequestCard.test.tsx:1-10` | Use for the new note's classes |
| Quiet secondary text | `text-textSecondary text-sm` (`approvals.tsx:366`) | The note style. The red `bg-critical/10` stays only for the no-data error. |
| Restore-aware loading | `useIsRestoring` (exported by `@tanstack/react-query`, re-exported from query-core) | Not used anywhere yet (`grep useIsRestoring` → none) |

### Key Files

| File | Relevance |
|------|-----------|
| `app/(tabs)/approvals.tsx:85-150,205-231,290-385` | Rows, hook use, refresh, skeleton/banner/empty/list render |
| `src/hooks/useMyRequests.ts` (after spec 02) | `staleDates`, `updatedAt`, `markMyRequestsForcedRefresh` |
| `src/types/requests.ts` | `UseMyRequestsResult` |
| `src/lib/approvals.ts:87-96` | `getWeekStartDate` |
| `src/components/MyRequestCard.tsx` | Unchanged (per-entry staleness is deliberately not shown, Decision 3) |
| `app/(tabs)/__tests__/approvals.test.tsx:392-444` | SC3.5 pull-to-refresh asserts `refetch` is called once |

### Integration Points

- The hook's `refetch` becomes "forced refresh" (marks the flag, then refetches). The screen API is unchanged, so SC3.5 keeps passing.
- Spec 05 mounts its backfill hook in this screen and relies on the Older section to display backfilled weeks.
- Spec 02's `selectMyRequests` gains an `errorCode` output (the thrown `AuthError`'s `errorCode`), and `UseMyRequestsResult` gains the optional `errorCode`. The error-code constants come from spec 01 (`NO_CREDENTIALS`, `AUTH_LOGIN_LATCHED`).

---

## Key Decisions

### Decision 1: Grouping beyond 2 weeks

**Options considered:**
1. One flat "Older" bucket. With 24 weeks it is a long undifferentiated list.
2. One header per week ("Week of 1 Sep"). Up to 21 headers, which is noisy.
3. **"This Week / Last Week / 2 Weeks Ago" as today (with "2 Weeks Ago" bounded to `prevMonday2 <= date < prevMonday1`), then an "Older" section collapsed by default behind a "Show older requests (N)" row. When expanded it is grouped by month ("September 2026"), newest first.**

**Chosen:** Option 3.

**Rationale:**
- The screen looks exactly like today on first open, so nothing new is pushed at the user.
- The history is one tap away, and month headers stay readable over 6 months.
- The expanded state is local `useState` and does not persist.

### Decision 2: Error presentation when data exists

**Chosen:** the copy depends on `error` and, for `'auth'`, on `errorCode`. The hook now exposes `errorCode`: the thrown `AuthError`'s `errorCode`, otherwise `null`.

- **If `entries.length > 0`**, show one quiet line under "My Requests" in `text-textSecondary text-xs`:

  | State | Note text | Trailing action |
  |---|---|---|
  | `'network'` | "Showing saved requests · updated {ago}" | Retry |
  | `'auth'`, any `errorCode` except `NO_CREDENTIALS` | "Can't sign in to Crossover right now · showing saved requests · updated {ago}" | Retry |
  | `'auth'` + `NO_CREDENTIALS` | "Saved sign-in missing · showing saved requests · sign out and back in from Settings" | none (Retry cannot help) |
  | no error, `staleDates.length > 0` | "Some days couldn't refresh · updated {ago}" | none (as before: Retry only when `error` is set) |

- **If `entries.length === 0`**, keep the red banner:

  | State | Banner text | Retry |
  |---|---|---|
  | `'network'` | "Could not load requests." (unchanged) | yes |
  | `'auth'`, any `errorCode` except `NO_CREDENTIALS` | "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings." | yes |
  | `'auth'` + `NO_CREDENTIALS` | "Your saved sign-in is missing. Sign out and back in from Settings." | no |

**Rationale:**
- Stored data is the truth on screen, so a red alarm over a good list reads as "broken".
- `updatedAt` makes staleness honest.
- "Can't sign in to Crossover right now" is true in all three `'auth'` cases (Problem Context, item 2): a refused login, a missing sign-in, or an endpoint refusing the session. It does not claim the password changed, and "right now" leaves room for the transient cases. The Settings hint names the one action that fixes the persistent cases. Sign-out lives in Settings (`app/modal.tsx:77-107`).
- `NO_CREDENTIALS` gets its own text because it is the only cause that is known for certain, and the only one where Retry is certain to fail: the queryFn throws again before any request is made.
- Distinguishing `AUTH_LOGIN_LATCHED` is not worth a third text. It lasts 60 s, and its cause (a refused login) is already covered by the neutral text.

**Rejected:**
- A per-card "stale" badge (needs a `MyRequestCard` prop and is noisy for one failed day).
- "Couldn't sign in. If your password changed …" (the earlier draft). It suggests a password change in cases 2 and 3, where none happened.

### Decision 3: Relative time formatting

**Chosen:** a pure `formatUpdatedAgo(iso, nowMs)`:
- under 1 min → "just now";
- under 60 min → "N min ago";
- under 24 h → "N h ago";
- 1 calendar day → "yesterday";
- otherwise "N days ago";
- `null` or invalid → "" (the note then omits " · updated …").

It is injected with `nowMs` for tests and lives in `src/lib/requestRows.ts`.

### Decision 4: Pull-to-refresh

**Chosen:**
- The hook's `refetch` is wrapped: `markMyRequestsForcedRefresh(); return query.refetch()`.
- The screen keeps a local `pulling` state:
  ```ts
  setPulling(true);
  Promise.allSettled([Promise.resolve(myRefetch()), isManager ? Promise.resolve(teamRefetch()) : null])
    .finally(() => setPulling(false));
  ```
- `refreshing={pulling}`.
- Retry buttons call `myRefetch` (also forced).

**Rationale:**
- `refetch` is only called by user actions (requests explorer §2), never by focus refetches.
- A local `pulling` flag shows the spinner only for user pulls: a `refreshing` tied to `isFetching` would show a spinner on every background focus refetch.
- Existing SC3.5 tests (mocks returning `undefined`) still pass because `Promise.resolve(undefined)` is fine.

### Decision 5: No "No requests yet" flash on cold start

**Chosen:** the hook returns `isLoading: query.isLoading || isRestoring || (configLoading && !data)`, where `isRestoring = useIsRestoring()` and `configLoading` comes from `useConfig().isLoading`. The screen already shows skeletons while `isLoading && entries.length === 0` (`approvals.tsx:214`).

**Rationale:** This is a hook-level fix, so every consumer benefits. `PersistQueryClientProvider` supplies `IsRestoringProvider`, so the value is accurate.

---

### Decision 6: Restore-aware root gate

**Chosen:** in `RootLayout` (`app/_layout.tsx:86-166`), `const isRestoring = useIsRestoring()`. `RootLayout` is rendered inside `PersistQueryClientProvider` (`:171-176`), so the value is real. Then:
- the auth-gate effect returns early while `isLoading || isRestoring`;
- the splash-hide effect waits for `!isLoading && !isRestoring`;
- the overlay condition becomes `isLoading || isRestoring || !fontsLoaded`.

**Rationale:** This is the same root cause as Decision 5, at the app level. It is one hook call with no new state, and no native change.

**Rejected:** delaying the gate with a timer, which is racy and slows every cold start.

## Interface Contracts

### Types

```typescript
// src/lib/requestRows.ts (new)
export type MyRequestRow =
  | { type: 'header'; label: string }               // computed: 'This Week' | 'Last Week' | '2 Weeks Ago' | month label
  | { type: 'entry'; entry: ManualRequestEntry }     // source: useMyRequests().entries (spec 02 store view)
  | { type: 'older-toggle'; count: number; expanded: boolean }; // computed: number of entries with date < prevMonday2; UI state

export interface RequestRowBounds {
  currentMonday: string; // computed: getWeekStartDate() (approvals.tsx:218)
  prevMonday1: string;   // computed: Monday 7 days earlier (approvals.tsx:219-221)
  prevMonday2: string;   // computed: Monday 14 days earlier (new; same noon-anchored math)
}

// UseMyRequestsResult (src/types/requests.ts) — spec 02's shape plus one optional field:
//   refetch: () => void   — now forced (marks one-shot flag, then query.refetch())
//   isLoading             — now also true while restoring / while config loads with no data
export interface UseMyRequestsResult {
  // …spec 02 fields unchanged…
  errorCode?: string | null; // new. Source: the thrown AuthError's errorCode (spec 01 constants, e.g. 'NO_CREDENTIALS', 'AUTH_LOGIN_LATCHED'),
                             // else null. Optional, so existing hook mocks (approvals-mesh) still type-check.
}
```

### Function Contracts

| Function | Signature | Responsibility | Dependencies |
|----------|-----------|----------------|--------------|
| `buildMyRequestRows` | `(entries: ManualRequestEntry[], bounds: RequestRowBounds, olderExpanded: boolean) => MyRequestRow[]` | 3 bounded buckets. If any entries are older than `prevMonday2`, add an `older-toggle` row with their count. If expanded, add month headers + entries (newest month first, entries already sorted desc). Empty buckets are omitted. | — |
| `monthLabel` | `(date: string) => string` | `'2026-09-14'` → `'September 2026'` (fixed English month names; no `Intl` dependency, so Hermes and jest give the same output) | — |
| `formatUpdatedAgo` | `(iso: string \| null \| undefined, nowMs: number) => string` | Decision 3 | — |
| `freshnessNote` | `(args: { hasEntries: boolean; error: 'auth' \| 'network' \| null; errorCode: string \| null; staleDates: string[]; updatedAt: string \| null; nowMs: number }) => string \| null` | `null` when `!hasEntries` or there is nothing to say; otherwise the Decision 2 note text. The " · updated {ago}" part is omitted when `formatUpdatedAgo` returns "" | `formatUpdatedAgo` |
| `requestsBannerText` | `(error: 'auth' \| 'network', errorCode: string \| null) => string` | The Decision 2 no-data banner text | `NO_CREDENTIALS` |
| `requestsErrorRetryable` | `(error: 'auth' \| 'network' \| null, errorCode: string \| null) => boolean` | Whether to show Retry (note and banner): `true` when `error` is set, except `'auth'` + `NO_CREDENTIALS`; `false` when there is no error | `NO_CREDENTIALS` |
| `useMyRequests` | unchanged signature | Forced `refetch`; restore-aware `isLoading` (Decisions 4-5); `errorCode` = `queryError instanceof AuthError ? queryError.errorCode ?? null : null` (added to spec 02's `selectMyRequests`) | `markMyRequestsForcedRefresh`, `useIsRestoring`, `useConfig`, `AuthError` |
| `ApprovalsScreen` | — | Uses the extracted rows, `older-toggle` (`AnimatedPressable`, `useState`), the note, the bounded banner with `requestsBannerText`, Retry gated by `requestsErrorRetryable`, `pulling` state. Defaults `errorCode ?? null` | above |
| `RootLayout` (`app/_layout.tsx`) | — | Auth gate, splash hide and overlay wait for `!isRestoring` (Decision 6) | `useIsRestoring` |

---

## Test Plan

### `buildMyRequestRows` (`src/lib/__tests__/requestRows.test.ts`, new)

**Happy Path:**
- Entries in all 3 recent buckets give headers in order "This Week", "Last Week", "2 Weeks Ago", each followed by its entries.
- Entries older than `prevMonday2`, collapsed → the 3 buckets, then `{type:'older-toggle', count: N, expanded: false}`, and no older entries.
- Expanded → the toggle row, then the 'October 2026' header with its entries, then 'September 2026' with its entries.

**Edge Cases:**
- An entry exactly on `prevMonday2` → "2 Weeks Ago" (the bound is inclusive).
- An entry the day before → older.
- No entries → `[]`.
- Only older entries → only the toggle (plus month groups when expanded).
- A year boundary: 'December 2025' comes after 'January 2026'.

**Error Cases:** a malformed date string sorts as-is and lands in older; no throw.

**Mocks Needed:** none.

### `formatUpdatedAgo` / `freshnessNote` (same file)

**Happy Path:**
- `formatUpdatedAgo`: 30 s → "just now"; 5 min → "5 min ago"; 3 h → "3 h ago"; the previous calendar day → "yesterday"; 4 days → "4 days ago".
- `freshnessNote`, with entries:
  - `'network'` → "Showing saved requests · updated 5 min ago";
  - `'auth'` with `errorCode: null` → "Can't sign in to Crossover right now · showing saved requests · updated 5 min ago";
  - `'auth'` with `'AUTH_LOGIN_LATCHED'` → the same neutral text;
  - `'auth'` with `'NO_CREDENTIALS'` → "Saved sign-in missing · showing saved requests · sign out and back in from Settings";
  - stale dates with no error → "Some days couldn't refresh · updated 5 min ago".
- `requestsBannerText`:
  - `('network', null)` → "Could not load requests.";
  - `('auth', null)` and `('auth', 'AUTH_LOGIN_LATCHED')` → "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.";
  - `('auth', 'NO_CREDENTIALS')` → "Your saved sign-in is missing. Sign out and back in from Settings.".
- `requestsErrorRetryable`: `('auth', 'NO_CREDENTIALS')` → false; `('auth', null)` → true; `('auth', 'AUTH_LOGIN_LATCHED')` → true; `('network', null)` → true; `(null, null)` → false.

**Edge Cases:** `updatedAt` null → the text without " · updated …"; no entries → `null`; no error, no stale dates → `null`; future timestamp → "just now". No note or banner text contains "password" or "re-open" (a guard against the old copy coming back).

**Error Cases:** invalid ISO → "".

### `useMyRequests` (static, `src/hooks/__tests__/useMyRequests.test.ts`)

- The source contains `useIsRestoring` and `markMyRequestsForcedRefresh()` inside the returned `refetch`.
- `markMyRequestsForcedRefresh` behaviour itself is already covered in spec 02.
- `selectMyRequests` (spec 02's pure mapper, extended) `errorCode` cases:
  - a thrown `AuthError(401, …, {errorCode: 'NO_CREDENTIALS'})` → `error: 'auth'`, `errorCode: 'NO_CREDENTIALS'`;
  - `AuthError(401)` → `'auth'`, `null`;
  - `NetworkError` → `'network'`, `null`;
  - no error → `null`, `null`.

### `ApprovalsScreen` (`app/(tabs)/__tests__/approvals.test.tsx`, extend)

**Happy Path:**
- Older entries collapsed → "Show older requests (2)" is visible and the older memos are absent. Pressing it shows the 'September 2026' header and the memos.
- An error with entries → the note text "Showing saved requests" is present; "Could not load requests." and "Authentication error" are absent; the entries render.
- An `'auth'` error with entries → "Can't sign in to Crossover right now · showing saved requests" and a Retry, and the entries render.
- `staleDates` with no error → "Some days couldn't refresh".

**Edge Cases:**
- An `'auth'` error with no entries and `errorCode` unset → the red banner "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.", with Retry.
- An `'auth'` error with `errorCode: 'NO_CREDENTIALS'`:
  - no entries → the banner "Your saved sign-in is missing. Sign out and back in from Settings.", and **no** Retry;
  - with entries → the note "Saved sign-in missing · …", and no Retry.
- No rendered text contains "re-open" or "password".
- `isLoading` with no entries → skeletons (the existing FR5 tests).

**Error Cases:** a pull-to-refresh whose `refetch` returns a rejected promise → the `refreshing` prop goes back to `false` (flush with `act`).

**Existing:**
- SC3.5 (`:425-443`) unchanged: `myRefetch` is called once, and `teamRefetch` once for a manager.
- SC4.1-SC4.4 ("No requests yet") unchanged.
- No test asserts the old auth copy (`grep 're-open'` → none), so nothing breaks.

**Mocks Needed:** the existing `jest.mock('@/src/hooks/useMyRequests')`, `useApprovalItems`, `useIsManager`.

### Root gate (`app/__tests__/layout-notifications.test.tsx`, extend)

- **Mock update (required):** that file mocks `@tanstack/react-query` with only `QueryClient`, `QueryClientProvider` and `focusManager` (`:110-116`). Add `useIsRestoring: jest.fn(() => false)`, or every render of `RootLayout` there throws "useIsRestoring is not a function". Apply the same to any other test that renders `RootLayout` with that mock; `app/__tests__/root-layout-tokens.test.tsx` is source-only, so re-run it to confirm.
- New: with `useIsRestoring` returning `true`, `setupComplete: false` and `isLoading: false` → `router.replace` is **not** called. When it flips to `false` → it is called with `'/(auth)/welcome'`.
- New: with `useIsRestoring` `true`, `setupComplete: true`, while segments are in `(tabs)` → `router.replace` is never called with `'/(auth)/welcome'`.

### Existing tests that change (and how)

| Test | Change |
|------|--------|
| `app/(tabs)/__tests__/approvals.test.tsx` source checks (`:214-255`, `:494-520`) | Re-run. If any grep pins `'2 Weeks Ago'` inside `approvals.tsx`, update it to `src/lib/requestRows.ts` (the label moves) |
| `app/(tabs)/__tests__/approvals.test.tsx` SC3.5, SC4.x, FR5 | Unchanged |
| `app/(tabs)/__tests__/approvals-mesh.test.tsx` (renders the screen with a mocked `useMyRequests`, `:38,172,253-295`) | Unchanged. Its mock return lacks `staleDates`/`updatedAt`, so the screen must default them (`staleDates ?? []`, `updatedAt ?? null`) |
| `__tests__/approvals-screen.test.tsx` (source checks `:28-82`: no `StyleSheet.create`, no hex colours, contains `bg-critical`, `SkeletonLoader`) | Must keep passing. The note uses NativeWind classes only, and the red no-data banner keeps `bg-critical/10` |
| `src/components/__tests__/MotionUniversality.test.tsx` FR2 (`:57-80`: no `Pressable` import from `react-native`) | Must keep passing. The older toggle uses `AnimatedPressable` |
| `app/__tests__/layout-notifications.test.tsx` | Add `useIsRestoring` to the `@tanstack/react-query` mock (see Root gate) |

### Verification commands

```
npx jest src/lib/__tests__/requestRows.test.ts "app/(tabs)/__tests__/approvals.test.tsx" "app/(tabs)/__tests__/approvals-mesh.test.tsx" \
  __tests__/approvals-screen.test.tsx src/components/__tests__/MotionUniversality.test.tsx src/hooks/__tests__/useMyRequests.test.ts \
  src/components/__tests__/MyRequestCard.test.tsx app/__tests__/layout-notifications.test.tsx app/__tests__/root-layout-tokens.test.tsx
npm test && npm run typecheck && npm run lint
npx expo-updates runtimeversion:resolve --platform ios   # == 56d054fc723984e56892a367dca1efa79a9f8fad (fingerprint unchanged)
git diff --stat -- app.json package.json package-lock.json plugins ios android   # empty
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/requestRows.ts` | create | `buildMyRequestRows`, `monthLabel`, `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable` |
| `src/lib/__tests__/requestRows.test.ts` | create | Unit tests |
| `app/(tabs)/approvals.tsx` | modify | Use the extracted rows, Older toggle, note, bounded banner, neutral auth copy, Retry gating, `pulling` state |
| `src/hooks/useMyRequests.ts` | modify | Forced `refetch`; restore-aware `isLoading`; `errorCode` in `selectMyRequests` |
| `src/types/requests.ts` | modify | Optional `UseMyRequestsResult.errorCode` |
| `app/(tabs)/__tests__/approvals.test.tsx` | modify | New cases |
| `src/hooks/__tests__/useMyRequests.test.ts` | modify | Static checks |
| `app/_layout.tsx` | modify | Restore-aware auth gate, splash and overlay (Decision 6) |
| `app/__tests__/layout-notifications.test.tsx` | modify | `useIsRestoring` in the mock; gate tests |

---

## Edge Cases to Handle

1. **The Older toggle with the manager section present.** Toggle state is local to My Requests, and the team rows are unaffected.
2. **A large history** (24 weeks × many entries) renders via `map` in a `ScrollView` (`approvals.tsx:373-381`). Collapsed by default, the cost is unchanged. Expanded, about 200 `MyRequestCard`s is acceptable. Virtualization is not needed at this size.
3. **Week rollover while the screen is open.** Bounds are recomputed on every render (`approvals.tsx:218-221`).
4. **The note's `nowMs`** is read at render (`Date.now()`); there is no timer. The text refreshes on the next render or refetch.
5. **Dev manager preview.** The mocks have no `updatedAt`, so no note.

---

## Open Questions

✓ Collapse Older by default? → Yes (Decision 1).
✓ Red banner or quiet note? → The note when data exists, the banner when empty (Decision 2).
✓ Does `'auth'` mean the password was rejected? → No. It also covers a missing sign-in (`NO_CREDENTIALS`) and an endpoint refusing a fresh token. The copy is neutral, and only `NO_CREDENTIALS` gets its own text (Decision 2).
✓ Does the pull-to-refresh API change? → No. `refetch` becomes forced (Decision 4).
✓ Is the welcome-screen bounce on cold start in scope? → Yes, Decision 6 (critique correction 7).

None remaining.
