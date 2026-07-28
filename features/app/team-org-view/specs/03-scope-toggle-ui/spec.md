# Scope Toggle UI

**Status:** Draft
**Created:** 2026-07-28
**Last Updated:** 2026-07-28
**Owner:** @jaime-alvarez-trilogy

---

## Overview

This work adds a Personal / Team / Org scope selector to the Overview tab for managers. The selector will appear as a new row in the existing `OverviewStickyBar`, above the current 4W / 12W / 24W window picker, and will reuse that control's pill styling and active-state treatment. Personal and Team will be selectable through an optional scope-change callback. Org will be shown as a gated future tier but will remain non-interactive until its data path is implemented.

The change extends `OverviewStickyBar` with optional scope, scope-change, and Org-tier configuration props, preserving its current behavior for every caller that omits them. When no scope is provided, the new row is not rendered, so non-managers see the existing bar unchanged. When Team is selected, the Personal-only window picker and scrub snapshot row are hidden because those controls do not apply to the current-week team aggregate. An optional `orgTierEnabled` field will also be added to `CrossoverConfig`, following the project's existing configuration-toggle pattern and controlling the Org segment's rollout appearance without enabling Org navigation.

Component tests will cover conditional rendering, active scope styling, Personal/Team interactions, the disabled Org behavior, and compatibility with the existing window-picker and scrub transitions. Screen-level data wiring is intentionally deferred to the follow-up integration spec.

## Out of Scope

1. **Deferred to `01-team-roster-api` — roster discovery and direct-report API access.** This spec only adds the segmented scope control to `OverviewStickyBar`; fetching the manager's owned teams and mapping active roster records into `TeamMember` objects belongs to the existing `01-team-roster-api` spec.

2. **Deferred to `02-team-aggregate-hook` — fetching and aggregating Team metrics.** Per-report work-diary and timesheet fan-out, current-week hours/AI%/BrainLift calculations, caching, and partial-failure handling are data-layer concerns owned by the existing `02-team-aggregate-hook` spec. The scope control remains usable in isolation without taking a dependency on those hooks.

3. **Deferred to `04-team-view-content` — screen-level state, manager gating, and Personal/Team content switching.** This spec extends the reusable sticky-bar interface and tests its component behavior only. The existing `04-team-view-content` spec owns adding `scope` state in `overview.tsx`, passing the new props for managers, extracting `useIsManager()`, and replacing personal metric cards with Team content when selected.

4. **Deferred to `04-team-view-content` — Team charts, loading/empty/error states, and per-person breakdown rows.** These are consumers of the toggle rather than behavior of the toggle itself. The existing `04-team-view-content` spec defines the current-week aggregate cards, report rows, failed-report treatment, and integration test that proves selecting Team changes the screen content.

5. **Descoped — a functional Org tier or recursive skip-level roster.** Org remains visible only as a disabled, non-interactive affordance. Skip-level access could not be verified from QA data, and neither the roster nor aggregate contracts support an organizational subtree, so this feature does not enable Org selection or fetch Org data.

6. **Descoped — multi-week Team or Org trends.** The Team data contract intentionally fetches only the current week; historical backfill would multiply API fan-out by reports and weeks. Consequently, the existing 4W/12W/24W picker and scrub snapshot are hidden outside Personal scope rather than being extended to Team or Org.

7. **Descoped — a new feature-flag service.** The codebase has no general feature-flag mechanism, and introducing one is disproportionate to this UI change. `orgTierEnabled?: boolean` follows the existing optional `CrossoverConfig` toggle pattern and does not establish a broader rollout system.

8. **Descoped — persisting the selected scope.** Personal remains the default on each screen mount or app launch. Persistence would introduce storage, hydration, and stale-role behavior that the existing window picker does not require and that this feature does not need.

9. **Descoped — manager actions on behalf of reports.** The Team view is read-only aggregate visibility. Editing time or approving work remains in the existing Approvals flow and is not added to the scope control.

