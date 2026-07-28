# Team-view content

**Status:** Draft
**Created:** 2026-07-28
**Last Updated:** 2026-07-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This work completes the Team scope experience on the Overview tab by connecting the manager-only scope selector to team aggregate data and content. Managers will start in the existing Personal view and can switch to Team to see current-week hours, AI usage, and BrainLift hours across their direct reports, followed by a per-person breakdown. Non-managers will not see the scope selector and will continue to receive the current Overview experience unchanged.

The screen will keep scope as local, non-persisted state and pass it to `OverviewStickyBar` only when the user is a manager. Manager eligibility will be centralized in a new `useIsManager()` hook and adopted by the three screens that currently repeat the same configuration check. Selecting Team will replace the existing personal metric charts, Work Pattern card, and Hourly Patterns card with a local `TeamViewContent` branch; the personal hero, urgency and earnings cards, and insight chips will remain in place.

`TeamViewContent` will consume `useTeamAggregateData()` directly and reuse the Overview screen's existing `ChartSection` component for three single-point, current-week aggregate cards. It will also render one card per direct report with avatar, hours, AI percentage, BrainLift hours, and manager status, while retaining failed reports in a muted "Couldn't load" state. Loading and empty-roster states will be shown explicitly, and aggregate errors will follow the application's existing logging convention.

---

## Out of Scope

1. **Deferred to `01-team-roster-api` — Team and direct-report discovery.** This spec does not call `useTeamRoster()` directly or consume roster records itself; it only renders the `breakdown` already produced by `useTeamAggregateData()`. Defining the team API calls, normalizing roster records, and deriving manager/report relationships belong to the verified `01-team-roster-api` spec.

2. **Deferred to `02-team-aggregate-hook` — Fetching and aggregating report metrics.** This spec renders the `useTeamAggregateData()` result but does not own cross-user work-diary or timesheet requests, fan-out behavior, aggregation math, caching, or per-report failure isolation. Those responsibilities are defined in the verified `02-team-aggregate-hook` spec.

3. **Deferred to `03-scope-toggle-ui` — Scope-control presentation and interaction.** This spec wires scope state into `OverviewStickyBar`; the Personal/Team/Org pill, its styling, the Org segment's enabled/disabled visual treatment (controlled by `orgTierEnabled`), prop contract, and component-level interaction tests belong to the verified `03-scope-toggle-ui` spec.

4. **Descoped (not part of this feature) — Functional Org-tier and skip-level views.** The available data path is limited to a manager's direct reports, while skip-level roster access could not be verified. Org remains non-functional; this spec must not recursively load reports-of-reports or render Org aggregates.

5. **Descoped (not part of this feature) — Multi-week team history and trend scrubbing.** `02-team-aggregate-hook` supplies only the current week's team snapshot. Backfilling each report across 4-, 12-, or 24-week windows would substantially multiply API fan-out, so team charts use a single current-week point and do not support window selection or scrubbing.

6. **Descoped (not part of this feature) — Server-side aggregation.** The feature deliberately uses the existing client-side React Query fan-out rather than introducing a backend aggregation endpoint. This content spec only composes the client-side result.

7. **Descoped (not part of this feature) — Persisting the selected scope.** Scope is local screen state and defaults to Personal on mount. No AsyncStorage, account preference, or cross-session restoration is added.

8. **Descoped (not part of this feature) — Team variants of the hero, earnings pace, approval urgency, and insight chips.** No team-level contracts or designs exist for those surfaces. They remain personal while Team scope replaces only the personal metric charts, Work Pattern card, and Hourly Patterns card.

9. **Descoped (not part of this feature) — Writing or approving on behalf of a report.** The Team view is read-only aggregate visibility. It does not add editing, delegation, approval actions, or navigation into a report's mutable records; approvals retain their existing dedicated flow.

10. **Descoped (not part of this feature) — A new chart or visualization primitive.** Team metrics reuse the existing local `ChartSection` and its established visual language. Creating a new chart component or redesigning the current chart system would expand the feature without a product requirement.

11. **Descoped (not part of this feature) — A standalone `useIsManager()` refactor initiative.** The hook extraction is included only as a byproduct of this spec's manager gate and updates the three known duplicate call sites in the same implementation. Broader manager-role or authorization refactoring is not included.

