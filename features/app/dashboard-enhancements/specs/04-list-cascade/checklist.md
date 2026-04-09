# Checklist: 04-list-cascade

## Phase 4.0 — Tests (Red Phase)

### FR1: Hook interface
- [x] Test: hook file exists at `src/hooks/useListCascade.ts`
- [x] Test: exports `useListCascade` function
- [x] Test: exports `UseListCascadeOptions` interface
- [x] Test: exports `UseListCascadeReturn` interface
- [x] Test: `UseListCascadeOptions` has `count: number` field
- [x] Test: `delayPerItem` defaults to 60
- [x] Test: `maxDelay` defaults to 400
- [x] Test: `getItemStyle(index: number)` is declared in return interface

### FR2: Initial/final state animation
- [x] Test: initialises `translateY` shared values with `TRANSLATE_Y_START = 12`
- [x] Test: initialises `opacity` shared values to 0
- [x] Test: initialises `scale` shared values with `SCALE_START = 0.97`
- [x] Test: animates opacity to 1 using `withSpring`
- [x] Test: animates translateY to 0 using `withSpring`
- [x] Test: animates scale to 1 using `withSpring`
- [x] Test: uses `springBouncy` preset from `reanimated-presets`
- [x] Test: `getItemStyle` returns resting state for out-of-range indices

### FR3: Delay calculation
- [x] Test: uses `withDelay` for staggered timing
- [x] Test: computes delay as `index * delayPerItem`
- [x] Test: caps delay at `maxDelay` using `Math.min`

### FR4: Re-trigger on deps change
- [x] Test: accepts `deps` as second argument
- [x] Test: `useEffect` dependency array spreads `deps`
- [x] Test: resets values to initial state before re-firing

### FR5: ai.tsx integration
- [x] Test: imports `useListCascade` from `@/src/hooks/useListCascade`
- [x] Test: calls with `count` from `dailyBreakdown.length`
- [x] Test: passes `chartKey` as dep
- [x] Test: wraps `DailyAIRow` in `Animated.View` with `getItemStyle(index)`
- [x] Test: `dailyBreakdown.map` includes `Animated.View`

### FR6: approvals.tsx integration
- [x] Test: imports `useListCascade` from `@/src/hooks/useListCascade`
- [x] Test: calls with `count` from `items.length`
- [x] Test: wraps approval items in `Animated.View` with `getItemStyle(index)`

### FR7: Reduced motion
- [x] Test: imports `useReducedMotion` from `react-native-reanimated`
- [x] Test: calls `useReducedMotion()` in hook body
- [x] Test: has `reduceMotion` branch that snaps to resting state

### Shared value allocation
- [x] Test: uses `useSharedValue` from `react-native-reanimated`
- [x] Test: uses `useAnimatedStyle` from `react-native-reanimated`
- [x] Test: pre-creates animated styles in array (not inside `getItemStyle`)
- [x] Test: declares `MAX_ITEMS` constant for fixed allocation
- [x] Test: uses `Array.from` to pre-allocate shared values

---

## Phase 4.1 — Implementation

- [x] Create `src/hooks/useListCascade.ts` with full hook implementation
- [x] Pre-allocate `MAX_ITEMS = 50` shared values (opacity, translateY, scale)
- [x] Pre-build `MAX_ITEMS` animated styles via `useAnimatedStyle`
- [x] Implement `useEffect` with reset + staggered spring logic
- [x] Implement `useReducedMotion` snap branch
- [x] Implement `getItemStyle(index)` with out-of-range guard
- [x] Apply to `app/(tabs)/ai.tsx` — wrap `DailyAIRow` map in `Animated.View`
- [x] Apply to `app/(tabs)/approvals.tsx` — wrap approval items in `Animated.View`
- [x] All 38 tests passing

---

## Phase 4.2 — Review

- [x] spec-implementation-alignment check
- [x] pr-review-toolkit review
- [x] test-optimiser run
- [x] All tests passing after review

---

## Session Notes

**2026-04-06**: Spec execution complete.
- Implementation was already present in codebase prior to spec documentation
- Phase 4.0: 38 static analysis tests — all passing
- Phase 4.1: Hook, tests, and screen integrations all complete
- Phase 4.2: Tests passing cleanly, implementation fully aligned with spec-research.md
- All 38 tests passing (0 failures)
