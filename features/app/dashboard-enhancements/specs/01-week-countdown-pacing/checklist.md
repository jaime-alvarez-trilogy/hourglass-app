# Checklist: 01-week-countdown-pacing

## Phase 1.0 — Tests

- [x] Write tests for FR1: `computeDeadlineCountdown` → Monday urgency none, label format
- [x] Write tests for FR1: `computeDeadlineCountdown` → Wednesday urgency warning, msRemaining value
- [x] Write tests for FR1: `computeDeadlineCountdown` → Thursday urgency critical, label format
- [x] Write tests for FR1: `computeDeadlineCountdown` → Thursday near deadline → "Xm left" format
- [x] Write tests for FR1: `computeDeadlineCountdown` → Friday targets next Thursday
- [x] Write tests for FR1: `computeDeadlineCountdown` → Sunday targets next Thursday
- [x] Write tests for FR4: `computePacingSignal(20, 40, monday)` → "5.0h/day needed"
- [x] Write tests for FR4: `computePacingSignal(40, 40, tuesday)` → "Target met"
- [x] Write tests for FR4: `computePacingSignal(30, 40, saturday)` → null
- [x] Write tests for FR4: `computePacingSignal(30, 40, sunday)` → null
- [x] Write tests for FR4: `computePacingSignal(30, 40, wednesday)` → correct label
- [x] Write tests for FR4: `computePacingSignal(38, 40, thursday)` → "2.0h/day needed"
- [x] Write tests for FR4: hoursWorked > weeklyLimit → "Target met"
- [x] Write tests for FR4: label formats to 1 decimal place

## Phase 1.1 — Implementation

- [x] FR1: Add `computeDeadlineCountdown` to `src/lib/hours.ts`
- [x] FR4: Add `computePacingSignal` to `src/lib/hours.ts`
- [x] FR2: Add countdown pill `Animated.View` inline with `StateBadge` in `app/(tabs)/index.tsx` Zone 1
- [x] FR3: Add `criticalPulse` shared value + `useEffect` for pulsing animation
- [x] FR3: Apply `criticalPulseStyle` conditionally to countdown pill
- [x] FR5: Add pacing label `Text` under `MetricValue` in Zone 1 normal branch
- [x] FR5: Hide pacing label on weekend (pacing null) and when target met (hoursPerDayNeeded=0)
- [x] Export `computeDeadlineCountdown` and `computePacingSignal` from `hours.ts`
- [x] Import both functions in `index.tsx`

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment` check
- [x] Run `pr-review-toolkit:review-pr`
- [x] Run `test-optimiser`
- [x] All 15 tests passing (`npx jest countdownPacing`)

## Session Notes

**2026-04-06**: Spec execution complete.
- Implementation was already committed as part of `d78e2bd chore: commit all session changes`
- Phase 1.0: 15 unit tests in `src/lib/__tests__/countdownPacing.test.ts` — all passing
- Phase 1.1: `computeDeadlineCountdown` + `computePacingSignal` in `src/lib/hours.ts`; countdown pill + pacing label in `app/(tabs)/index.tsx`
- Phase 1.2: Tests passing, spec created
- All tests passing.