12. **Unassigned (needs a spec owner) — Team-threshold push notifications.** Alerts such as reports falling below a BrainLift target require separate threshold definitions, notification delivery behavior, permissions, and user controls. No spec in the verified feature decomposition owns that work.

---

## Functional Requirements

### FR1 — Gate and control the overview scope for managers

The application MUST provide a shared `useIsManager()` hook that returns `true`
when either `config.isManager` or `config.devManagerView` is explicitly `true`,
and `false` otherwise. The Overview, Approvals, and tab Index screens MUST use
this hook instead of independently evaluating the manager expression.

The Overview screen MUST initialize its local scope to `personal` on each
screen mount. It MUST expose the scope control through `OverviewStickyBar` only
when `useIsManager()` returns `true`. For non-managers, both `scope` and
`onScopeChange` MUST be passed as `undefined`, so no scope control is rendered.
Scope selection MUST remain local and MUST NOT be persisted between mounts or
app launches.

#### Success Criteria

- `useIsManager()` returns `true` when `config.isManager === true`.
- `useIsManager()` returns `true` when `config.devManagerView === true`.
- `useIsManager()` returns `false` for all other config states, including
  absent config.
- Overview, Approvals, and tab Index retain the same manager-detection behavior
  after adopting the shared hook.
- A manager sees the scope control and initially has `personal` selected.
- Selecting `Team` updates the local scope to `team` and causes the Overview
  screen to render the team branch.
- A non-manager receives no scope props, sees no scope control, and experiences
  no change to existing Overview behavior.
- Remounting the Overview screen resets the selected scope to `personal`.

### FR2 — Replace personal detail content with team aggregates in Team scope

When scope is `personal`, the Overview screen MUST render its existing personal
chart and pattern content unchanged. When scope is `team`, it MUST replace the
four personal chart sections (earnings, hours, AI percentage, and BrainLift),
the Work Pattern card, and the Hourly Patterns card with team content.

The team content MUST use `useTeamAggregateData()` and MUST render three
aggregate sections using the existing local `ChartSection` component without
modifying that component:

- team hours, using `weekHours` and the gold semantic accent;
- team AI percentage, using `weekAiPct` and the cyan semantic accent; and
- team BrainLift hours, using `weekBrainliftHours` and the violet semantic
  accent.

Each team aggregate MUST be represented as a current-week-only, single-point
series labeled `This week`. Scrubbing MUST be disabled for these series by
using a no-op scrub callback and no external cursor.

Changing scope MUST NOT replace or remove the Overview hero card,
`EarningsPaceCard`, `ApprovalUrgencyCard`, or insight chips; these elements
remain visible and personal in both scopes.

#### Success Criteria

- Personal scope renders the pre-existing four personal charts, Work Pattern,
  and Hourly Patterns content.
- Team scope removes all six of those personal-detail elements from the
  rendered tree and renders team content in their place.
- Team scope renders exactly three aggregate `ChartSection`s for hours, AI
  percentage, and BrainLift hours using the corresponding values from
  `useTeamAggregateData()`.
- Each aggregate receives a one-element data array and a one-element label
  array containing `This week`.
- The three aggregates use gold, cyan, and violet accents respectively.
- Team aggregate sections expose no meaningful scrub interaction and no
  external cursor.
- The hero, earnings pace, approval urgency, and insight-chip content remains
  present when switching between Personal and Team.

### FR3 — Present team members and resilient team-view states

Below the aggregate sections, Team scope MUST render one card-based member row
for every entry in `data.breakdown`, preserving entries whose data fetch
failed. Each row MUST show the member's name and photo when available, or a
fallback initials avatar when no photo is available. A row MUST present hours,
AI percentage, and BrainLift hours as compact inline stats using the same gold,
cyan, and violet semantic accents as their aggregate sections. It MUST show an
`MGR` badge only when `member.isManager` is `true`.

A breakdown entry with `fetchFailed === true` MUST remain visible with a
dimmed or muted treatment and a `Couldn't load` label instead of appearing as
a normal zero-value row or being omitted.

While team aggregate data is loading and no data has been loaded yet
(`isLoading === true && data === null`), Team scope MUST show the
application's existing skeleton-card treatment rather than blank or zeroed
charts. When the loaded data has an empty roster (`breakdown.length === 0`),
it MUST show `No direct reports found` instead of aggregate charts or member
rows. When the roster is non-empty but every report failed
(`reportCount === 0` with non-empty `breakdown`), it MUST show the failed
member rows rather than the empty-roster message or zero-valued aggregate
charts. If the aggregate hook exposes a non-null error, the component MUST
record it through the application's existing error-logging convention.

