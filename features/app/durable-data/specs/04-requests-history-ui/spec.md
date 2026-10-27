# Requests History UI

**Status:** Draft
**Created:** 2026-10-22
**Last Updated:** 2026-10-22
**Owner:** @jaime-alvarez-trilogy

**Feature:** [durable-data](../../FEATURE.md) · **Research:** [spec-research.md](spec-research.md) · **Builds on:** [01-auth-renewal](../01-auth-renewal/spec.md), [02-requests-store](../02-requests-store/spec.md), [03-keep-last-good](../03-keep-last-good/spec.md) (all done, `968f1d5..821f567`) · **Branch:** `feat/sdk-58` (1.2.0) · **Fingerprint:** must stay `56d054fc723984e56892a367dca1efa79a9f8fad`

---

## Overview

After spec 02, `useMyRequests` returns up to 24 weeks of stored requests, plus `staleDates` and `updatedAt`. This spec makes the Requests screen, and the root gate in front of it, ready for that. It is UI and hook wiring only: no store, planner or API change.

**What gets built:**

1. **Pure row and copy helpers** (`src/lib/requestRows.ts`, new). `buildMyRequestRows` moves out of `app/(tabs)/approvals.tsx`. "2 Weeks Ago" is bounded to `prevMonday2 <= date < prevMonday1`. Anything older goes behind an `older-toggle` row ("Show older requests (N)"), which is collapsed by default and, when expanded, is grouped under month headers ("September 2026"), newest first. The same module holds the copy: `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable` and `myRequestsEmptyState`.
2. **Hook wiring** (`src/hooks/useMyRequests.ts`, `src/types/requests.ts`):
   - `selectMyRequests` also returns `errorCode`: the `AuthError`'s `errorCode` when the error maps to `'auth'`, else `null`.
   - The returned `refetch` is forced: it calls spec 02's existing `markMyRequestsForcedRefresh()`, then TanStack's `refetch()`, and returns that promise.
   - `isLoading` is restore-aware: `query.isLoading || isRestoring || (configLoading && data === undefined)`.
3. **The screen** (`app/(tabs)/approvals.tsx`):
   - It uses the extracted rows and the local Older toggle.
   - When entries are visible, a failed or partial refresh shows one quiet note ("Showing saved requests · updated 5 min ago"), not the red banner.
   - When nothing is visible, it shows the red banner with neutral auth copy (never "re-open", never "password"). Retry is hidden when it cannot help (`NO_CREDENTIALS`).
   - It shows an honest "incomplete" empty state when a partial failure leaves nothing visible.
   - Pull-to-refresh keeps the spinner up with a local `pulling` flag until the forced refetch settles.
4. **A restore-aware root gate** (`app/_layout.tsx`). The auth-gate redirect, the splash hide and the loading overlay all wait for `!useIsRestoring()`. This stops the welcome screen from flashing on a signed-in cold start.

