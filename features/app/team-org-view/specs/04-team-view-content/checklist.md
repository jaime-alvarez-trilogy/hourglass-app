# Implementation Checklist

Spec: `04-team-view-content`
Feature: `team-org-view`

---

## Phase 1.0: Test Foundation

### FR1: Gate and control the overview scope for managers
- [x] Write test: `useIsManager()` returns `true` when `config.isManager === true`
- [x] Write test: `useIsManager()` returns `true` when `config.devManagerView === true`
- [x] Write test: `useIsManager()` returns `false` for all other config states, including absent/loading config
- [x] Write test: `overview.tsx`, `approvals.tsx`, `index.tsx` compute the same `isManager` value after adopting `useIsManager()` (regression guard for each screen's existing manager-gated behavior)
- [x] Write test: non-manager renders `OverviewStickyBar` with `scope={undefined}` and `onScopeChange={undefined}`, no scope pill, screen behavior unchanged from pre-feature
- [x] Write test: manager defaults to `scope === 'personal'` on mount
- [x] Write test: selecting `Team` in the pill calls `setScope('team')` and re-renders into the team branch
- [x] Write test: remounting the Overview screen resets scope to `personal`

### FR2: Replace personal detail content with team aggregates in Team scope
- [x] Write test: personal scope renders the existing four personal charts, Work Pattern, and Hourly Patterns content unchanged
- [x] Write test: team scope removes all six personal-detail elements from the rendered tree
- [x] Write test: team scope renders exactly three `ChartSection`s (hours/AI%/BrainLift) sourced from `useTeamAggregateData()`
- [x] Write test: each team aggregate receives a one-element data array and `weekLabels={['This week']}`
- [x] Write test: team aggregate sections use gold/cyan/violet accents respectively
- [x] Write test: team aggregate sections have no functioning scrub interaction (no-op callback, null cursor)
- [x] Write test: hero card, `EarningsPaceCard`, `ApprovalUrgencyCard`, and insight chips remain present in both Personal and Team scope

### FR3: Present team members and resilient team-view states
- [x] Write test: loaded non-empty team data renders one `TeamMemberRow` per `breakdown` entry
- [x] Write test: member with a photo renders that photo; member without one renders initials fallback
- [x] Write test: normal member row shows hours/AI%/BrainLift with gold/cyan/violet accents
- [x] Write test: `MGR` badge renders only when `member.isManager === true`
- [x] Write test: a `fetchFailed: true` entry remains visible, muted, with `Couldn't load` label
- [x] Write test: `isLoading === true && data === null` renders skeleton cards, not zeroed charts
- [x] Write test: `breakdown.length === 0` renders `No direct reports found`, no charts or rows
- [x] Write test: `reportCount === 0` with non-empty `breakdown` renders failed member rows, not the empty-roster message
- [x] Write test: non-null `error` is sent to the existing error logger, regardless of whether `data` is null or cached-valid

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts (`TeamAggregateData`, `TeamMemberBreakdown` per Spec 02's spec-research.md)
- [x] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Gate and control the overview scope for managers
- [x] Create `src/hooks/useIsManager.ts` wrapping `useConfig()`, returning `config?.isManager === true || config?.devManagerView === true`
- [x] Update `overview.tsx` to use `useIsManager()` (keep existing `useConfig()` call for other fields)
- [x] Update `approvals.tsx` to use `useIsManager()`; drop the now-unused `useConfig` import/binding if `config` has no other use in that file
- [x] Update `index.tsx` to use `useIsManager()` (keep existing `useConfig()` call for other fields)
- [x] Add local `scope` state (`useState<'personal' | 'team'>('personal')`) to `OverviewScreen`, alongside existing window/scrub state
- [x] Pass `scope`/`onScopeChange`/`orgTierEnabled` to `OverviewStickyBar` only when `isManager` is true; `undefined`/`undefined` otherwise

### FR2: Replace personal detail content with team aggregates in Team scope
- [x] Wrap the existing personal chart block (earnings/hours/AI%/BrainLift `ChartSection`s, Work Pattern, Hourly Patterns) in a `scope === 'personal'` branch, unchanged
- [x] Add `TeamViewContent` local component rendering three `ChartSection`s (`data={[weekHours]}` gold, `data={[weekAiPct]}` cyan, `data={[weekBrainliftHours]}` violet) with `weekLabels={['This week']}`, no-op scrub callback, `externalCursorIndex={null}`
- [x] Render `TeamViewContent` only when `isManager && scope === 'team'`
- [x] Confirm hero card, `EarningsPaceCard`, `ApprovalUrgencyCard`, and insight chips stay outside the scope branch

### FR3: Present team members and resilient team-view states
- [x] Add `TeamMemberRow` local component: photo or two-letter initials fallback, name, `MGR` badge conditional on `member.isManager`, hours/AI%/BrainLift stats in gold/cyan/violet
- [x] Add muted/dimmed treatment + `Couldn't load` label for `fetchFailed: true` rows (em dashes instead of zero metrics)
- [x] Implement `TeamViewContent`'s state precedence: loading skeletons → `data === null` error card → `breakdown.length === 0` empty message → `reportCount === 0` with non-empty breakdown (failed rows) → normal aggregate + breakdown render
- [x] Log non-null `error` via the existing error-logging convention on every occurrence, independent of the visible-state precedence above
- [x] Use a stable member identifier (`TeamMemberBreakdown.member`) for row keys, never display name or array index

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall (no Org data path, no multi-week team history, no roster-fetch duplication, no new chart primitive)

### Step 1: Comprehensive PR Review
- [x] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents) — `pr-review-toolkit:*` subagents are not available in this environment; adapted via `general-purpose` agents with equivalent review prompts (code-quality, silent-failure-hunter, comment-analyzer) plus Codex CLI as a 6th independent reviewer

### Step 2: Address Feedback
- [x] Fix HIGH severity issues (critical) — privacy leak: raw `.message` string was passed to `log.error` as `errOrClass`, violating the "never log .message" contract; fixed to pass a fixed string
- [x] Fix MEDIUM severity issues (or document why deferred) — manager-disappears-mid-session left blank content; fixed by falling back to personal content when `!isManager`
- [x] Fix LOW severity issues — fetchFailed rows now show both em-dashes and "Couldn't load" per spec; photoUrl-failure state now tracks the failed URL instead of a stale boolean; `useIsManager.ts` JSDoc corrected
- [x] Re-run tests after fixes
- [x] Commit fixes: `fix(04-team-view-content): {description}` (commit `cd07fb5`)

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Apply suggested improvements that strengthen confidence — converted source-regex/logic-reimplementation tests in `overview.test.tsx`, `approvals.test.tsx`, and `useIsManager.test.ts` to real render/real hook execution
- [x] Re-run tests to confirm passing
- [x] Commit if changes made: `fix(04-team-view-content): strengthen test assertions` (commit `b6900fe`)

### Final Verification
- [x] All tests passing (`app/(tabs)/__tests__/overview.test.tsx`, `app/(tabs)/__tests__/approvals.test.tsx` or equivalent, `app/(tabs)/index.tsx` tests, new `useIsManager` test file) — 259/259 passing; full suite otherwise green except the pre-existing unrelated `NativeWindSmoke.test.tsx` failure
- [x] TypeScript check passes with no new errors — only pre-existing repo-wide `fs`/`path`/`__dirname` type-declaration gaps (unrelated to this spec) appear
- [x] No regressions in existing `overview.tsx`/`approvals.tsx`/`index.tsx` tests after the `useIsManager()` extraction
- [x] Code follows existing hook/screen layering conventions (`docs/ARCHITECTURE.md` §6.6)

---

## Session Notes

<!-- Add notes as you work -->

**2026-07-28**: Spec + checklist generated via `spec` skill (Codex-drafted sections; Technical Design draft required the narrow-file-allowlist pattern and a 240s timeout, consistent with Specs 02/03's prior Technical Design timeouts; coherence check required 3 fix iterations — naming mismatch, empty-vs-all-failed precedence, loading precedence, Org enabled/disabled wording, and hook-error-with-cached-data behavior — before reaching PASS).