#### Success Criteria

- Loaded non-empty team data renders one member row for every breakdown entry.
- A member with a photo renders that photo; a member without one renders a
  fallback initials avatar.
- Every normal member row shows hours, AI percentage, and BrainLift hours with
  gold, cyan, and violet accents respectively.
- The `MGR` badge appears when and only when `member.isManager === true`.
- A failed member remains in the list, is visibly muted, and displays
  `Couldn't load`.
- While `isLoading === true` and no data has loaded yet, skeleton cards are
  visible and aggregate charts are not rendered as zero values.
- When `breakdown.length === 0`, `No direct reports found` is visible and
  neither aggregate charts nor member rows are rendered.
- When `reportCount === 0` but `breakdown.length > 0`, the failed member rows
  are visible instead of the empty-roster message or zero-valued charts.
- A non-null team-data error is sent to the existing error logger.

---

## Technical Design

### Summary

Wire the manager-only scope control delivered by Spec 03 into the Overview
screen and render the current-week team aggregate delivered by Spec 02 when the
manager selects `Team`.

The screen keeps its existing personal hero, approval urgency card, earnings
pace card, and insight chips in both scopes. The scope switch replaces only the
existing personal chart block: Weekly Earnings, Weekly Hours, AI Usage,
BrainLift, Work Pattern, and Hourly Patterns. The replacement contains three
current-week `ChartSection`s and a per-report breakdown.

This spec also consolidates the repeated manager check into a shared
`useIsManager()` hook. The Org option remains inert; this design introduces no
Org state or data path.

### Files to Reference

| File | Relevant contract or pattern |
|---|---|
| `specs/04-team-view-content/spec-research.md` | Scope boundary, render-branch placement, manager-hook extraction, loading/empty behavior, and local-component decisions. |
| `app/(tabs)/overview.tsx` | Existing `ChartSection`, Overview state, personal content boundary, manager check, sticky-bar call site, and personal config usage. |
| `app/(tabs)/approvals.tsx` | One repeated manager check and the established `SkeletonLoader` loading pattern. `config` has no other use in this screen. |
| `app/(tabs)/index.tsx` | One repeated manager check. This screen must retain `useConfig()` because it also reads `weeklyLimit`, `useQA`, `devOvertimePreview`, `hourlyRate`, and other personal settings. |
| `src/hooks/useConfig.ts` | Query-backed config access wrapped by `useIsManager()`; while config is absent/loading, the derived result is `false`. |
| `src/components/Card.tsx` | Per-report row container and `borderAccentColor`, `style`, and `testID` capabilities. |
| `src/lib/colors.ts` | Gold/cyan/violet metric accents, muted text, critical state, and standard surface/text tokens. |
| `specs/02-team-aggregate-hook/spec-research.md` | `useTeamAggregateData()`, `TeamAggregateData`, and `TeamMemberBreakdown` contracts; current-week-only data and per-report failure isolation. |
| `specs/03-scope-toggle-ui/spec-research.md` | Optional `OverviewStickyBar` scope props and the intentionally non-functional Org segment. |
| `features/app/team-org-view/FEATURE.md` | Feature boundary, direct-report-only definition, reuse constraints, and Org exclusion. |

### Files to Create/Modify

#### Create

##### `src/hooks/useIsManager.ts`

Export a hook with a deliberately small return type:

```ts
export function useIsManager(): boolean {
  const { config } = useConfig();
  return config?.isManager === true || config?.devManagerView === true;
}
```

This preserves the exact current behavior, including treating missing config
and all non-`true` values as non-manager.

#### Modify

##### `app/(tabs)/overview.tsx`

- Import `Image` from React Native for member photos.
- Import `SkeletonLoader`, `useIsManager`,
  `useTeamAggregateData`, and the `TeamMemberBreakdown` type.
- Keep the existing `useConfig()` call because the screen still consumes
  personal settings and `orgTierEnabled`.
- Replace the inline manager expression with `useIsManager()`.
- Add non-persisted local state:

  ```ts
  const [scope, setScope] = useState<'personal' | 'team'>('personal');
  ```