10. **Unassigned — team-threshold push notifications.** Alerts such as notifying a manager that reports are below a BrainLift target require product rules, notification delivery work, and a dedicated owner. No spec for this capability exists in the current feature decomposition.

11. **Unassigned — eventual Org enablement after skip-level access is validated.** The UI flag is only an affordance and does not make Org functional, even when visually enabled. A future owner must validate access semantics and define roster traversal, aggregation, failure handling, and Org-view content in a named spec before the Org segment can become interactive.

## Functional Requirements

### FR1 — Display the scope selector for eligible users

`OverviewStickyBar` must support an optional scope selector containing `Personal`, `Team`, and `Org`, rendered as a row above the existing window-picker/scrub row. The selector must use the same visual language as the existing window picker, including its track, active-segment, active-text, spacing, and corner-radius treatments. The parent screen will indicate manager eligibility by supplying the optional `scope` prop; when `scope` is omitted or `undefined`, the scope selector must not render.

#### Success Criteria

- Given `scope="personal"`, the selector renders all three labels—`Personal`, `Team`, and `Org`—and `Personal` uses the active-segment styling.
- Given `scope="team"`, the selector renders all three labels and `Team` uses the active-segment styling.
- Given no `scope` prop or `scope={undefined}`, none of the three scope labels is present in the rendered component.
- The selector is positioned above, rather than replacing, the existing window-picker/scrub row.
- The selector reuses the established window-picker colors, spacing, and corner-radius treatment.

### FR2 — Support Personal and Team scope selection

The scope selector must allow an eligible user to switch between Personal and Team scopes through the optional `onScopeChange` callback. Selecting either supported scope must invoke the callback with the corresponding lowercase scope value. The existing window-picker/scrub row must be available only in Personal scope because its controls do not apply to Team or Org data.

#### Success Criteria

- Tapping `Personal` invokes `onScopeChange('personal')` exactly once.
- Tapping `Team` invokes `onScopeChange('team')` exactly once.
- When `scope="personal"`, the existing window-picker/scrub row remains rendered and behaves as it did before the scope selector was added.
- When `scope="team"` or `scope="org"`, the window-picker/scrub row is removed from interaction and view through the component's established animated visibility treatment.
- Changing scope does not change the behavior or callback contract of the existing `4W`, `12W`, and `24W` window options.

### FR3 — Gate Org scope and preserve existing integrations

`CrossoverConfig` must expose an optional `orgTierEnabled?: boolean` rollout field, and `OverviewStickyBar` must accept optional `scope`, `onScopeChange`, and `orgTierEnabled` props. Org must be displayed as a forthcoming tier but must not initiate a scope change in this specification because no Org data path exists. When `orgTierEnabled` is falsy, Org must appear disabled and dimmed; when it is true, Org may appear visually available, but it must remain non-interactive until an Org-capable callback and data path are introduced.

#### Success Criteria

- `CrossoverConfig` accepts the optional `orgTierEnabled?: boolean` field without changing existing required configuration.
- Existing `OverviewStickyBar` call sites compile without supplying any of the new optional props.
- When `orgTierEnabled` is omitted, `false`, or otherwise falsy, Org has a disabled visual treatment, produces no press feedback, and does not invoke `onScopeChange`.
- When `orgTierEnabled={true}`, Org is no longer dimmed, but tapping it still does not invoke `onScopeChange`.
- The `onScopeChange` callback type accepts only `'personal' | 'team'`, preventing an unsupported Org scope transition.
- Existing window-picker and scrub cross-fade tests pass unchanged when no scope props are supplied.

## Technical Design

### Summary

Extend `OverviewStickyBar` with an optional manager scope selector containing
`Personal`, `Team`, and `Org`. The selector is an additional row above the
existing 4W/12W/24W picker and scrub snapshot. When no scope prop is supplied,
the component renders exactly as it does today.

