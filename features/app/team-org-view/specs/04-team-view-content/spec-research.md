# Spec 04 — Team-view content

**Status:** Research complete
**Complexity:** M
**Blocks:** —
**Blocked By:** 02, 03

## Problem context

Specs 01-03 produce a roster, an aggregate hook, and a scope pill with no wiring
between them. This spec ties them together inside `app/(tabs)/overview.tsx`
(555 lines, full file read this session): render the scope pill only for
managers, and when `scope === 'team'`, swap the personal metric cards for team
aggregate `ChartSection`s plus a per-report breakdown list — reusing the file's
existing local `ChartSection` component (`overview.tsx:83-212`) unmodified, per
the FEATURE.md's design constraint.

## Key decisions

**1. Extract `useIsManager()` into `src/hooks/useIsManager.ts`, replacing the
copy-pasted expression at three call sites.** The exact expression
`config?.isManager === true || config?.devManagerView === true` appears
verbatim at `overview.tsx:224`, `approvals.tsx:119`, and `index.tsx:174`
(confirmed via grep this session). The new hook wraps `useConfig()` (matching
`useConfig`'s own return shape convention — `src/hooks/useConfig.ts:11-27`) and
returns a plain `boolean`:
```typescript
export function useIsManager(): boolean {
  const { config } = useConfig();
  return config?.isManager === true || config?.devManagerView === true;
}
```
All three call sites are updated to `const isManager = useIsManager();`,
dropping their now-redundant `useConfig()` call only where `config` isn't used
for anything else — `overview.tsx` and `index.tsx` both still need `config` for
other fields (`weeklyLimit`, `hourlyRate`, etc.), so they keep their existing
`useConfig()` call alongside the new `useIsManager()` call; `approvals.tsx`'s
usage needs verifying at implementation time (not re-derived from `config`
elsewhere in that file — if `config` becomes unused there, drop the import).
This is explicitly a byproduct of wiring the manager gate for this spec, not a
standalone refactor PR (per FEATURE.md's "Out of scope" table) — implemented
as part of FR1 below, not a separate FR.

**2. `scope` is new local state in `OverviewScreen`, not persisted.** Add
`const [scope, setScope] = useState<'personal' | 'team'>('personal');`
alongside the existing `window`/`scrubWeekIndex` state block
(`overview.tsx:237-246`). Resets to `'personal'` on every app launch/screen
mount — matches the existing `window` state's own non-persisted behavior (no
AsyncStorage round-trip for `window` either). Non-managers never see the state
change since the pill that would call `setScope` isn't rendered for them.

**3. `OverviewStickyBar`'s new props are only passed when `isManager` is true.**
```tsx
<OverviewStickyBar
  window={window}
  onWindowChange={handleWindowChange}
  scrubSnapshot={stickyBarScrubData}
  visible={stickyBarVisible}
  style={{ position: 'absolute', top: safeTop + 8, left: 16, right: 16, zIndex: 10 }}
  scope={isManager ? scope : undefined}
  onScopeChange={isManager ? setScope : undefined}
  orgTierEnabled={config?.orgTierEnabled}
/>
```
`setScope` is passed directly as `onScopeChange` — its signature
(`(scope: 'personal' | 'team') => void`, Spec 03) already matches `setScope`'s
own type exactly, no adapter needed. `scope={undefined}` for non-managers
reproduces Spec 03's decision 5 (no scope row rendered at all).

**4. Team-view render branch replaces the 4 personal `ChartSection`s +
Work/Hourly Pattern cards, not the hero card or insight chips.** The hero card
(`OverviewHeroCard`, `overview.tsx:394-401`), `EarningsPaceCard`
(`overview.tsx:405-409`), `ApprovalUrgencyCard` (`overview.tsx:385-390`), and
insight chips (`overview.tsx:412-422`) all stay personal-only regardless of
`scope` — the FEATURE.md scopes this feature to "aggregate hours/AI%/BrainLift
trends... per-person breakdown," not a wholesale screen replacement, and none
of those other cards have a team-aggregate equivalent designed in Specs 01-02.
Concretely: everything from the earnings `ChartSection` at line 428 through the
`HourlyPatternCard` at line 540 is wrapped in
`{scope === 'personal' ? <>...</> : <TeamViewContent .../>}`.

**5. `TeamViewContent` is a new local component in the same file, not a new
file.** Mirrors the existing pattern where `ChartSection` is a local, unexported
component colocated with its only consumer (`overview.tsx:109-212`) rather than
extracted to `src/components/`. `TeamViewContent` takes no props — it calls
`useTeamAggregateData()` (Spec 02) directly, matching how `OverviewScreen`
itself calls `useOverviewData(window)` directly rather than receiving data via
props. This keeps the diff inside one file and avoids a prop-drilling layer for
a component with exactly one call site.

**6. Team `ChartSection`s render current-week-only (single bright bar / flat
sparkline), not a multi-week trend — per Spec 02's explicit descope.** Data
arrays are single-element (`[weekHours]`, `[weekAiPct]`,
`[weekBrainliftHours]`) rather than the multi-week arrays personal cards pass.
`TrendSparkline` (used inside `ChartSection`) already handles arbitrary-length
`data` arrays — a length-1 array renders as a single point/bar, not a special
case requiring a different component. `weekLabels` is a single-element array
too (`['This week']`) so the existing subtitle/label wiring needs no
conditional logic. `onScrubChange`/`externalCursorIndex` are wired to no-ops
(`() => {}` / `null`) since scrubbing a 1-point series has no meaning — Team
tier has no scrub-snapshot sticky-bar row per Spec 03 decision 2, so this is
consistent.

**7. Per-report breakdown list is a new small local component,
`TeamMemberRow`, one `Card` per report.** Each row: `member.name`,
`member.photoUrl` (fallback initials avatar if absent — matching whatever
existing avatar-fallback convention is used elsewhere in the app; verify at
implementation time whether one already exists before inventing a new one),
`hours`/`aiPct`/`brainliftHours` as three small inline stats colored
gold/cyan/violet (matching the semantic accent convention already used for the
aggregate `ChartSection`s and stated in FEATURE.md's design constraint), an
"MGR" badge when `member.isManager` (Spec 01's derived field, not used for
filtering — surfaced here per Spec 01's own comment), and a dimmed/muted row
style with a small "Couldn't load" label when `breakdown[i].fetchFailed` is
true rather than omitting the row (Spec 02 explicitly keeps failed reports in
`breakdown` for this reason).

**8. Loading and empty states for Team view.** While `useTeamAggregateData()`
`isLoading` is true, render existing skeleton-card conventions (verify exact
component name at implementation time — `approvals.tsx` has a
`showTeamSkeletons` pattern at line 214 worth checking for a reusable skeleton
component). Empty roster (`reportCount: 0`, per Spec 02's test plan) renders a
simple empty-state message ("No direct reports found") rather than a blank
screen or zeroed-out charts that look broken.

## Interface contracts

```typescript
// src/hooks/useIsManager.ts — new file
export function useIsManager(): boolean
```

```tsx
// app/(tabs)/overview.tsx — new local state (alongside existing window/scrub state)
const [scope, setScope] = useState<'personal' | 'team'>('personal');

// New local component, colocated with ChartSection
function TeamViewContent(): JSX.Element {
  const { data, isLoading, error } = useTeamAggregateData();
  // renders 3 single-point ChartSections (hours/AI%/BrainLift) +
  // a TeamMemberRow per data.breakdown entry, or loading/empty states
}

function TeamMemberRow({ breakdown }: { breakdown: TeamMemberBreakdown }): JSX.Element
```

Render structure inside the existing `ScrollView` (`overview.tsx:377-541`):
```tsx
{scope === 'personal' ? (
  <>
    {/* existing earnings/hours/AI%/BrainLift ChartSections, Work Pattern, Hourly Patterns — unchanged */}
  </>
) : (
  <TeamViewContent />
)}
```

## Test plan

- [ ] `useIsManager()` returns `true` when `config.isManager === true`, `true`
      when `config.devManagerView === true`, `false` otherwise — matches the
      exact behavior of the expression it replaces (regression guard).
- [ ] All 3 existing call sites (`overview.tsx`, `approvals.tsx`, `index.tsx`)
      still compute the same `isManager` value after switching to the hook —
      existing tests for each screen continue to pass unchanged.
- [ ] Non-manager: `OverviewStickyBar` receives `scope={undefined}`,
      `onScopeChange={undefined}` — no scope pill renders, screen behaves
      identically to pre-feature behavior (regression guard for the majority
      of users).
- [ ] Manager, `scope === 'personal'` (default): screen renders exactly the
      existing personal charts — no visual/behavioral change from before this
      feature for a manager who hasn't toggled yet.
- [ ] Manager, `scope === 'team'`: personal `ChartSection`s, Work Pattern, and
      Hourly Patterns are absent from the tree; `TeamViewContent` renders
      instead; hero card, `EarningsPaceCard`, `ApprovalUrgencyCard`, and
      insight chips remain present (decision 4 regression guard).
- [ ] `TeamViewContent` loading state renders while `useTeamAggregateData`
      `isLoading` is true, not a blank/zeroed chart.
- [ ] `TeamViewContent` with `reportCount: 0` renders the empty-state message,
      not zeroed charts or a crash.
- [ ] `TeamMemberRow` renders a dimmed/failed state when `fetchFailed: true`,
      and normal stats otherwise.
- [ ] `TeamMemberRow` renders an "MGR" badge only when `member.isManager` is
      true.
- [ ] Tapping `Team` in the scope pill calls `setScope('team')` and the screen
      re-renders into the team branch (integration test spanning Spec 03's
      pill + this spec's branch logic).

## Files to reference

| File | Why |
|---|---|
| `app/(tabs)/overview.tsx` (full, 555 lines) | The screen being modified — render branch, state, sticky bar wiring all land here. |
| `app/(tabs)/overview.tsx:83-212` | Existing local `ChartSection` component — reused unmodified for team aggregate cards. |
| `app/(tabs)/overview.tsx:216-364` | `OverviewScreen` state/derived-values block — new `scope` state slots in here alongside `window`/scrub state. |
| `app/(tabs)/approvals.tsx:119`, `index.tsx:174` | Other two call sites of the `isManager` expression being replaced by `useIsManager()`. |
| `app/(tabs)/approvals.tsx:214` (`showTeamSkeletons`) | Check for a reusable loading-skeleton convention before inventing a new one for `TeamViewContent`. |
| `src/hooks/useConfig.ts` (full) | Pattern `useIsManager()` wraps — same `useQuery`-backed shape. |
| `src/components/Card.tsx` (full) | `TeamMemberRow`'s base component — `borderAccentColor` prop for semantic accents. |
| `src/lib/colors.ts` (gold/cyan/violet/textMuted lines) | Semantic accent colors for per-report stats, matching FEATURE.md's design constraint. |
| `specs/02-team-aggregate-hook/spec-research.md` | `TeamAggregateData`/`TeamMemberBreakdown` shape this spec's UI consumes. |
| `specs/03-scope-toggle-ui/spec-research.md` | `OverviewStickyBar`'s new prop contract this spec wires up. |
| `features/app/team-org-view/FEATURE.md` "Out of scope" | Confirms `useIsManager()` extraction is in-scope for this spec specifically, not a separate PR. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ (load-bearing) | Render-branch, hook-extraction regression, and breakdown-row tests per test plan above |
| Live-QA probe | ✗ | Pure composition of already-verified data hooks (Specs 01/02) and UI (Spec 03) |
| TestFlight | ✓ | Manual check: toggle Personal/Team on a `devManagerView` contributor account, confirm no crash, confirm non-manager account sees zero change |
| Error log | ✓ | `TeamViewContent`'s `error` state (from `useTeamAggregateData`) should log via existing `log.error` convention if non-null, matching `useAuth.ts:66-71` |
