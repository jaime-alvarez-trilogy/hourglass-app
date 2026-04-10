# Checklist: 06-notification-bootstrap

**Spec:** [spec.md](spec.md)
**Status:** Complete

---

## Phase 1.0 — Tests (Red Phase)

### FR1 — Remove early-return bail on missing widget data

- [x] `test(FR1)`: `scheduleAll` with null widget data calls `scheduleThursdayReminder` (not skipped)
- [x] `test(FR1)`: `scheduleAll` with null widget data calls `scheduleMondaySummary`
- [x] `test(FR1)`: permissions denied → neither `scheduleThursdayReminder` nor `scheduleMondaySummary` called (unchanged)

### FR2 — Default hoursRemaining to safe positive sentinel

- [x] `test(FR2)`: null widget data → `scheduleThursdayReminder` called with `hoursRemaining = 1`
- [x] `test(FR2)`: widget data with `hoursRemaining: "8.5"` → `scheduleThursdayReminder` called with `8.5`
- [x] `test(FR2)`: widget data with `hoursRemaining: "0.0"` → `scheduleThursdayReminder` NOT called
- [x] `test(FR2)`: widget data with `hoursRemaining: "-2.5h OT"` → `scheduleThursdayReminder` NOT called
- [x] `test(FR2)`: malformed JSON (`'not-json'`) → `scheduleThursdayReminder` called (default sentinel)
- [x] `test(FR2)`: widget data with missing `hoursRemaining` field → `scheduleThursdayReminder` called (default sentinel)

### FR3 — Monday summary always scheduled when permissions granted

- [x] `test(FR3)`: null widget data → `scheduleMondaySummary` called
- [x] `test(FR3)`: valid widget data → `scheduleMondaySummary` called
- [x] `test(FR3)`: permissions denied → `scheduleMondaySummary` NOT called

---

## Phase 1.1 — Implementation

### FR1 — Remove early-return bail

- [x] `feat(FR1)`: Remove `if (!raw) return` from `scheduleAll` in `useScheduledNotifications.ts`
- [x] `feat(FR1)`: All FR1 tests pass

### FR2 — Default hoursRemaining sentinel

- [x] `feat(FR2)`: Initialize `let hoursRemaining = 1` before AsyncStorage read
- [x] `feat(FR2)`: Read widget data conditionally (`if (raw) { ... }` not `if (!raw) return`)
- [x] `feat(FR2)`: Wrap `JSON.parse` in try/catch; keep `hoursRemaining = 1` on parse failure
- [x] `feat(FR2)`: Only override `hoursRemaining` when `parseFloat` result is not NaN
- [x] `feat(FR2)`: All FR2 tests pass

### FR3 — Monday summary unconditional

- [x] `feat(FR3)`: `scheduleMondaySummary()` called outside any widget-data conditional block
- [x] `feat(FR3)`: All FR3 tests pass

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment` agent — verify all FR success criteria met
- [x] Run `pr-review-toolkit:review-pr` — address any feedback
- [x] Run `test-optimiser` — remove redundant tests, improve assertions
- [x] All tests passing in CI

---

## Files

| File | Phase | Action |
|------|-------|--------|
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | 1.0 | Add test cases |
| `src/hooks/useScheduledNotifications.ts` | 1.1 | Fix `scheduleAll` |

## Session Notes

**2026-04-09**: Implementation complete.
- Phase 1.0: 1 test commit (7 new tests across FR1-FR3, static analysis + behavioral)
- Phase 1.1: 1 implementation commit (20 lines changed in scheduleAll)
- Phase 1.2: Review passed; test-optimiser removed 2 redundant tests, tightened 2 others
- All 55 tests passing (down from 57 after optimisation).
