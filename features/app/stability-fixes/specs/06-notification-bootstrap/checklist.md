# Checklist: 06-notification-bootstrap

**Spec:** [spec.md](spec.md)
**Status:** Not Started

---

## Phase 1.0 — Tests (Red Phase)

### FR1 — Remove early-return bail on missing widget data

- [ ] `test(FR1)`: `scheduleAll` with null widget data calls `scheduleThursdayReminder` (not skipped)
- [ ] `test(FR1)`: `scheduleAll` with null widget data calls `scheduleMondaySummary`
- [ ] `test(FR1)`: permissions denied → neither `scheduleThursdayReminder` nor `scheduleMondaySummary` called (unchanged)

### FR2 — Default hoursRemaining to safe positive sentinel

- [ ] `test(FR2)`: null widget data → `scheduleThursdayReminder` called with `hoursRemaining = 1`
- [ ] `test(FR2)`: widget data with `hoursRemaining: "8.5"` → `scheduleThursdayReminder` called with `8.5`
- [ ] `test(FR2)`: widget data with `hoursRemaining: "0.0"` → `scheduleThursdayReminder` NOT called
- [ ] `test(FR2)`: widget data with `hoursRemaining: "-2.5h OT"` → `scheduleThursdayReminder` NOT called
- [ ] `test(FR2)`: malformed JSON (`'not-json'`) → `scheduleThursdayReminder` called (default sentinel)
- [ ] `test(FR2)`: widget data with missing `hoursRemaining` field → `scheduleThursdayReminder` called (default sentinel)

### FR3 — Monday summary always scheduled when permissions granted

- [ ] `test(FR3)`: null widget data → `scheduleMondaySummary` called
- [ ] `test(FR3)`: valid widget data → `scheduleMondaySummary` called
- [ ] `test(FR3)`: permissions denied → `scheduleMondaySummary` NOT called

---

## Phase 1.1 — Implementation

### FR1 — Remove early-return bail

- [ ] `feat(FR1)`: Remove `if (!raw) return` from `scheduleAll` in `useScheduledNotifications.ts`
- [ ] `feat(FR1)`: All FR1 tests pass

### FR2 — Default hoursRemaining sentinel

- [ ] `feat(FR2)`: Initialize `let hoursRemaining = 1` before AsyncStorage read
- [ ] `feat(FR2)`: Read widget data conditionally (`if (raw) { ... }` not `if (!raw) return`)
- [ ] `feat(FR2)`: Wrap `JSON.parse` in try/catch; keep `hoursRemaining = 1` on parse failure
- [ ] `feat(FR2)`: Only override `hoursRemaining` when `parseFloat` result is not NaN
- [ ] `feat(FR2)`: All FR2 tests pass

### FR3 — Monday summary unconditional

- [ ] `feat(FR3)`: `scheduleMondaySummary()` called outside any widget-data conditional block
- [ ] `feat(FR3)`: All FR3 tests pass

---

## Phase 1.2 — Review

- [ ] Run `spec-implementation-alignment` agent — verify all FR success criteria met
- [ ] Run `pr-review-toolkit:review-pr` — address any feedback
- [ ] Run `test-optimiser` — remove redundant tests, improve assertions
- [ ] All tests passing in CI

---

## Files

| File | Phase | Action |
|------|-------|--------|
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | 1.0 | Add test cases |
| `src/hooks/useScheduledNotifications.ts` | 1.1 | Fix `scheduleAll` |