`Personal` and `Team` are selectable. `Org` is included as a rollout preview
but does not change scope in this spec because there is no Org data contract.
The existing window-picker/scrub row is shown only for Personal scope and is
hidden for Team and Org.

### Files to Reference

| File | Purpose |
|---|---|
| `src/components/OverviewStickyBar.tsx` | Source of the existing floating-bar layout, picker styling, visibility animation, and scrub cross-fade behavior to preserve and reuse. |
| `src/components/__tests__/OverviewStickyBar.test.tsx` | Existing component test conventions and regression coverage, if this path exists. |
| `src/types/config.ts` | Existing optional config-toggle convention used by `showApprovals`, `devManagerView`, and `devOvertimePreview`. |
| `app/(tabs)/overview.tsx` | Sole known `OverviewStickyBar` call site and source of `isManager`; scope wiring belongs to Spec 04, not this implementation. |

### Files to Create/Modify

#### Modify `src/components/OverviewStickyBar.tsx`

Add a shared scope type and optional props:

```ts
type OverviewScope = 'personal' | 'team' | 'org';

export interface OverviewStickyBarProps {
  window: 4 | 12 | 24;
  onWindowChange: (window: 4 | 12 | 24) => void;
  scrubSnapshot: ScrubSnapshot | null;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  scope?: OverviewScope;
  onScopeChange?: (scope: 'personal' | 'team') => void;
  orgTierEnabled?: boolean;
}
```

Implementation changes:

- Render the scope row only when `scope !== undefined`. The parent uses this
  omission to preserve the non-manager UI.
- Place the row above the current picker/scrub content within the existing
  sticky-bar layout, avoiding a second independently positioned floating
  control.
- Render three equal segments in this order: `Personal`, `Team`, `Org`.
- Reuse the existing window picker's visual tokens and dimensions:
  `colors.border` for the track, `colors.surfaceElevated` for the selected
  segment, `colors.violet` for selected text, and the same padding and radius
  values.
- Call `onScopeChange?.('personal')` or `onScopeChange?.('team')` when the
  corresponding segment is pressed. A missing callback is a safe no-op.
- Never call `onScopeChange` for Org. When `orgTierEnabled` is falsy, render
  Org dimmed and without press feedback. When true, remove the dimming, but
  keep Org inert because this spec intentionally exposes no Org callback or
  data path.
- Wrap the existing picker/scrub row in an inner animated container. Its
  target state is visible when `scope` is absent or `scope === 'personal'`,
  and collapsed when scope is `team` or `org`.
- Animate both opacity and occupied height (and, if consistent with the
  existing bar transition, a small vertical translation) so the hidden row
  neither receives input nor leaves blank space.
- Keep the bar-level `visible` animation and the existing
  picker/scrub cross-fade unchanged. Scope visibility is an independent inner
  transition.

#### Modify `src/types/config.ts`

Add the optional rollout field without changing existing config consumers:

```ts
orgTierEnabled?: boolean;
```

The field controls only the Org segment's dimmed/preview appearance in this
spec. It does not enable Org selection.

#### Modify or create
`src/components/__tests__/OverviewStickyBar.test.tsx`

Append scope-specific unit tests to the existing suite. If the researched test
path does not exist, create the test beside the component using the repository's
established component-test naming convention.

Cover:

- No scope prop: no Personal/Team/Org row, with existing picker and scrub tests
  still passing.
- `scope="personal"`: scope row appears, Personal is selected, and the window
  picker/scrub row remains present.
- `scope="team"`: Team is selected, the window picker/scrub row is hidden, and
  pressing Personal invokes `onScopeChange('personal')`.
- Pressing Team from Personal invokes `onScopeChange('team')`.
- Missing `onScopeChange`: pressing Personal or Team does not throw.
- Org with a falsy/omitted flag: dimmed, non-interactive, and does not invoke
  the callback.
- Org with `orgTierEnabled={true}`: no longer dimmed but still does not invoke
  the callback.

#### Deferred: `app/(tabs)/overview.tsx`