- Pass the Spec 03 props to `OverviewStickyBar` only for managers:

  ```tsx
  scope={isManager ? scope : undefined}
  onScopeChange={isManager ? setScope : undefined}
  orgTierEnabled={config?.orgTierEnabled}
  ```

- Wrap the content beginning with Weekly Earnings and ending with Hourly
  Patterns in one scope branch. Preserve the existing personal subtree without
  changing its props, animation indexes, chart keys, or layout.
- Render `TeamViewContent` only when `isManager && scope === 'team'`. The
  explicit manager condition prevents team data from remaining visible if
  config is refreshed and manager access disappears during the mounted
  session.
- Add local, unexported `TeamViewContent` and `TeamMemberRow` components beside
  the existing local `ChartSection`.

`TeamViewContent` calls `useTeamAggregateData()` itself. It does not receive
aggregate data through `OverviewScreen`, keeping the team query dormant until
the Team branch mounts and avoiding additional props on the screen component.

For successfully loaded data, render:

1. `TEAM HOURS` with `data={[weekHours]}`, gold accent, and a one-decimal
   `h` value.
2. `TEAM AI USAGE` with `data={[weekAiPct]}`, cyan accent, `maxValue={100}`,
   the existing 75% guide, and a rounded percentage value.
3. `TEAM BRAINLIFT` with `data={[weekBrainliftHours]}`, violet accent, and a
   one-decimal `h` value.
4. A `BY PERSON` section with one `TeamMemberRow` for every breakdown entry.

Use `weekLabels={['This week']}`, `externalCursorIndex={null}`, and a stable
no-op `ScrubChangeCallback` for all three team charts. Do not synthesize
historical points, deltas, or streaks. Do not apply the personal weekly-hours
or BrainLift target directly to a team sum: the aggregate contract does not
define a team-level target. AI% retains its 75% guide because it is a normalized
percentage and does not scale with team size.

Each normal `TeamMemberRow` contains:

- `member.photoUrl`, or a two-letter initials fallback;
- the member name;
- an `MGR` badge only when `member.isManager` is true;
- hours, AI%, and BrainLift values with gold, cyan, and violet accents;
- tabular numeric styling and stable formatting (`1` decimal for hours and
  BrainLift, rounded integer for AI%).

For a failed breakdown entry, retain the row, reduce its opacity, use muted
labels, show em dashes instead of misleading zero metrics, and add
`Couldn't load`. A photo URL that fails at runtime should fall back to initials
instead of leaving a broken image.

Loading uses a short stack of `SkeletonLoader` blocks matching the established
Requests-screen convention. Empty and error states use `Card` and existing
color/text tokens; no new general-purpose state component is introduced.

##### `app/(tabs)/approvals.tsx`

- Import and call `useIsManager()`.
- Remove the `useConfig` import and local `config` binding; the manager
  expression is its only config use.
- Leave all manager-gated queue, refresh, mesh, loading, and action behavior
  unchanged.

##### `app/(tabs)/index.tsx`

- Import and call `useIsManager()`.
- Replace only the repeated inline manager expression.
- Retain `useConfig()` and its import because the screen uses multiple other
  config values.

No changes are required to the team aggregate hook or sticky-bar component;
their interfaces are inputs delivered by Specs 02 and 03.

### Data Flow

```text
useConfig()
   ├─> useIsManager() ─> manager-only sticky scope row
   └─> overview personal settings + orgTierEnabled

manager selects Team
   └─> setScope('team')
       └─> personal chart subtree unmounts
           └─> TeamViewContent mounts
               └─> useTeamAggregateData()
                   ├─ loading ─> skeletons
                   ├─ hook error/no data ─> error card
                   └─ TeamAggregateData
                       ├─ aggregate fields ─> 3 single-point ChartSections
                       └─ breakdown[] ─> one TeamMemberRow per direct report

manager selects Personal
   └─> setScope('personal')
       └─> TeamViewContent unmounts; existing personal subtree remounts
```

The personal data hooks in `OverviewScreen` remain unconditional because the
personal hero, earnings pace, urgency, insights, and ambient signal still render
in Team scope. The team aggregate hook lives below the branch, so contributors
and managers who never select Team do not initiate the team fan-out from this
screen.

Scope is screen-local and defaults to Personal on each mount. It is not written
to config or storage. The selected 4/12/24-week personal window is independent
of scope; Team charts always show the single current-week point supplied by the
aggregate hook.

### State Rendering Order

