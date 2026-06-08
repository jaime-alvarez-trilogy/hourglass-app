# Checklist: 01-computation

**Spec:** `computeDayWindowAvgs` + types + constants
**Files:** `src/lib/dayPatternUtils.ts`, `src/lib/__tests__/dayPatternUtils.test.ts`

---

## Phase 1.0 — Tests (Red Phase)

Write tests first. All tests must fail before implementation begins.

### FR1 — Constants
- [x] SC1.1: test `MIN_PRIOR_WEEKS === 2`
- [x] SC1.2: test `TREND_THRESHOLD === 0.5`

### FR2 — Types (compile-time check)
- [x] SC2.1: import `DayWindowResult` from `dayPatternUtils` — TypeScript compiles
- [x] SC2.2: assign object with all four fields — TypeScript compiles

### FR3 — Happy Path 4W
- [x] SC3.1: 8 valid snapshots, 4W → `validWeeksInCurrent=4`, `validWeeksInPrior=4`, `prev!==null`
- [x] SC3.2: current weeks Mon=8h → `current[0] ≈ 8.0`
- [x] SC3.3: prior weeks Mon=4h → `prev[0] ≈ 4.0`
- [x] SC3.4: `current.length === 7` and `prev.length === 7`

### FR3 — Happy Path 12W
- [x] SC3.5: 24 valid snapshots, 12W → both groups, `prev !== null`
- [x] SC3.6: prior group selects oldest 12 (not same 12 as current)

### FR4 — 24W window
- [x] SC4.1: any snapshots, window=24 → `prev === null`
- [x] SC4.2: `validWeeksInPrior === 0` when window=24

### FR5 — Insufficient prior
- [x] SC5.1: 5 valid snapshots, 4W → prior has 1 valid week → `prev === null`
- [x] SC5.2: 6 valid snapshots, 4W → prior has 2 valid weeks → `prev !== null`

### FR6 — Invalid week filtering
- [x] SC6.1: 4 valid + 4 missing `dailyHours`, 4W → only valid ones averaged
- [x] SC6.2: snapshot with all-zero `dailyHours` is skipped
- [x] SC6.3: snapshot with `dailyHours === undefined` is skipped
- [x] SC6.4: empty array → `current=Array(7).fill(0)`, `prev=null`, `validWeeksInCurrent=0`

### FR7 — Output shape invariants
- [x] SC7.1: `current` always has exactly 7 elements
- [x] SC7.2: when `prev!==null`, `prev` has exactly 7 elements
- [x] SC7.3: all values are finite (no NaN, no Infinity)

---

## Phase 1.1 — Implementation (Green Phase)

Implement minimum code to pass each FR's tests.

- [x] FR1: export `MIN_PRIOR_WEEKS = 2` and `TREND_THRESHOLD = 0.5`
- [x] FR2: export `DayWindowResult` interface with all four fields
- [x] FR3: implement `computeDayWindowAvgs` — 4W and 12W happy paths
- [x] FR4: implement 24W guard (`prev = null`)
- [x] FR5: implement insufficient-prior guard (`< MIN_PRIOR_WEEKS`)
- [x] FR6: implement `isValid` filter (defined + sum > 0)
- [x] FR7: verify `avgPerDay` returns 7-element arrays with finite values

Run full test suite. All tests must pass before proceeding.

---

## Phase 1.2 — Review

- [x] Run `spec-implementation-alignment` agent — verify spec.md ↔ implementation match
- [x] Run `pr-review-toolkit:review-pr` — standard PR review pass
- [x] Address any issues from review agents
- [x] Run `test-optimiser` — check for redundant or missing test coverage
- [x] Commit documentation: update checklist.md session notes + FEATURE.md changelog

---

## Session Notes

**2026-06-06**: Implementation complete.
- Phase 1.0: 1 test commit — 34 tests covering all 7 FRs and 22 success criteria (+ 12 parametrised shape invariant cases)
- Phase 1.1: 1 implementation commit — 107-line pure function; 695 existing lib tests unaffected
- Phase 1.2: Review passed (alignment, code quality, test optimiser) — no fix commits needed
- All 34 tests passing.
