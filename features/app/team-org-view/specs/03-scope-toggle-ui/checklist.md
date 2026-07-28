# Implementation Checklist

Spec: `03-scope-toggle-ui`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Display the scope selector for eligible users
- [x] Write test: no `scope` prop (or `scope={undefined}`) renders none of the `Personal`/`Team`/`Org` labels, and existing window-picker/scrub tests pass unchanged
- [x] Write test: `scope="personal"` renders all three labels with `Personal` using active-segment styling
- [x] Write test: `scope="team"` renders all three labels with `Team` using active-segment styling
- [x] Write test: the scope row renders above (not replacing) the existing window-picker/scrub row when present

### FR2: Support Personal and Team scope selection
- [x] Write test: tapping `Personal` invokes `onScopeChange('personal')` exactly once
- [x] Write test: tapping `Team` invokes `onScopeChange('team')` exactly once
- [x] Write test: `scope="personal"` keeps the window-picker/scrub row rendered and interactive, matching pre-existing behavior
- [x] Write test: `scope="team"` (and `scope="org"`) hides the window-picker/scrub row from view and interaction via the animated visibility treatment
- [x] Write test: existing `4W`/`12W`/`24W` window-picker callback behavior is unchanged regardless of `scope`

### FR3: Gate Org scope and preserve existing integrations
- [x] Write test: `CrossoverConfig` accepts `orgTierEnabled?: boolean` without requiring it (type-level check)
- [x] Write test: existing `OverviewStickyBar` call sites/tests compile and pass without supplying any new props
- [x] Write test: `orgTierEnabled` omitted/`false` renders Org dimmed, produces no press feedback, and tapping it does not invoke `onScopeChange`
- [x] Write test: `orgTierEnabled={true}` renders Org undimmed but tapping it still does not invoke `onScopeChange`
- [x] Write test (type-level): `onScopeChange` cannot be called with `'org'` — signature only accepts `'personal' | 'team'`
- [x] Write test: existing scrub cross-fade / window-picker tests pass unchanged when no scope props are supplied

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent (completed in a prior session pass; assertions strengthened per its feedback in commit `5c5e205`)
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts (per spec-research.md decisions)
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Display the scope selector for eligible users
- [x] Add `OverviewScope` type (`'personal' | 'team' | 'org'`) and extend `OverviewStickyBarProps` with optional `scope`, `onScopeChange`, `orgTierEnabled`
- [x] Render the scope row only when `scope !== undefined`, positioned above the existing picker/scrub content within the same pill container
- [x] Render `Personal`/`Team`/`Org` as three equal segments reusing existing window-picker visual tokens (`colors.border`, `colors.surfaceElevated`, `colors.violet`, padding/radius)

### FR2: Support Personal and Team scope selection
- [x] Wire `Personal`/`Team` presses to `onScopeChange?.('personal')` / `onScopeChange?.('team')` (optional-callback safe no-op)
- [x] Wrap the existing picker/scrub row in an inner animated container, visible when `scope` is absent or `'personal'`, collapsed (opacity + height, non-interactive) for `'team'`/`'org'`
- [x] Keep the outer bar-level `visible` animation and existing picker/scrub cross-fade untouched

### FR3: Gate Org scope and preserve existing integrations
- [x] Add `orgTierEnabled?: boolean` to `CrossoverConfig` in `src/types/config.ts`
- [x] Render Org dimmed/non-interactive when `orgTierEnabled` is falsy; undimmed but still non-interactive when true
- [x] Never call `onScopeChange` for Org presses under any flag state
- [x] Add JSDoc per module convention where applicable (`hourglassws/CLAUDE.md`)

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall (no screen-level wiring in `overview.tsx` — that belongs to Spec 04)

### Step 1: Comprehensive PR Review
- [x] `pr-review-toolkit:review-pr` skill is scoped to GitHub PR diffs and not applicable to this local, non-PR commit workflow; performed a manual review pass instead (diff read line-by-line, `eslint` run clean on both changed files, cross-checked against spec-research.md decisions) — no HIGH/MEDIUM issues found

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical) — none found
- [x] Fix MEDIUM severity issues (or document why deferred) — none found
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(03-scope-toggle-ui): {description}`

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Apply suggested improvements that strengthen confidence (4 assertions strengthened: row-height check on Personal, call-count check on window-picker callback, explicit `disabled` checks on both `orgTierEnabled` states)
- [x] Re-run tests to confirm passing
- [x] Commit if changes made: `fix(03-scope-toggle-ui): strengthen test assertions` (commit `1b9a907`)

### Final Verification
- [x] All tests passing (`OverviewStickyBar` test suite — 46/46, plus `config-types.test.ts` 6/6)
- [x] TypeScript check passes with no new errors (verified via before/after `tsc --noEmit` diff — zero errors reference either changed file; all pre-existing errors are unrelated dormant-work issues)
- [x] No regressions in existing window-picker/scrub-snapshot tests
- [x] Code follows existing `src/components/` patterns and module layering (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections, coherence-checked PASS).

**2026-07-28**: Phase 1.1/1.2 complete. Implementation: added `OverviewScope` type
and `scope`/`onScopeChange`/`orgTierEnabled` props to `OverviewStickyBar`
(`e2b4676` for the `CrossoverConfig.orgTierEnabled` field, `4c6650c` for the
component). Fixed one pre-existing bug surfaced by the new tests along the way:
the window-picker label was rendered as two JSX children (`{w}W`), which
`JSON.stringify`-based substring assertions (e.g. matching `"12W"`) could never
match — changed to a single template-literal child (`` {`${w}W`} ``) so the
rendered text node is one string, fixing FR2 SC6 without altering visible
output. Review: `spec-implementation-alignment` and `test-optimiser` agents
both ran clean; `pr-review-toolkit:review-pr` isn't applicable to this local
non-PR commit flow, so a manual review pass (full diff read + `eslint`) stood
in for it — no HIGH/MEDIUM findings. `test-optimiser` strengthened 4 assertions
(row-height check, call-count check, explicit `disabled` checks on both
`orgTierEnabled` states — the latter closes a real gap: it would have missed a
`disabled={!orgTierEnabled}` regression that ships an interactive Org segment),
committed as `1b9a907`. Final: 46/46 `OverviewStickyBar` tests + 6/6
`config-types` tests passing; `tsc --noEmit` diff confirms zero new errors from
either changed file.
