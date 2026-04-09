# Implementation Checklist

Spec: `04-card-entry-animations`
Feature: `brand-polish`

---

## Phase 1.0: Test Foundation

### FR1: useStaggeredEntry Hook
- [x] Write test: hook returns `getEntryStyle` function and `isReady` boolean
- [x] Write test: `getEntryStyle(0)` returns style with `opacity: 0` and `translateY: 16` before focus fires
- [x] Write test: `getEntryStyle(5)` uses 250ms delay (5 * 50)
- [x] Write test: `getEntryStyle(7)` is capped at 300ms delay when `maxStaggerIndex = 6` (default)
- [x] Write test: items at index > `maxStaggerIndex` return resting state `{ opacity: 1, translateY: 0 }` immediately
- [x] Write test: with `useReducedMotion = true`, all items return resting state with no animation dispatched
- [x] Write test: each focus event resets shared values to initial state and re-fires animation sequence
- [x] Write test: hook allocates exactly `min(count, maxStaggerIndex + 1)` animated styles

### FR2: Home Screen Stagger
- [x] Write test: Hero PanelGradient zone is wrapped in `Animated.View` with `getEntryStyle(0)`
- [x] Write test: Weekly Chart Card is wrapped in `Animated.View` with `getEntryStyle(1)`
- [x] Write test: AI Trajectory Card (when `coneData` present) is wrapped with `getEntryStyle(2)`
- [x] Write test: Earnings Card is wrapped with `getEntryStyle(3)`
- [x] Write test: `UrgencyBanner` is NOT wrapped in an animated entry view

### FR3: AI Screen Stagger
- [x] Write test: AI Usage Card is wrapped with `getEntryStyle(0)`
- [x] Write test: BrainLift Card is wrapped with `getEntryStyle(1)`
- [x] Write test: Prime Radiant Card is wrapped with `getEntryStyle(2)`
- [x] Write test: Legend Card renders without overlap glitch (cards have distinct indices)

### FR4: Approvals Screen Stagger
- [x] Write test: Team Requests section `View` is wrapped with `getEntryStyle(0)` for manager role
- [x] Write test: My Requests section `View` is wrapped with `getEntryStyle(1)` for manager role
- [x] Write test: My Requests section uses `getEntryStyle(0)` for non-manager role
- [x] Write test: individual `ApprovalCard` items are NOT individually wrapped with animated entry styles

### FR5: Overview Screen Stagger
- [x] Write test: Earnings ChartSection is wrapped with `getEntryStyle(0)`
- [x] Write test: Hours ChartSection is wrapped with `getEntryStyle(1)`
- [x] Write test: AI Usage ChartSection is wrapped with `getEntryStyle(2)`
- [x] Write test: BrainLift ChartSection is wrapped with `getEntryStyle(3)`
- [x] Write test: the scrub snapshot panel `Animated.View` retains its own independent animation (not rewrapped)

---

## Test Design Validation (MANDATORY)

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: useStaggeredEntry Hook
- [x] Create `src/hooks/useStaggeredEntry.ts`
- [x] Implement `StaggeredEntryOptions` and `UseStaggeredEntryReturn` interfaces
- [x] Allocate `min(count, maxStaggerIndex + 1)` shared value pairs using `useSharedValue`
- [x] Pre-create all `useAnimatedStyle` instances at hook init time (not inside `getEntryStyle`)
- [x] Implement `useEffect` on `isFocused`: reset values then fire staggered springs
- [x] Implement `reduceMotion` branch: instantly set all values to resting state
- [x] Implement `getEntryStyle(index)`: returns pre-created animated style or plain resting style
- [x] Verify all tests pass for FR1

### FR2: Home Screen Stagger
- [x] Add `import Animated from 'react-native-reanimated'` to `app/(tabs)/index.tsx`
- [x] Add `import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry'`
- [x] Call `useStaggeredEntry({ count: 4 })` in `HoursDashboard` component
- [x] Wrap Zone 1 `PanelGradient` in `<Animated.View style={getEntryStyle(0)}>`
- [x] Wrap Zone 2 `Card` (Weekly Chart) in `<Animated.View style={getEntryStyle(1)}>`
- [x] Wrap Zone 2.5 `Card` (AI Trajectory, conditional) in `<Animated.View style={getEntryStyle(2)}>`
- [x] Wrap Zone 3 `Card` (Earnings) in `<Animated.View style={getEntryStyle(3)}>`
- [x] Verify tests pass; confirm `UrgencyBanner` is not wrapped

