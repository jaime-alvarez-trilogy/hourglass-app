# Spec 03 — Scope toggle UI

**Status:** Research complete
**Complexity:** S
**Blocks:** 04
**Blocked By:** — (independent — takes no dependency on the data hooks; wires to a no-op callback until Spec 04 lands)

## Problem context

`OverviewStickyBar` (`src/components/OverviewStickyBar.tsx:1-145`) already owns
the one persistent floating-chrome element on the Overview tab — a frosted-glass
pill absolutely positioned outside the `ScrollView`, with a 4W/12W/24W window
picker (FR2, lines 76-98) that cross-fades with a scrub-snapshot layer (FR3,
lines 100-130) via a shared `scrubMode` animated value. The file's own
architecture comment in `overview.tsx` states it "replaces the old standalone
toggle row" — this is the established pattern for persistent top chrome, so the
new Personal/Team/Org control extends this component rather than introducing a
second floating element (confirmed as the right call via Explore agent research
earlier this feature).

## Key decisions

**1. Scope pill is a new row, stacked above the existing picker/scrub content,
not a replacement for it.** The window picker (4W/12W/24W) and scrub-snapshot
layer are Personal-tier concepts — Spec 02 explicitly descopes multi-week team
trends (only current-week aggregate is fetched), so the window picker has
nothing to control when scope is Team/Org. Rather than overload the existing
picker row with mode-dependent meaning, add a second row above it that's only
rendered when the current user `isManager` (a prop the parent screen already
has via `useConfig()` — `overview.tsx`'s existing inlined check). Non-manager
users never see this row at all — the bar looks and behaves exactly as it does
today for them, zero regression risk for the majority of users.

**2. When scope is Team or Org, the picker/scrub row is hidden entirely (not
just visually inert)** — same `visible`-driven opacity/height animation
mechanism already used for the whole bar (`barOpacity`/`barTranslateY`,
lines 34-45), applied to just that inner row. This avoids showing a
window-picker control that does nothing in Team/Org mode, which would be
confusing UI, not a graceful degradation.

**3. Org option renders disabled (dimmed, non-interactive), not hidden.**
Per the FEATURE.md's "Why Org is flagged, not built," the tier exists in the UI
now (so users know it's coming) but is gated by a config flag — following the
codebase's existing dev-toggle pattern on `CrossoverConfig`
(`showApprovals?`, `devManagerView?`, `devOvertimePreview?` —
`src/types/config.ts:22-24`) rather than introducing a new feature-flag service
(confirmed via Explore agent: no feature-flag mechanism exists in this codebase
today, and the closest existing pattern is exactly these optional boolean
fields). New field: `orgTierEnabled?: boolean`.

**4. Pill visual style matches the existing window picker exactly** — same
`colors.border` track background, `colors.surfaceElevated` active-segment
background, same `colors.violet` active-text color, same padding/radius
constants (`OverviewStickyBar.tsx:78-96`) — not a new visual language. This is
the design constraint already stated in the FEATURE.md.

**5. Props extension, not a new component.** `OverviewStickyBar` gains:
```typescript
scope?: 'personal' | 'team' | 'org';       // omit or undefined = personal-only bar (non-manager)
onScopeChange?: (scope: 'personal' | 'team') => void; // org is disabled — never fires
orgTierEnabled?: boolean;                   // controls Org segment's disabled/dimmed state
```
All three are optional so every existing call site (and every existing test)
continues to compile and behave identically without passing them — this is
purely additive to the component's public interface. `overview.tsx` is the only
call site (confirmed via grep — `OverviewStickyBar` is used nowhere else) and
will be updated in Spec 04 to pass these props conditionally on `isManager`.

## Interface contracts

```typescript
// src/types/config.ts — new field
export interface CrossoverConfig {
  // ...existing fields unchanged...
  orgTierEnabled?: boolean; // dev/rollout toggle — Org tier UI shown disabled until enabled
}
```

```typescript
// src/components/OverviewStickyBar.tsx — extended props
export interface OverviewStickyBarProps {
  window: 4 | 12 | 24;
  onWindowChange: (w: 4 | 12 | 24) => void;
  scrubSnapshot: ScrubSnapshot | null;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  // New, all optional:
  scope?: 'personal' | 'team' | 'org';
  onScopeChange?: (scope: 'personal' | 'team') => void;
  orgTierEnabled?: boolean;
}
```

Render logic addition inside the component: a new row above the existing
`BlurView` picker/scrub block (or a second `BlurView` segment within the same
pill container — implementation detail for Spec 04's execution, not fixed here)
rendered only when `scope !== undefined`. Segments: `Personal | Team | Org`.
Tapping `Personal`/`Team` calls `onScopeChange`; tapping `Org` while
`!orgTierEnabled` is a no-op (dimmed `TouchableOpacity` with `disabled={true}`,
matching React Native's standard disabled-affordance convention — reduced
opacity, no press feedback).

## Test plan

- [ ] Existing `OverviewStickyBar` tests (window picker, scrub cross-fade)
      pass unchanged with no `scope` prop passed — confirms the extension is
      purely additive and doesn't regress current non-manager behavior.
- [ ] When `scope="personal"`, the scope row renders with `Personal` visually
      active (matches the active-segment styling already used for the window
      picker).
- [ ] When `scope="team"`, tapping `Personal` calls `onScopeChange('personal')`.
- [ ] Tapping `Org` when `orgTierEnabled` is falsy does NOT call
      `onScopeChange` (verifies the disabled-tap guard).
- [ ] Tapping `Org` when `orgTierEnabled` is `true` DOES call `onScopeChange`
      — wait, `onScopeChange`'s type signature only accepts `'personal' | 'team'`
      by design (decision 3: Org is inert even when flag-enabled at this UI
      layer, since Spec 02's data hook doesn't support Org yet) — confirm this
      is intentional: enabling `orgTierEnabled` changes the Org segment's visual
      state (undimmed) but Spec 03 alone does not wire it to actually switch
      scope, since there's no Org data path yet. Revisit this flag's behavior
      when Org's data layer is eventually built — for now `orgTierEnabled`
      only controls whether the segment *looks* available, as a soft rollout
      lever, not a functional switch.
- [ ] `scope=undefined` (the default, non-manager case) renders no scope row at
      all — confirmed via snapshot/query that the `Personal|Team|Org` text
      nodes are absent from the tree.

## Files to reference

| File | Why |
|---|---|
| `src/components/OverviewStickyBar.tsx` (full) | The component being extended — all new render logic lives here. |
| `src/components/__tests__/OverviewStickyBar.test.tsx` (if it exists — verify path) | Existing test suite; new tests append here following existing conventions. |
| `src/types/config.ts:22-24` | Existing dev-toggle field pattern (`showApprovals?`, `devManagerView?`, `devOvertimePreview?`) that `orgTierEnabled?` follows. |
| `app/(tabs)/overview.tsx:544-550` | The one call site; Spec 04 wires the new props here, but this spec's component-level tests don't need the screen. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ (load-bearing) | Render/interaction tests per test plan above, React Native Testing Library |
| Live-QA probe | ✗ | Pure UI component, no API |
| TestFlight | ✓ | Visual check: pill styling matches window picker, disabled Org segment reads as clearly non-interactive (not just "broken-looking") |
| Error log | ✗ | No new runtime error path |
