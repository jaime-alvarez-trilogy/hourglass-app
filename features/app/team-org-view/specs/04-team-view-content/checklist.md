# Implementation Checklist

Spec: `04-team-view-content`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Gate and control the overview scope for managers
- [ ] Write test: `useIsManager()` returns `true` when `config.isManager === true`
- [ ] Write test: `useIsManager()` returns `true` when `config.devManagerView === true`
- [ ] Write test: `useIsManager()` returns `false` for all other config states, including absent/loading config
- [ ] Write test: `overview.tsx`, `approvals.tsx`, `index.tsx` compute the same `isManager` value after adopting `useIsManager()` (regression guard for each screen's existing manager-gated behavior)
- [ ] Write test: non-manager renders `OverviewStickyBar` with `scope={undefined}` and `onScopeChange={undefined}`, no scope pill, screen behavior unchanged from pre-feature
- [ ] Write test: manager defaults to `scope === 'personal'` on mount
- [ ] Write test: selecting `Team` in the pill calls `setScope('team')` and re-renders into the team branch
- [ ] Write test: remounting the Overview screen resets scope to `personal`

### FR2: Replace personal detail content with team aggregates in Team scope
- [ ] Write test: personal scope renders the existing four personal charts, Work Pattern, and Hourly Patterns content unchanged
- [ ] Write test: team scope removes all six personal-detail elements from the rendered tree
- [ ] Write test: team scope renders exactly three `ChartSection`s (hours/AI%/BrainLift) sourced from `useTeamAggregateData()`
- [ ] Write test: each team aggregate receives a one-element data array and `weekLabels={['This week']}`
- [ ] Write test: team aggregate sections use gold/cyan/violet accents respectively
- [ ] Write test: team aggregate sections have no functioning scrub interaction (no-op callback, null cursor)
- [ ] Write test: hero card, `EarningsPaceCard`, `ApprovalUrgencyCard`, and insight chips remain present in both Personal and Team scope

### FR3: Present team members and resilient team-view states
- [ ] Write test: loaded non-empty team data renders one `TeamMemberRow` per `breakdown` entry
- [ ] Write test: member with a photo renders that photo; member without one renders initials fallback
- [ ] Write test: normal member row shows hours/AI%/BrainLift with gold/cyan/violet accents
- [ ] Write test: `MGR` badge renders only when `member.isManager === true`
- [ ] Write test: a `fetchFailed: true` entry remains visible, muted, with `Couldn't load` label
- [ ] Write test: `isLoading === true && data === null` renders skeleton cards, not zeroed charts
- [ ] Write test: `breakdown.length === 0` renders `No direct reports found`, no charts or rows
- [ ] Write test: `reportCount === 0` with non-empty `breakdown` renders failed member rows, not the empty-roster message
- [ ] Write test: non-null `error` is sent to the existing error logger, regardless of whether `data` is null or cached-valid

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage
- [ ] Assertions are specific (not just "exists" or "doesn't throw")
- [ ] Mocks return realistic data matching interface contracts (`TeamAggregateData`, `TeamMemberBreakdown` per Spec 02's spec-research.md)
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Gate and control the overview scope for managers
- [ ] Create `src/hooks/useIsManager.ts` wrapping `useConfig()`, returning `config?.isManager === true || config?.devManagerView === true`
- [ ] Update `overview.tsx` to use `useIsManager()` (keep existing `useConfig()` call for other fields)
- [ ] Update `approvals.tsx` to use `useIsManager()`; drop the now-unused `useConfig` import/binding if `config` has no other use in that file
- [ ] Update `index.tsx` to use `useIsManager()` (keep existing `useConfig()` call for other fields)
- [ ] Add local `scope` state (`useState<'personal' | 'team'>('personal')`) to `OverviewScreen`, alongside existing window/scrub state
- [ ] Pass `scope`/`onScopeChange`/`orgTierEnabled` to `OverviewStickyBar` only when `isManager` is true; `undefined`/`undefined` otherwise

### FR2: Replace personal detail content with team aggregates in Team scope
- [ ] Wrap the existing personal chart block (earnings/hours/AI%/BrainLift `ChartSection`s, Work Pattern, Hourly Patterns) in a `scope === 'personal'` branch, unchanged
- [ ] Add `TeamViewContent` local component rendering three `ChartSection`s (`data={[weekHours]}` gold, `data={[weekAiPct]}` cyan, `data={[weekBrainliftHours]}` violet) with `weekLabels={['This week']}`, no-op scrub callback, `externalCursorIndex={null}`
- [ ] Render `TeamViewContent` only when `isManager && scope === 'team'`
- [ ] Confirm hero card, `EarningsPaceCard`, `ApprovalUrgencyCard`, and insight chips stay outside the scope branch

### FR3: Present team members and resilient team-view states
- [ ] Add `TeamMemberRow` local component: photo or two-letter initials fallback, name, `MGR` badge conditional on `member.isManager`, hours/AI%/BrainLift stats in gold/cyan/violet
- [ ] Add muted/dimmed treatment + `Couldn't load` label for `fetchFailed: true` rows (em dashes instead of zero metrics)
- [ ] Implement `TeamViewContent`'s state precedence: loading skeletons → `data === null` error card → `breakdown.length === 0` empty message → `reportCount === 0` with non-empty breakdown (failed rows) → normal aggregate + breakdown render
- [ ] Log non-null `error` via the existing error-logging convention on every occurrence, independent of the visible-state precedence above
- [ ] Use a stable member identifier (`TeamMemberBreakdown.member`) for row keys, never display name or array index

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation
- [ ] No scope creep or shortfall (no Org data path, no multi-week team history, no roster-fetch duplication, no new chart primitive)

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes
- [ ] Commit fixes: `fix(04-team-view-content): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(04-team-view-content): strengthen test assertions`

### Final Verification
- [ ] All tests passing (`app/(tabs)/__tests__/overview.test.tsx`, `app/(tabs)/__tests__/approvals.test.tsx` or equivalent, `app/(tabs)/index.tsx` tests, new `useIsManager` test file)
- [ ] TypeScript check passes with no new errors
- [ ] No regressions in existing `overview.tsx`/`approvals.tsx`/`index.tsx` tests after the `useIsManager()` extraction
- [ ] Code follows existing hook/screen layering conventions (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections; Technical Design draft required the narrow-file-allowlist pattern and a 240s timeout, consistent with Specs 02/03's prior Technical Design timeouts; coherence check required 3 fix iterations — naming mismatch, empty-vs-all-failed precedence, loading precedence, Org enabled/disabled wording, and hook-error-with-cached-data behavior — before reaching PASS).