### FR3: AI Screen Stagger
- [x] Add `import Animated from 'react-native-reanimated'` to `app/(tabs)/ai.tsx`
- [x] Add `import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry'`
- [x] Call `useStaggeredEntry({ count: 6 })` in `AIScreen` component
- [x] Wrap AI Usage `Card` in `<Animated.View style={getEntryStyle(0)}>`
- [x] Wrap BrainLift `Card` in `<Animated.View style={getEntryStyle(1)}>`
- [x] Wrap Prime Radiant `Card` in `<Animated.View style={getEntryStyle(2)}>`
- [x] Wrap Daily Breakdown `Card` (conditional) in `<Animated.View style={getEntryStyle(3)}>`
- [x] Wrap 12-Week Trajectory `Card` (conditional) in `<Animated.View style={getEntryStyle(4)}>`
- [x] Wrap Legend `Card` in `<Animated.View style={getEntryStyle(5)}>`
- [x] Verify tests pass

### FR4: Approvals Screen Stagger
- [x] Add `import Animated from 'react-native-reanimated'` to `app/(tabs)/approvals.tsx`
- [x] Add `import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry'`
- [x] Call `useStaggeredEntry({ count: 2 })` in `ApprovalsScreen` component
- [x] Wrap Team Requests section `View` in `<Animated.View style={getEntryStyle(0)}>` (manager only)
- [x] Wrap My Requests section `View` in `<Animated.View style={getEntryStyle(isManager ? 1 : 0)}>`
- [x] Confirm individual `ApprovalCard` items in `FlatList` are not wrapped
- [x] Verify tests pass

### FR5: Overview Screen Stagger
- [x] Add `import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry'` to `app/(tabs)/overview.tsx`
- [x] Call `useStaggeredEntry({ count: 4 })` in `OverviewScreen` component
- [x] Wrap Earnings `<ChartSection ...>` in `<Animated.View style={getEntryStyle(0)}>`
- [x] Wrap Hours `<ChartSection ...>` in `<Animated.View style={getEntryStyle(1)}>`
- [x] Wrap AI Usage `<ChartSection ...>` in `<Animated.View style={getEntryStyle(2)}>`
- [x] Wrap BrainLift `<ChartSection ...>` in `<Animated.View style={getEntryStyle(3)}>`
- [x] Confirm scrub snapshot panel `Animated.View` retains its own animation (not modified)
- [x] Verify tests pass

---

## Phase 1.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR1–FR5 success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep (no exit animations, no individual list item animation)

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (manual review performed — skill unavailable)

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical)
- [x] Fix MEDIUM severity issues (or document why deferred)
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(04-card-entry-animations): {description}`

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on `src/hooks/__tests__/useStaggeredEntry.test.ts`
- [x] Apply suggested improvements that strengthen confidence
- [x] Re-run tests to confirm passing
- [x] Commit if changes made: `fix(04-card-entry-animations): strengthen test assertions`

### Final Verification
- [x] All tests passing
- [x] No regressions in existing tests (`app/(tabs)/__tests__/` suite)
- [x] Code follows existing patterns (no StyleSheet, no hardcoded hex values, hook in `src/hooks/`)

---

## Session Notes

<!-- Add notes as you work -->

**2026-03-15**: Spec created. 5 FRs: hook (FR1) + 4 screen wirings (FR2–FR5). No new packages required. Count values: Home=4, AI=6, Approvals=2, Overview=4.

**2026-03-15**: Implementation complete.
- Phase 1.0: 1 test commit (`test(FR1-FR5)`) — 65 static-analysis tests using source-file regex pattern (established codebase convention for Reanimated hooks). Red phase confirmed before implementation.
- Phase 1.1: 2 implementation commits (`feat(FR1)`, `feat(FR2-FR5)`) — hook + 4 screen wirings. 1 fixup commit (`test(FR1-FR5)`) for mock additions + import assertion fix.
- Phase 1.2: Review passed. 1 fix commit (`fix(04-card-entry-animations): strengthen test assertions`). Manual code review performed (pr-review-toolkit unavailable). No HIGH/critical issues found.
- All 65 tests passing. No regressions. Total: 6 commits.
- Key decisions: static analysis test strategy (no renderHook — Reanimated incompatible with jest-expo/node); Rules of Hooks compliance via `Array.from` at hook init; `getEntryStyle(isManager ? 1 : 0)` for dynamic approvals index.
