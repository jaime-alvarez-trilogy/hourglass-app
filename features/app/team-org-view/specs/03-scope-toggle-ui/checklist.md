# Implementation Checklist

Spec: `03-scope-toggle-ui`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Display the scope selector for eligible users
- [ ] Write test: no `scope` prop (or `scope={undefined}`) renders none of the `Personal`/`Team`/`Org` labels, and existing window-picker/scrub tests pass unchanged
- [ ] Write test: `scope="personal"` renders all three labels with `Personal` using active-segment styling
- [ ] Write test: `scope="team"` renders all three labels with `Team` using active-segment styling
- [ ] Write test: the scope row renders above (not replacing) the existing window-picker/scrub row when present

### FR2: Support Personal and Team scope selection
- [ ] Write test: tapping `Personal` invokes `onScopeChange('personal')` exactly once
- [ ] Write test: tapping `Team` invokes `onScopeChange('team')` exactly once
- [ ] Write test: `scope="personal"` keeps the window-picker/scrub row rendered and interactive, matching pre-existing behavior
- [ ] Write test: `scope="team"` (and `scope="org"`) hides the window-picker/scrub row from view and interaction via the animated visibility treatment
- [ ] Write test: existing `4W`/`12W`/`24W` window-picker callback behavior is unchanged regardless of `scope`

### FR3: Gate Org scope and preserve existing integrations
- [ ] Write test: `CrossoverConfig` accepts `orgTierEnabled?: boolean` without requiring it (type-level check)
- [ ] Write test: existing `OverviewStickyBar` call sites/tests compile and pass without supplying any new props
- [ ] Write test: `orgTierEnabled` omitted/`false` renders Org dimmed, produces no press feedback, and tapping it does not invoke `onScopeChange`
- [ ] Write test: `orgTierEnabled={true}` renders Org undimmed but tapping it still does not invoke `onScopeChange`
- [ ] Write test (type-level): `onScopeChange` cannot be called with `'org'` — signature only accepts `'personal' | 'team'`
- [ ] Write test: existing scrub cross-fade / window-picker tests pass unchanged when no scope props are supplied

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage
- [ ] Assertions are specific (not just "exists" or "doesn't throw")
- [ ] Mocks return realistic data matching interface contracts (per spec-research.md decisions)
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Display the scope selector for eligible users
- [ ] Add `OverviewScope` type (`'personal' | 'team' | 'org'`) and extend `OverviewStickyBarProps` with optional `scope`, `onScopeChange`, `orgTierEnabled`
- [ ] Render the scope row only when `scope !== undefined`, positioned above the existing picker/scrub content within the same pill container
- [ ] Render `Personal`/`Team`/`Org` as three equal segments reusing existing window-picker visual tokens (`colors.border`, `colors.surfaceElevated`, `colors.violet`, padding/radius)

### FR2: Support Personal and Team scope selection
- [ ] Wire `Personal`/`Team` presses to `onScopeChange?.('personal')` / `onScopeChange?.('team')` (optional-callback safe no-op)
- [ ] Wrap the existing picker/scrub row in an inner animated container, visible when `scope` is absent or `'personal'`, collapsed (opacity + height, non-interactive) for `'team'`/`'org'`
- [ ] Keep the outer bar-level `visible` animation and existing picker/scrub cross-fade untouched

### FR3: Gate Org scope and preserve existing integrations
- [ ] Add `orgTierEnabled?: boolean` to `CrossoverConfig` in `src/types/config.ts`
- [ ] Render Org dimmed/non-interactive when `orgTierEnabled` is falsy; undimmed but still non-interactive when true
- [ ] Never call `onScopeChange` for Org presses under any flag state
- [ ] Add JSDoc per module convention where applicable (`hourglassws/CLAUDE.md`)

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation
- [ ] No scope creep or shortfall (no screen-level wiring in `overview.tsx` — that belongs to Spec 04)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(03-scope-toggle-ui): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(03-scope-toggle-ui): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`OverviewStickyBar` test suite)
- [ ] TypeScript check passes with no new errors
- [ ] No regressions in existing window-picker/scrub-snapshot tests
- [ ] Code follows existing `src/components/` patterns and module layering (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections, coherence-checked PASS).
