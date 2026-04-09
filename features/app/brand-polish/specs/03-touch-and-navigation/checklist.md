# Implementation Checklist

Spec: `03-touch-and-navigation`
Feature: `brand-polish`

---

## Phase 1.0: Test Foundation

### FR1: AnimatedPressable Component
- [x] Write test: renders children without layout changes
- [x] Write test: scale sharedValue reaches 0.96 on pressIn (or animates toward it)
- [x] Write test: scale sharedValue returns to 1.0 on pressOut
- [x] Write test: onPress callback is invoked on tap
- [x] Write test: custom scaleValue prop is respected
- [x] Write test: when disabled={true}, scale stays at 1.0 after press events
- [x] Write test: component exported as named export AnimatedPressable

### FR2: FadeInScreen Spring Entrance
- [x] Write test: screen content enters with opacity animation on tab focus
- [x] Write test: translateY starts at 8 and animates to 0 on focus
- [x] Write test: both opacity and translateY reset when screen loses focus
- [x] Write test: when useReducedMotion returns true, content is immediately visible
- [x] Write test: children render correctly with no layout shift in final state

### FR3: HapticTab Scale Feedback
- [x] Write test: tab icon Animated.View has scale applied via useAnimatedStyle
- [x] Write test: scale reduces on pressIn
- [x] Write test: scale returns to 1.0 on pressOut / release
- [x] Write test: Haptics.impactAsync still fires on press

### FR4: Key Buttons Upgraded to AnimatedPressable
- [x] Write test: ApprovalCard approve button renders as AnimatedPressable
- [x] Write test: ApprovalCard reject button renders as AnimatedPressable
- [x] Write test: modal.tsx Sign Out button renders as AnimatedPressable
- [x] Write test: existing onPress callbacks preserved after migration

---

## Test Design Validation (MANDATORY)

WARNING: **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: AnimatedPressable Component
- [x] Create `src/components/AnimatedPressable.tsx`
- [x] Add `useSharedValue(1)` for scale, `useAnimatedStyle` for transform
- [x] Wire `onPressIn` → `withTiming(scaleValue, timingInstant)`
- [x] Wire `onPressOut` → `withSpring(1, springSnappy)`
- [x] Skip animation when `disabled` prop is true
- [x] Pass all PressableProps through to underlying Pressable
- [x] Export as named export `AnimatedPressable`

### FR2: FadeInScreen Spring Entrance
- [x] Migrate `src/components/FadeInScreen.tsx` from `Animated` (RN core) to Reanimated
- [x] Add `useSharedValue(0)` for opacity and `useSharedValue(8)` for translateY
- [x] On focus: `opacity.value = withTiming(1, timingSmooth)`, `translateY.value = withSpring(0, springSnappy)`
- [x] On blur: reset values directly (no animation) — `opacity.value = 0`, `translateY.value = 8`
- [x] Add `useReducedMotion()` check — skip animation, show final state immediately
- [x] Verify external API unchanged: `<FadeInScreen>{children}</FadeInScreen>`

### FR3: HapticTab Scale Feedback
- [x] Add `useSharedValue(1)` for iconScale to `components/haptic-tab.tsx`
- [x] Add `useAnimatedStyle` returning `transform: [{ scale: iconScale.value }]`
- [x] Wrap `props.children` in `Animated.View` with animatedStyle
- [x] Wire `onPressIn` → haptic call + `iconScale.value = withTiming(0.88, timingInstant)`
- [x] Wire `onPressOut` → `iconScale.value = withSpring(1, springSnappy)`
- [x] Verify active/inactive tab styling is unaffected

### FR4: Key Buttons Upgraded to AnimatedPressable
- [x] In `src/components/ApprovalCard.tsx`: replace Approve `TouchableOpacity` with `AnimatedPressable`
- [x] In `src/components/ApprovalCard.tsx`: replace Reject `TouchableOpacity` with `AnimatedPressable`
- [x] In `app/modal.tsx`: replace Sign Out `TouchableOpacity` with `AnimatedPressable`
- [x] Remove `TouchableOpacity` imports from both files
- [x] Verify `onPress`, `style`/`className`, `disabled` props pass through correctly

---

## Phase 1.2: Review (MANDATORY)

WARNING: **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (code review conducted inline)

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical)
- [x] Fix MEDIUM severity issues (or document why deferred)
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(03-touch-and-navigation): address review findings`

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Apply suggested improvements that strengthen confidence
- [x] Re-run tests to confirm passing
- [x] Commit: `fix(03-touch-and-navigation): strengthen FadeInScreen test assertions`

### Final Verification
- [x] All tests passing (71/71)
- [x] No regressions in existing tests (84 failures pre-existing, unchanged)
- [x] Code follows existing patterns

---

## Session Notes

**2026-03-15**: Spec created. 4 FRs — FR1 (new AnimatedPressable), FR2 (FadeInScreen upgrade), FR3 (HapticTab scale), FR4 (button migrations). No new dependencies needed.

**2026-03-15**: Implementation complete.
- Phase 1.0: 1 test commit (test(FR1-FR4) — 70 tests across 4 files)
- Phase 1.1: 2 implementation commits (feat(FR1-FR3), feat(FR4))
- Phase 1.2: 2 fix commits (review findings: reducedMotion dep, HapticTab layout; test strengthening: FadeInScreen blur resets)
- 71 tests passing. No regressions introduced.