`TeamViewContent` should use the following precedence:

1. `isLoading && data === null`: render skeletons.
2. `data === null`: render a team-data error card. If `error` is null, use the
   same generic message rather than rendering nothing.
3. `data.breakdown.length === 0`: render `No direct reports found`.
4. `data.reportCount === 0` with non-empty `breakdown`: render an
   `Unable to load team metrics` status card followed by the failed report rows;
   do not render zero-valued aggregate charts.
5. `data.reportCount > 0`: render aggregate charts and the full breakdown. If
   some rows failed, label the aggregate as based on
   `reportCount / breakdown.length` loaded reports and keep failed rows visible.

Use `breakdown.length`, not `reportCount`, to identify an empty roster because
`reportCount` excludes failed reports.

`error` is logged via the existing error-logging convention whenever it is
non-null, independent of this rendering precedence — including the case where
a background refetch error arrives alongside still-valid cached `data`. Only
the `data === null` branch (step 2) additionally renders the error visibly;
a non-null `error` with non-null `data` is logged but does not replace the
already-rendered aggregate/breakdown content.

### Edge Cases

- **Config still loading:** `useIsManager()` returns `false`; no scope row or
  team content flashes before manager status is known.
- **Manager access disappears while mounted:** the branch condition falls back
  to personal content even if local `scope` still equals `team`.
- **Contributor or dev flag disabled:** optional sticky-bar scope props are
  `undefined`, preserving the pre-feature bar and personal-only screen.
- **Org flag enabled:** Org may appear visually enabled according to Spec 03,
  but this spec still never accepts an Org scope value or dispatches an Org
  query. Org interaction remains inert until an Org data contract exists.
- **Empty roster:** show a clear empty card and no aggregate charts.
- **Every report fails:** distinguish this from an empty roster by the non-empty
  breakdown; show failed rows and no misleading zero totals.
- **Partial report failure:** aggregates reflect only successful reports;
  disclose the successful/total count and retain muted failed rows.
- **Zero valid metrics:** zero is rendered as a legitimate value when at least
  one report loaded; it is not treated as loading or empty.
- **Missing, blank, or single-word name:** initials fallback uses up to the
  first two non-empty words; if no initial can be derived, render `?`.
- **Missing or broken photo URL:** render initials. The image failure state is
  local to its row and must reset if the URL changes.
- **Single-point chart:** use the existing `ChartSection` unchanged. Supply a
  one-item data and label array, a no-op scrub callback, and a null cursor.
- **Scope toggled repeatedly:** React Query owns the 24-hour aggregate cache, so
  remounting Team content reuses cached data under Spec 02's query key rather
  than requiring screen-local caching.
- **Existing personal scrub state:** Team content does not consume the cursor,
  and the sticky bar hides its picker/snapshot row in Team scope. Returning to
  Personal reuses the existing state behavior; normal gesture finalization
  clears the cursor.
- **Long names and narrow screens:** allow the name area to shrink and truncate
  to one line; keep metric values in a wrapping or evenly divided stats row so
  they do not overlap.
- **Duplicate member names:** row keys must use a stable identifier from
  `TeamMemberBreakdown.member`, never the display name or array index.
- **Hook-level errors:** always logged via the existing error-logging
  convention; additionally rendered as a user-readable error card only when
  `data === null` (per State Rendering Order step 2) — an error alongside
  still-valid cached `data` is logged but does not replace the rendered
  content. Per-report operational logging remains the aggregate hook's responsibility,
  avoiding duplicate logs from render code.

### Verification

- Unit-test `useIsManager()` for `isManager`, `devManagerView`, missing config,
  and false values.
- Regression-test all three call sites so their manager-gated UI behavior is
  unchanged after extraction.
- Verify the Overview default remains Personal for managers and contributors.
- Verify manager scope props are supplied and contributor scope props are
  omitted.
- Verify Team scope replaces exactly the six personal chart/pattern areas while
  keeping hero, earnings pace, urgency, insights, and ambient behavior.
- Verify loading, hook error, empty roster, all-failed, partial-failure, and
  successful states.
- Verify failed rows, manager badges, image/initial fallbacks, numeric
  formatting, and stable member keys.
- Verify Team charts receive one data point and cannot alter personal scrub
  state.
- Manually check the segmented control and breakdown layout on a manager/dev
  account, then confirm a contributor account has no visual or behavioral
  change.