**Release coupling:** spec 02 and this spec ship together. Without this spec, stored entries older than the 3-week window would sit in an unbounded "2 Weeks Ago" bucket (spec 02 Out Of Scope #1).

JS-only. No new dependencies, and no changes to `package.json`, `package-lock.json`, `app.json`, `eas.json`, `ios/`, `android/` or `patches/`. `useIsRestoring` ships in the installed `@tanstack/react-query` 5.104.5 (`build/modern/IsRestoringProvider.js`).

---

## Clarification Decisions (Step 3, autonomous)

spec-research.md has no open questions. Checking it against the real code at `821f567` (specs 01-03 done) raised these points. Each one is decided here.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| C1 | Which names did specs 01-03 actually export? | We use these exports as they exist:<br>- `useMyRequests.ts`: `markMyRequestsForcedRefresh()` (exported, **not yet wired**: the hook returns TanStack's raw `refetch`), `selectMyRequests(data, config, queryError)` (returns `entries`, `error`, `staleDates`, `updatedAt`) and `toRequestsError(err)`.<br>- `src/api/errors.ts`: `AuthError` (with `errorCode?`), `NO_CREDENTIALS`, `AUTH_LOGIN_LATCHED` and `AUTH_HTML_500`.<br>- `src/types/requests.ts`: `UseMyRequestsResult` already has optional `staleDates?` and `updatedAt?`.<br>- `src/lib/approvals.ts`: `getWeekStartDate`. | Spec 02 C9 deferred the wiring to this spec. Using the real names avoids a second API. |
| C2 | Which errors carry `errorCode`? | **Only errors that map to `'auth'`.** `errorCode = toRequestsError(queryError) === 'auth' && queryError instanceof AuthError ? queryError.errorCode ?? null : null`. Three consequences:<br>- An `AuthError(AUTH_HTML_500)`, which maps to `'network'`, reports `errorCode: null`.<br>- A legacy blob's own `error: 'auth'` with no thrown error reports `null`.<br>- The `{}` error that spec 03 restores from a persisted errored query is not an `AuthError`, so it reports `null`. | The UI reads `errorCode` only for `'auth'`, so a `'network'` error should not carry an auth code around. |
| C3 | **(research-qc)** `entries` is empty, `error` is `null` and `staleDates` is non-empty: a partial refresh failure that leaves nothing visible. What does the screen show? | **An "incomplete" empty state, never "No requests yet".** The empty card reads **"Some days couldn't refresh, so requests may be missing."** with a Retry action, which is a forced refetch. The pure `myRequestsEmptyState(error, staleDates)` returns `'incomplete'` for this case. | "No requests yet" claims the server confirmed an empty window, but some days were never checked. This state only arises after a partial failure on a sparse store (for example, today returned `[]` and older window days failed with no record). A forced refetch re-plans the whole window, so Retry helps here even though `error` is `null`. |
| C4 | `entries` is empty and `error` is set. Today the screen renders the red banner **and** the "No requests yet" card beneath it. | **Banner only.** The empty card is not rendered while `error` is set (`myRequestsEmptyState` → `'error'`). | "No requests yet" under "Could not load requests." contradicts itself, and it is a false confirmation (the same principle as C3). No existing test asserts both (`grep` in `approvals*.test.tsx`). |
| C5 | Does `refetch` keep its type? | It widens to `refetch: () => Promise<unknown> \| void`. The hook returns `() => { markMyRequestsForcedRefresh(); return query.refetch(); }`. | The screen awaits it for the spinner (`Promise.resolve(myRefetch())`). Existing jest mocks return `undefined`, which is still valid. No production code builds a `UseMyRequestsResult` by hand. |
| C6 | Should the forced `refetch` be wrapped in `useCallback`? | **No: use a plain closure.** | `useMyRequests.test.ts` DD2.55 calls the hook as a plain function, outside a render, so any extra React hook would throw. No consumer relies on `refetch` identity: it is only used in `onPress` and `onRefresh`. |
| C7 | Which test mocks must learn `useIsRestoring`? | Two:<br>- **`app/__tests__/layout-notifications.test.tsx`**: its `@tanstack/react-query` factory (`:110-116`) has only `QueryClient`, `QueryClientProvider` and `focusManager`. Add `useIsRestoring: () => mockIsRestoring`.<br>- **`src/hooks/__tests__/useMyRequests.test.ts`**: its mock spreads `requireActual` (`:44-47`), but DD2.55 calls the hook outside a render, so the real `React.useContext` would throw. Add `useIsRestoring: jest.fn(() => false)`.<br>The layout test's `useRouter` mock also returns a fresh `replace` on every call (`:93`). Hoist a shared `mockReplace` so the gate tests can assert on it. | Without these, every `RootLayout` render and every DD2.55 case throws. `root-layout-tokens.test.tsx` is source-only, so it only needs a re-run. |
| C8 | Exact `isLoading` rule. | `isLoading: query.isLoading \|\| isRestoring \|\| (configLoading && data === undefined)`. `isRestoring = useIsRestoring()` and `configLoading = useConfig().isLoading`. | This is research Decision 5, with `!data` tightened to `data === undefined` so only a never-loaded query (not a cached falsy value) holds the skeleton. While `PersistQueryClientProvider` restores, `useBaseQuery` neither subscribes nor fetches (`useBaseQuery.js:36,42`), so `config` is `null` with `isLoading: false`. Outside a provider, `useIsRestoring()` is `false` (context default), so tests and other trees are unaffected. |
| C9 | Existing screen fixtures are dated in March 2026 (`MOCK_ENTRY_PENDING` `2026-03-17`, approvals-mesh `MOCK_ENTRY` `2026-03-24`). | **Make the screen fixtures relative.** `approvals.test.tsx`'s `MOCK_ENTRY_PENDING.date` (and its `id`) use the file's existing `getCurrentMondayString()`. `approvals-mesh.test.tsx`'s `MOCK_ENTRY` gets the same treatment, with a local helper of the same shape. | Under bounded buckets, a March entry lands behind the collapsed toggle. That would break SC3.2 "my-request-card is rendered for manager with own entries", and any mesh case that counts cards. The old unbounded "2 Weeks Ago" bucket was the only thing that kept these fixtures visible. |
| C10 | How does the Older toggle look? | It is an `AnimatedPressable` row. Collapsed: "Show older requests (N)". Expanded: "Hide older requests". Text: `text-textSecondary text-sm font-sans-semibold`, centred, `mx-4 my-2 py-2`. It has `accessibilityRole="button"`, an `accessibilityLabel` equal to the label, and `testID="older-toggle"`. | MotionUniversality FR2 forbids a `react-native` `Pressable` in this file. The brand guide reserves violet for BrainLift, so the new control stays neutral. The existing Retry links keep their current `text-violet` styling; restyling them is out of scope. |
| C11 | Month labels and malformed dates. | `monthLabel('YYYY-MM-DD')` returns fixed English month names plus the year (`'September 2026'`). An entry whose `date` does not match `/^\d{4}-\d{2}-\d{2}$/` always counts as older. It is grouped under **"Other dates"**, which comes after every month group. `monthLabel` returns `'Other dates'` for such input and never throws. | Fixed names avoid an `Intl` dependency, so Hermes and jest agree. Without the regex, `'garbage' >= currentMonday` would be true as a string comparison and drop a malformed entry into "This Week". |
| C12 | Order inside Older. | Month groups are ordered by month key (`YYYY-MM`) descending, with "Other dates" last. Inside a group, entries keep their input order (the view is already sorted descending by `composeRequestsView`). | Spec 05 grows the view with `setQueryData`. Sorting the groups keeps them correct even if a merge appends out of order, at no cost. |
| C13 | Where does the note sit, and how does it look? | Directly under the "My Requests" `SectionLabel`. It is a `flex-row items-center mx-4 mb-2 gap-3` container (`testID="my-requests-note"`) holding a `Text` with `text-textSecondary text-xs flex-1`. When Retry applies, it is followed by the existing Retry markup: an `AnimatedPressable` → `text-violet font-sans-semibold text-sm`, with `onPress={myRefetch}`. | This is research Decision 2. It also keeps MotionUniversality SC2.4b (`AnimatedPressable` within 200 characters of `myRefetch`) and approvals-screen FR1 (`bg-critical` still present for the no-data banner) passing. |
| C14 | Is there any new logging? | **None.** | This spec only changes the UI. Refresh failures are already logged by spec 02 (`requests.refresh_failed`), and a forced refresh is an ordinary user action. `src/lib/log.ts` conventions are untouched. |
| C15 | Should the pull spinner also wait for the team refetch? | **No.** `useApprovalItems().refetch` returns `void` (`useApprovalItems.ts:119-122`), so `Promise.allSettled` settles its slot at once. The spinner follows the My Requests forced refetch, which runs for every user. | Changing `useApprovalItems` is outside this feature (Out Of Scope #4). The team section has its own skeletons and banner. |
| C16 | Docs. | Update `docs/ARCHITECTURE.md` §4.4 step 6 (Display): `errorCode`, the forced `refetch`, restore-aware `isLoading`, the note/banner/incomplete split and the Older grouping. Update the header comment of `useMyRequests.ts`. The `FEATURE.md` changelog is updated at the end (checklist). | This keeps the architecture doc true. Spec 02 wrote §4.4. |
| C17 | Process (Steps 4 and 6). | The spec author drafted the sections directly, as spec 02 did (spec 02 C14): this sub-agent has no Agent tool, and the Codex CLI is not installed (`which codex` → not found). The coherence check was a manual cross-check of FR ids, type names, file lists and Out Of Scope classes. | This is a process deviation, not a content one. The checklist's Phase 4.2 review still runs. |

---

## Out Of Scope

1. **Backfilling weeks older than the 3-week window, and mounting the backfill hook in this screen.** **Deferred to [05-requests-backfill](../05-requests-backfill/spec-research.md).** This spec only makes the Older section render whatever the view holds, so spec 05's weeks appear without further UI work.
2. **Per-card staleness badges** (a `MyRequestCard` prop). **Descoped** (research Decision 2, rejected). One failed day does not deserve a badge on every card. `MyRequestCard.tsx` is unchanged.
3. **Persisting the Older toggle's expanded state.** **Descoped** (research Decision 1). It is local `useState` and resets when the screen remounts.
4. **Making `useApprovalItems().refetch` return its promise**, or holding the pull spinner for the team queue. **Descoped** (C15). The team queue is not part of durable-data.
5. **A timer that re-renders the "updated … ago" text.** **Descoped** (research edge case 4). It refreshes on the next render or refetch.
6. **Virtualizing the expanded Older list.** **Descoped** (research edge case 2). About 200 cards inside the existing `ScrollView` is acceptable, and the list is collapsed by default.
7. **A third auth text for `AUTH_LOGIN_LATCHED`.** **Descoped** (research Decision 2). The latch lasts 60 s, and the neutral text already covers a refused login.
8. **Restyling the existing Retry and team-banner controls** (violet against the brand rule). **Descoped** (C10). They are untouched existing UI.
9. **Store, planner, API, persister or `staleTime` changes.** **Descoped.** Specs 01-03 own them, and this spec consumes their outputs unchanged.
10. **Widget "My Requests" wiring.** **Descoped, follow-up F1** (FEATURE.md Out of Scope).
11. **Any OTA, `eas`, `asc.js`, version bump, push or PR.** **Descoped.** Release mechanics (`docs/RELEASING.md`).

---

## Functional Requirements

### FR1: Bounded buckets and a collapsible, month-grouped Older section (pure rows)

`src/lib/requestRows.ts` builds the My Requests rows. "2 Weeks Ago" is bounded, and older entries sit behind a toggle row, grouped by month.

**Requirements:**
- `export type MyRequestRow = { type: 'header'; label: string } | { type: 'entry'; entry: ManualRequestEntry } | { type: 'older-toggle'; count: number; expanded: boolean }`.
- `export interface RequestRowBounds { currentMonday: string; prevMonday1: string; prevMonday2: string }`.
- `export function buildMyRequestRows(entries, bounds, olderExpanded: boolean): MyRequestRow[]`:
  - A valid date (`/^\d{4}-\d{2}-\d{2}$/`) goes into a bucket:
    - "This Week": `date >= currentMonday`;
    - "Last Week": `prevMonday1 <= date < currentMonday`;
    - "2 Weeks Ago": `prevMonday2 <= date < prevMonday1`.

    Everything else is **older**, including every malformed date (C11).
  - Buckets are emitted in that order. Each is a `header` row followed by its `entry` rows, in input order. Empty buckets are omitted.
  - If there is at least one older entry, one `{ type: 'older-toggle', count, expanded: olderExpanded }` follows the buckets. `count` is the number of older entries.
  - When `olderExpanded` is true, the toggle is followed by one `header` per month (`monthLabel`) with its entries. Months are ordered by key descending, and "Other dates" comes last (C12). When it is false, no older entry rows are emitted.
  - The function is pure and never throws.
- `export function monthLabel(date: string): string`: `'2026-09-14'` → `'September 2026'`, using fixed English month names. Malformed input → `'Other dates'`.
- `app/(tabs)/approvals.tsx` no longer defines `buildMyRequestRows` or its local `MyRequestRow` type. `buildTeamQueueRows` and `TeamQueueRow` stay where they are, unchanged.

**Success Criteria:**
- [ ] One entry in each of the 3 recent weeks gives `[header 'This Week', entry, header 'Last Week', entry, header '2 Weeks Ago', entry]`, with no toggle.
- [ ] An entry dated exactly `prevMonday2` lands in "2 Weeks Ago". An entry dated the day before is older: it is counted in the toggle and absent from the buckets.
- [ ] Recent entries plus 2 older ones, collapsed: the buckets, then `{ type: 'older-toggle', count: 2, expanded: false }` as the last row, with no older entry rows.
- [ ] The same input expanded: the toggle has `expanded: true`, then `header 'October 2026'` with its entries, then `header 'September 2026'` with its entries.
- [ ] A year boundary, expanded: `'January 2026'` comes before `'December 2025'`.
- [ ] `[]` → `[]`. Only older entries, collapsed → exactly one toggle row; expanded → the toggle plus the month groups.
- [ ] A malformed date (`'garbage'`) never lands in a recent bucket. It is counted in the toggle, and when expanded it appears under `'Other dates'`, after every month group. Nothing throws.
- [ ] `monthLabel`: `'2026-09-14'` → `'September 2026'`, `'2025-12-01'` → `'December 2025'`, `'garbage'` → `'Other dates'`.
- [ ] Static check: `approvals.tsx`, comments stripped, has no `function buildMyRequestRows`, and imports `buildMyRequestRows` from `@/src/lib/requestRows`.

---

### FR2: Honest freshness, banner and empty-state copy (pure)

`src/lib/requestRows.ts` decides every My Requests message and whether Retry is offered. No message says "re-open", and none mentions a password.

**Requirements:**
- `export function formatUpdatedAgo(iso: string | null | undefined, nowMs: number): string`:
  - `null`, `undefined` or an unparseable value → `''`;
  - an age under 60 s, including a future time → `'just now'`;
  - under 60 min → `` `${floor(min)} min ago` ``;
  - under 24 h → `` `${floor(h)} h ago` ``;
  - otherwise, by calendar days between the local dates (noon-anchored): 1 → `'yesterday'`, N → `` `${N} days ago` ``.
- `export function freshnessNote({ hasEntries, error, errorCode, staleDates, updatedAt, nowMs }): string | null`. Here `ago = formatUpdatedAgo(updatedAt, nowMs)` and `upd = ago ? ' · updated ' + ago : ''`.
  - `!hasEntries` → `null`.
  - `error === 'network'` → `'Showing saved requests' + upd`.
  - `error === 'auth'` with `errorCode === NO_CREDENTIALS` → `'Saved sign-in missing · showing saved requests · sign out and back in from Settings'`.
  - `error === 'auth'` with any other `errorCode`, including `null` and `AUTH_LOGIN_LATCHED` → `"Can't sign in to Crossover right now · showing saved requests" + upd`.
  - No error and `staleDates.length > 0` → `"Some days couldn't refresh" + upd`.
  - Otherwise → `null`.

  An error wins over `staleDates`.
- `export function requestsBannerText(error: 'auth' | 'network', errorCode: string | null): string`:
  - `'network'` → `'Could not load requests.'`;
  - `'auth'` with `NO_CREDENTIALS` → `'Your saved sign-in is missing. Sign out and back in from Settings.'`;
  - any other `'auth'` → `"Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings."`.
- `export function requestsErrorRetryable(error, errorCode): boolean`. It returns `true` when `error` is set, except for `'auth'` with `NO_CREDENTIALS`, and `false` when there is no error.
- `export type MyRequestsEmptyState = 'error' | 'incomplete' | 'none'` and `export function myRequestsEmptyState(error, staleDates): MyRequestsEmptyState`:
  - `error` set → `'error'`;
  - else `staleDates.length > 0` → `'incomplete'`;
  - else `'none'`.
- `export const INCOMPLETE_EMPTY_TEXT = "Some days couldn't refresh, so requests may be missing."` (C3).
- `NO_CREDENTIALS` is imported from `../api/errors`. It is never re-declared as a literal.

**Success Criteria:**
- [ ] `formatUpdatedAgo` with a fixed `nowMs`:
  - 30 s → `'just now'`; 5 min → `'5 min ago'`; 3 h → `'3 h ago'`;
  - the previous calendar day, 26 h earlier → `'yesterday'`; 4 days → `'4 days ago'`;
  - +5 min in the future → `'just now'`; `null`, `undefined` and `'not-a-date'` → `''`.
- [ ] `freshnessNote` with entries and `updatedAt` 5 min old:
  - `'network'` → `'Showing saved requests · updated 5 min ago'`;
  - `'auth'` with `null`, and `'auth'` with `'AUTH_LOGIN_LATCHED'` → `"Can't sign in to Crossover right now · showing saved requests · updated 5 min ago"`;
  - `'auth'` with `'NO_CREDENTIALS'` → `'Saved sign-in missing · showing saved requests · sign out and back in from Settings'`;
  - no error with `staleDates: ['2026-10-20']` → `"Some days couldn't refresh · updated 5 min ago"`;
  - `'network'` with stale dates → the network text (the error wins).
- [ ] `freshnessNote` edges:
  - `updatedAt: null` with `'network'` → `'Showing saved requests'`, with no `' · updated'`;
  - `hasEntries: false` → `null`;
  - no error and no stale dates → `null`.
- [ ] `requestsBannerText`:
  - `('network', null)` → `'Could not load requests.'`;
  - `('auth', null)` and `('auth', 'AUTH_LOGIN_LATCHED')` → the neutral sentence;
  - `('auth', 'NO_CREDENTIALS')` → `'Your saved sign-in is missing. Sign out and back in from Settings.'`.
- [ ] `requestsErrorRetryable`: `('auth', 'NO_CREDENTIALS')` → false; `('auth', null)`, `('auth', 'AUTH_LOGIN_LATCHED')` and `('network', null)` → true; `(null, null)` → false.
- [ ] `myRequestsEmptyState`:
  - `('network', [])` and `('auth', ['2026-10-20'])` → `'error'`;
  - `(null, ['2026-10-20'])` → `'incomplete'`;
  - `(null, [])` → `'none'`.
- [ ] Copy guard: every string these functions can return, plus `INCOMPLETE_EMPTY_TEXT`, matches neither `/re-?open/i` nor `/password/i`.

---

### FR3: `useMyRequests` exposes `errorCode`, forces its `refetch`, and is restore-aware

**Requirements:**
- `src/types/requests.ts`, `UseMyRequestsResult`:
  - add `errorCode?: string | null`. It stays optional, so the mocks in `approvals*.test.tsx` still type-check (C5).
  - `refetch` becomes `() => Promise<unknown> | void`.
  - Its doc comments are updated (forced refresh; `isLoading` includes restore).
- `selectMyRequests` returns `Required<Pick<UseMyRequestsResult, 'entries' | 'error' | 'errorCode' | 'staleDates' | 'updatedAt'>>`. `errorCode` follows C2. Every other field is unchanged.
- `useMyRequests()`:
  - `const isRestoring = useIsRestoring()`, imported from `@tanstack/react-query`;
  - `const { config, isLoading: configLoading } = useConfig()`;
  - it returns `isLoading: query.isLoading || isRestoring || (configLoading && data === undefined)` (C8);
  - it returns `refetch: () => { markMyRequestsForcedRefresh(); return query.refetch(); }`, a plain closure (C6).

  `queryKey`, `queryFn`, `staleTime: 60_000`, `enabled` and `retry: shouldRetryQuery` are unchanged.
- Existing tests in `src/hooks/__tests__/useMyRequests.test.ts` that change:
  - the mock gains `useIsRestoring: jest.fn(() => false)` (C7);
  - DD2.56's `toEqual` objects gain `errorCode` (`null`, or `'NO_CREDENTIALS'` for the "missing credentials on a cold cache" case);
  - DD2.55's "returns the selected view …" case gains `errorCode: null`, and its `returnedRefetch toBe(refetch)` becomes a behavioural check (DD4.16).

**Success Criteria:**
- [ ] `selectMyRequests(view, DD_CONFIG, err)`:
  - `AuthError(401, 'Credentials unavailable', { errorCode: NO_CREDENTIALS })` → `error 'auth'`, `errorCode 'NO_CREDENTIALS'`;
  - `AuthError(401, …, { errorCode: AUTH_LOGIN_LATCHED })` → `'auth'`, `'AUTH_LOGIN_LATCHED'`;
  - `AuthError(401)` → `'auth'`, `null`;
  - `AuthError(401, …, { errorCode: AUTH_HTML_500 })` → `'network'`, `null`;
  - `NetworkError` → `'network'`, `null`;
  - `{}` (a restored errored query) → `'network'`, `null`;
  - no error → `null`, `null`;
  - a legacy blob `error: 'auth'` with no thrown error → `'auth'`, `null`.
- [ ] Calling the hook's `refetch` calls the query's `refetch` exactly once and returns its value (the same promise object). The next `buildMyRequestsQueryFn` run plans every `catchUpStart..today` date, the observable effect of `markMyRequestsForcedRefresh` that DD2.51 pins. The run after that is normal again.
- [ ] With `useIsRestoring` → `true` and the query not loading, `isLoading` is `true`. With `useConfig().isLoading: true` and `data` undefined, it is `true`. With `useConfig().isLoading: true` and `data` present, it is `false`. With neither, it equals the query's `isLoading`.
- [ ] Static check (comments stripped):
  - the hook source imports `useIsRestoring` from `@tanstack/react-query`;
  - the returned `refetch` body calls `markMyRequestsForcedRefresh()` before `query.refetch()`;
  - the source contains no `useCallback`.
- [ ] Every pre-existing case in `useMyRequests.test.ts` passes after the C7 mock addition and the DD2.55/DD2.56 updates listed above.

---

### FR4: The Requests screen shows history, honest freshness and a real pull-to-refresh

**Requirements:**
- `app/(tabs)/approvals.tsx`:
  - Destructure `errorCode`, `staleDates` and `updatedAt` from `useMyRequests()`, with the defaults `staleDates ?? []`, `updatedAt ?? null` and `errorCode ?? null`. The `approvals-mesh` mocks lack these fields.
  - Rows: `buildMyRequestRows(entries, { currentMonday, prevMonday1, prevMonday2 }, olderExpanded)`, reusing the existing bound computation (`:218-224`). `olderExpanded` is local `useState(false)`.
  - The `older-toggle` row renders per C10, and pressing it flips `olderExpanded`. Header rows keep their existing `SectionLabel` markup, and entry rows keep `MyRequestCard`.
  - Note: `freshnessNote({ hasEntries: entries.length > 0, error, errorCode, staleDates, updatedAt, nowMs: Date.now() })`. When it is non-null, render it per C13, with Retry only when `requestsErrorRetryable(error, errorCode)`.
  - When `entries.length === 0` and the skeletons are not showing, switch on `myRequestsEmptyState(error, staleDates)`:
    - `'error'`: the red banner `bg-critical/10 …` (existing markup, `testID="my-requests-banner"`) with `requestsBannerText(error, errorCode)`, and Retry only when `requestsErrorRetryable`. **No** empty card.
    - `'incomplete'`: the existing empty `Card` with `INCOMPLETE_EMPTY_TEXT` (`text-textSecondary text-sm text-center`) and a Retry (`AnimatedPressable` → `myRefetch`).
    - `'none'`: the unchanged "No requests yet" card.
  - When entries exist, the red banner is never rendered for My Requests.
  - Pull-to-refresh: local `const [pulling, setPulling] = useState(false)`. `handleRefresh` does `setPulling(true)`, then `Promise.allSettled([Promise.resolve(myRefetch()), isManager ? Promise.resolve(teamRefetch()) : null]).finally(() => setPulling(false))`. Both refetches are still called synchronously. `RefreshControl` gets `refreshing={pulling}`, and the old `isRefreshing` (tied to `myLoading`) is removed.
  - The old strings `'Authentication error. Please re-open the app.'` and any `re-open` / `password` text are gone from the file.
  - It still does not import `useConfig`, `useRouter` or a `react-native` `Pressable`. It still has no `StyleSheet.create` and no hex colours outside the existing allowed props.
- Existing fixtures in `approvals.test.tsx` and `approvals-mesh.test.tsx` become current-week relative (C9).

**Success Criteria:**
- [ ] Older collapsed: with 1 current-week entry and 2 entries older than `prevMonday2` (built relative to the current week, C9), the text contains "Show older requests (2)" and neither older memo. After the `older-toggle` is pressed (in `act`), it contains the `monthLabel` of each older entry and both memos, and the toggle reads "Hide older requests".
- [ ] `'network'` with entries: the `my-requests-note` text starts with "Showing saved requests". "Could not load requests." and "Authentication error" are absent, every entry's card renders, and pressing the note's Retry calls `refetch` once.
- [ ] `'auth'` with entries and `errorCode` unset: the note contains "Can't sign in to Crossover right now · showing saved requests", Retry is present, and the entries render.
- [ ] `'auth'` + `'NO_CREDENTIALS'` with entries: the note contains "Saved sign-in missing", and there is **no** Retry in the My Requests section.
- [ ] `staleDates` with no error, with entries: the note contains "Some days couldn't refresh" and there is no Retry.
- [ ] `'auth'` with no entries, `errorCode` unset: the `my-requests-banner` contains "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.", Retry is present, and "No requests yet" is **absent**.
- [ ] `'auth'` + `'NO_CREDENTIALS'` with no entries: the banner reads "Your saved sign-in is missing. Sign out and back in from Settings." and there is no Retry.
- [ ] `'network'` with no entries: the banner reads "Could not load requests.", with Retry, and "No requests yet" is absent.
- [ ] **(C3)** No entries, no error, `staleDates: ['2026-10-20']`: the text contains `INCOMPLETE_EMPTY_TEXT` and not "No requests yet". A Retry is present, and pressing it calls `refetch` once.
- [ ] No entries, no error, no stale dates: "No requests yet" (SC4.1-SC4.4 unchanged).
- [ ] Pull-to-refresh:
  - After `onRefresh`, the `RefreshControl`'s `refreshing` is `true`. Once the `refetch` promise resolves (flushed with `await act(async () => {})`), it is `false`.
  - With a `refetch` that returns a rejected promise, `refreshing` also returns to `false`, and nothing is unhandled.
  - With `isLoading: true` and no pull, `refreshing` is `false`.
- [ ] Across the error/entries matrix above, no rendered text matches `/re-?open/i` or `/password/i`. The `approvals.tsx` source (comments stripped) matches neither.
- [ ] Existing suites pass unchanged, apart from the C9 fixture dates: SC3.5 (`myRefetch` and `teamRefetch` called once each), SC4.x, FR5 skeletons, `approvals-mesh`, `__tests__/approvals-screen.test.tsx` and `MotionUniversality` FR2.

---

### FR5: The root gate waits for the cache restore

**Requirements:**
- `app/_layout.tsx` `RootLayout`: `const isRestoring = useIsRestoring()`, imported from `@tanstack/react-query` (alongside `focusManager` and `QueryClient`). `RootLayout` already renders inside `PersistQueryClientProvider` (`:174-182`).
  - Splash: `if (!isLoading && !isRestoring) SplashScreen.hideAsync()`, with the deps `[isLoading, isRestoring]`.
  - Auth gate: `if (isLoading || isRestoring) return;` first, with `isRestoring` added to the deps. The rest is unchanged.
  - Overlay: `if (isLoading || isRestoring || !fontsLoaded)`.
- `app/__tests__/layout-notifications.test.tsx`: the `@tanstack/react-query` mock gains `useIsRestoring: () => mockIsRestoring` (a `let` set per test, default `false`). The `expo-router` mock's `useRouter` returns a shared hoisted `mockReplace` (C7).

**Success Criteria:**
- [ ] With `mockIsRestoring = true`, `config: { setupComplete: false }` and `isLoading: false`, rendering `App` never calls `router.replace`, never calls `SplashScreen.hideAsync`, and renders the loading overlay (no `MockStack`). After `mockIsRestoring = false` and a re-render (`update` in `act`), `replace` is called with `'/(auth)/welcome'` and `hideAsync` is called.
- [ ] With `mockIsRestoring = true`, `config: { setupComplete: true }` and segments `['(tabs)']`, `replace` is never called with `'/(auth)/welcome'`, either while restoring or after the flip.
- [ ] Static check (comments stripped): `_layout.tsx` imports `useIsRestoring` from `@tanstack/react-query` and contains `isLoading || isRestoring`.
- [ ] The existing FR1-FR3 cases in `layout-notifications.test.tsx` and `app/__tests__/root-layout-tokens.test.tsx` still pass.

---

## Technical Design

### Files to Reference

| File | Why |
|------|-----|
| `app/(tabs)/approvals.tsx:84-115,141-150,214-231,340-383` | The current rows, refresh, skeleton, week bounds, banner and empty-state code being replaced |
| `src/hooks/useMyRequests.ts:47-102,256-275` | `markMyRequestsForcedRefresh`, `toRequestsError`, `selectMyRequests`, the hook |
| `src/types/requests.ts:47-61` | `UseMyRequestsResult` |
| `src/api/errors.ts:12-17,30-43` | `AUTH_HTML_500`, `AUTH_LOGIN_LATCHED`, `NO_CREDENTIALS`, `AuthError` |
| `src/lib/approvals.ts:87-96` | `getWeekStartDate` (local, Monday-based) |
| `src/hooks/useConfig.ts` | `{ config, isLoading }` (the `['config']` query) |
| `node_modules/@tanstack/react-query/build/modern/IsRestoringProvider.js`, `useBaseQuery.js:27-42` | `useIsRestoring` (context default `false`); queries neither subscribe nor fetch while restoring |
| `app/_layout.tsx:89-169` | Splash, gate and overlay |
| `app/(tabs)/__tests__/approvals.test.tsx:105-125,165-205,392-444` | Fixtures, `setupMocks`, `fireRefresh`, SC3.5 |
| `app/__tests__/layout-notifications.test.tsx:40-130,229-262` | Mocks and the `renderApp` pattern |
| `src/hooks/__tests__/useMyRequests.test.ts:44-51,1428-1627,1733-1790` | The react-query mock, DD2.55/DD2.56, DD2.51 forced-refresh assertions |
| `__tests__/helpers/stripComments.ts` | The shared comment stripper for static checks |
| `src/components/AnimatedPressable.tsx`, `src/components/Card.tsx`, `src/components/SectionLabel.tsx` | The existing primitives the new UI reuses |
| `docs/brand-guidelines-v1.0.md:14-18` | Token rules (violet = BrainLift only, text tokens) |

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/requestRows.ts` | create | FR1 + FR2: `MyRequestRow`, `RequestRowBounds`, `buildMyRequestRows`, `monthLabel`, `formatUpdatedAgo`, `freshnessNote`, `requestsBannerText`, `requestsErrorRetryable`, `myRequestsEmptyState`, `INCOMPLETE_EMPTY_TEXT` |
| `src/lib/__tests__/requestRows.test.ts` | create | FR1/FR2 unit tests (DD4.1-DD4.13) |
| `src/types/requests.ts` | modify | FR3: `errorCode?`, `refetch` type, doc comments |
| `src/hooks/useMyRequests.ts` | modify | FR3: `errorCode` in `selectMyRequests`, forced `refetch`, restore-aware `isLoading`, header comment |
| `src/hooks/__tests__/useMyRequests.test.ts` | modify | FR3: the C7 mock, DD2.55/DD2.56 updates, DD4.14-DD4.17 |
| `app/(tabs)/approvals.tsx` | modify | FR4 |
| `app/(tabs)/__tests__/approvals.test.tsx` | modify | FR4: C9 fixture, DD4.18-DD4.24 |
| `app/(tabs)/__tests__/approvals-mesh.test.tsx` | modify | FR4: C9 fixture only |
| `app/_layout.tsx` | modify | FR5 |
| `app/__tests__/layout-notifications.test.tsx` | modify | FR5: mocks, DD4.25-DD4.27 |
| `docs/ARCHITECTURE.md` | modify | C16: §4.4 step 6 |

### Data Flow

```
PersistQueryClientProvider ──(isRestoring)──► useIsRestoring()
        │                                         │
        │                       ┌─────────────────┴──────────────────┐
        ▼                       ▼                                    ▼
  RootLayout (FR5)        useMyRequests (FR3)                   (any query)
  splash / gate / overlay   isLoading = q.isLoading || isRestoring
  wait for !isRestoring                 || (configLoading && data === undefined)
                            selectMyRequests(data, config, queryError)
                              → entries, error, errorCode, staleDates, updatedAt
                            refetch = mark forced → q.refetch()
                                        │
                                        ▼
                         ApprovalsScreen (FR4)
   bounds (currentMonday, prevMonday1, prevMonday2) + olderExpanded (useState)
        └─► buildMyRequestRows (FR1) → header / entry / older-toggle rows
   freshnessNote(...)       (FR2) → quiet note (+ Retry if requestsErrorRetryable)   [entries > 0]
   myRequestsEmptyState(...) (FR2) → 'error'      → red banner, requestsBannerText   [entries = 0]
                                    'incomplete' → INCOMPLETE_EMPTY_TEXT + Retry
                                    'none'       → "No requests yet"
   onRefresh → pulling=true → allSettled([myRefetch(), teamRefetch()?]) → pulling=false
```

### Edge Cases

| Case | Handling |
|------|----------|
| Partial failure leaves nothing visible (`entries` empty, no error, `staleDates` non-empty) | `'incomplete'` empty card with Retry (C3). Never "No requests yet". |
| Error with no entries | Banner only, with no "No requests yet" card under it (C4) |
| Error and `staleDates` both set, with entries | The error's note wins (FR2) |
| `NO_CREDENTIALS` | No Retry anywhere (it would throw again before any request is made). The copy points to Settings. |
| `AUTH_HTML_500` | Maps to `'network'` with `errorCode: null` → "Showing saved requests …" / "Could not load requests." |
| Restored errored query (spec 03, `error: {}`) | `'network'`, `errorCode: null` → quiet note over the restored list, until the mount refetch succeeds |
| Cold start while restoring | The root overlay stays up (FR5). If a screen is mounted anyway, `isLoading` is true → skeletons, not "No requests yet" (FR3). |
| Config loads after restore (not persisted) | `configLoading && data === undefined` keeps `isLoading` true |
| Dev manager preview (`devManagerView`) | The mock view has no `updatedAt`/`staleDates` → no note. Its entries are bucketed normally. |
| Week rollover while open | Bounds are recomputed on every render (unchanged) |
| Expanded Older with the manager section | The toggle state is local to My Requests. Team rows are unaffected. |
| Spec 05 adds weeks while expanded | The rows rebuild from the new `entries`, and month groups stay sorted (C12) |
| Malformed entry date | Older → "Other dates", last (C11) |
| Future `updatedAt` (clock skew) | "just now" |
| `refetch` rejects during a pull | `allSettled` absorbs it, and `pulling` returns to `false` |
| Retry pressed while a refetch is in flight | TanStack's `refetch` cancels and restarts by default (`cancelRefetch: true`). The forced flag is consumed by the new run. |
| `refetch` while signed out or in dev preview | The queryFn returns before `consumeForcedRefresh()`, so the flag survives to the next real run: one extra full-window refresh, which is harmless (spec 02 DD2.50 already keeps the flag in preview) |

---

## Dependencies

### Internal
- Spec 01: `AuthError.errorCode`, `NO_CREDENTIALS`, `AUTH_LOGIN_LATCHED`, `AUTH_HTML_500` (`src/api/errors.ts`).
- Spec 02: `markMyRequestsForcedRefresh`, `selectMyRequests`, `toRequestsError`, `staleDates`/`updatedAt` on the view, `buildMyRequestsQueryFn` (`src/hooks/useMyRequests.ts`).
- Spec 03: errored-with-data queries survive restarts (`src/lib/queryPersist.ts`), which is why the note must handle a restored `{}` error.
- Consumer: spec 05 relies on the Older section to display backfilled weeks.

### External
- `@tanstack/react-query` 5.104.5 (installed): `useIsRestoring`.
- `@tanstack/react-query-persist-client` 5.104.5 (installed): `PersistQueryClientProvider` supplies `IsRestoringProvider`.

### Assumptions
- `composeRequestsView` keeps `entries` sorted by date descending (spec 02), so bucket order inside groups is correct without re-sorting.
- Every production entry date is a valid `YYYY-MM-DD` (`groupSlotsIntoEntries`). The malformed-date path is defensive only.
- `ManualRequestEntry.id` stays unique across the 24-week view (`{date}|{memo}`), so the existing `key={row.entry.id}` stays valid.