Do not wire screen state in this spec. Spec 04 will conditionally pass `scope`,
`onScopeChange`, and `orgTierEnabled` for managers. Keeping the new props
optional allows this component work and its tests to land independently.

### Data Flow

1. `overview.tsx` obtains `isManager` and `orgTierEnabled` from configuration
   and owns the selected scope state once Spec 04 is implemented.
2. For a non-manager, the parent omits `scope`. `OverviewStickyBar` skips the
   scope row and treats the existing picker/scrub row as visible.
3. For a manager, the parent passes the current scope. The component renders
   the three-segment scope row and derives segment selection from that prop.
4. A Personal or Team press sends the requested scope upward through
   `onScopeChange`. The component does not own or optimistically mutate scope;
   the parent remains the source of truth.
5. The parent updates its scope state, causing a re-render with the new value.
6. On Personal, the existing window picker and scrub snapshot remain
   available. Their `window`, `onWindowChange`, and `scrubSnapshot` flow is
   unchanged.
7. On Team or Org, the inner picker/scrub row animates to a collapsed,
   non-interactive state because multi-week controls do not apply to those
   scopes.
8. An Org press produces no scope event in all flag states. The config flag
   changes only whether the preview looks disabled.

```text
overview.tsx (source of truth)
  ├─ scope omitted ───────────────> existing non-manager bar
  └─ scope supplied ──────────────> Personal | Team | Org row
       ├─ Personal/Team press ────> onScopeChange ──> parent state update
       ├─ Personal selected ──────> show window picker / scrub row
       ├─ Team selected ─────────> collapse window picker / scrub row
       └─ Org press ─────────────> no event
```

### Edge Cases

- **Backward compatibility:** `scope`, `onScopeChange`, and
  `orgTierEnabled` are optional. Omitting all three must preserve the current
  render tree and behavior as closely as possible.
- **Scope without callback:** The row may be rendered before screen wiring
  lands. Personal and Team presses must use optional callback invocation and
  must not throw.
- **Org flag ambiguity:** `orgTierEnabled` does not widen the callback type.
  Even when true, Org remains inert until a future Org data contract explicitly
  adds selection behavior. Tests should lock this boundary down.
- **Unexpected `scope="org"`:** Although current screen wiring will not select
  Org, the public prop type allows it. Render Org as selected and collapse the
  picker/scrub row, but do not emit an Org change event.
- **Falsy config values:** Both `undefined` and `false` are treated as Org
  preview disabled/dimmed.
- **Animation interruption:** Rapid Personal/Team changes must reverse the
  inner-row animation from its current value rather than assuming the previous
  animation completed.
- **Touch handling while hidden:** The picker/scrub container must not accept
  touches in Team or Org scope. Collapsing its height and conditionally setting
  pointer events avoids invisible controls intercepting input.
- **Scrub snapshot during a scope change:** A non-null snapshot can remain
  owned by the parent while Team is selected. It is simply hidden with the
  Personal-only row and should render normally if Personal is restored.
- **Whole-bar visibility:** `visible={false}` continues to hide the complete
  bar, including the new scope row. The inner scope-dependent animation must
  not override the outer bar animation.
- **Layout growth:** Adding the manager-only row increases the visible bar
  height in Personal scope. The absolute-positioned container and any supplied
  `style` must continue to anchor the combined pill without clipping.
- **Accessibility:** Each segment should have a button role, an explicit
  selected state, and a disabled state for the dimmed Org preview. Labels
  should remain distinguishable without relying only on color.
- **Theme compatibility:** All new colors must come from existing theme tokens;
  no fixed light- or dark-mode colors should be introduced.

### Verification

Run the focused Jest suite for `OverviewStickyBar`, followed by the repository's
TypeScript check. Perform a manager-state visual check in both themes to confirm
that the scope row matches the window picker, the Personal-only row collapses
cleanly for Team, and the Org preview reads as unavailable when the flag is
off.
