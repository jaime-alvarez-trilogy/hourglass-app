# Implementation Checklist

Spec: `02-mesh-urgency-signal`
Feature: `approval-urgency`

---

## Phase X.0: Test Foundation

### FR1: getApprovalMeshState pure function
- [x] Test: `getApprovalMeshState(0)` → null (any day)
- [x] Test: `getApprovalMeshState(1, monday)` → 'behind'
- [x] Test: `getApprovalMeshState(1, tuesday)` → 'behind'
- [x] Test: `getApprovalMeshState(1, wednesday)` → 'behind'
- [x] Test: `getApprovalMeshState(1, thursday)` → 'critical'
- [x] Test: `getApprovalMeshState(1, friday)` → 'critical'
- [x] Test: `getApprovalMeshState(1, saturday)` → 'critical'
- [x] Test: `getApprovalMeshState(1, sunday)` → 'critical'
- [x] Test: `getApprovalMeshState(5, friday)` → 'critical' (count > 1)
- [x] Test: `getApprovalMeshState(0, thursday)` → null (zero count overrides day)

### FR2: Home screen mesh wiring
- [x] Test (source): imports `getApprovalMeshState` from `@/src/lib/approvalMeshSignal`
- [x] Test (source): derives `approvalMeshState` from `getApprovalMeshState(approvalItems.length)`
- [x] Test (source): `AnimatedMeshBackground` receives `panelState`, `earningsPace` (conditional), `pendingApprovals`
- [x] Test (source): `earningsPace` suppressed when `approvalMeshState !== null`
- [x] Test (source): `useApprovalItems` not called a second time (spec 01 already added)

### FR3: Overview screen mesh wiring
- [x] Test (source): imports `getApprovalMeshState` from `@/src/lib/approvalMeshSignal`
- [x] Test (source): derives `approvalMeshState` from `getApprovalMeshState(approvalItems.length)`
- [x] Test (source): `AnimatedMeshBackground` receives `panelState`, `earningsPace` (conditional), `pendingApprovals`
- [x] Test (source): `earningsPace` propagated when `approvalMeshState === null`

### FR4: AnimatedMeshBackground floor glow node
- [x] Test (render): floor glow Circle renders when `pendingApprovals > 0`
- [x] Test (render): floor glow Circle does NOT render when `pendingApprovals=0`
- [x] Test (render): floor glow Circle does NOT render when `pendingApprovals=null`
- [x] Test (render): floor glow Circle does NOT render when `pendingApprovals` undefined
- [x] Test (source): `pendingApprovals?: number | null` in `AnimatedMeshBackgroundProps`
- [x] Test (source): `FLOOR_NODE_X_RATIO = 0.875`
- [x] Test (source): `FLOOR_PULSE_DURATION = 2000`
- [x] Test (source): `FLOOR_GLOW_ALPHA = 0.30`
- [x] Test (source): floor pulse uses `withRepeat` with `true` (autoReverse)
- [x] Test (source): floor node position is `cy={h}` (bottom of screen)

### FR5: resolveFloorGlowColor internal helper
- [x] Test (source): Monday (UTC) → contains warnAmber `#FCD34D`
- [x] Test (source): Thursday (UTC) → contains desatCoral `#F87171`
- [x] Test (source): Sunday (UTC) → contains desatCoral `#F87171`
- [x] Test (source): count=0 → null (no color)
- [x] Test (source): function is NOT exported from `AnimatedMeshBackground`

---

## Test Design Validation (MANDATORY)

- [x] Run `red-phase-test-validator` agent
- [x] All FR success criteria have test coverage
- [x] Assertions are specific (not just "exists" or "doesn't throw")
- [x] Mocks return realistic data matching interface contracts
- [x] Fix any issues identified before proceeding

---

## Phase X.1: Implementation

### FR1: getApprovalMeshState pure function
- [x] Create `src/lib/approvalMeshSignal.ts`
- [x] Export `getApprovalMeshState(pendingCount, now?)` with injectable `now`
- [x] Implement: `pendingCount === 0` → `null`
- [x] Implement: Mon-Wed UTC → `'behind'`, Thu-Sun UTC → `'critical'`
- [x] Verify: all FR1 tests pass

### FR2: Home screen mesh wiring
- [x] Add import: `import { getApprovalMeshState } from '@/src/lib/approvalMeshSignal'`
- [x] Add derived value: `const approvalMeshState = getApprovalMeshState(approvalItems.length)`
- [x] Update `AnimatedMeshBackground` call: add `panelState`, conditional `earningsPace`, `pendingApprovals`
- [x] Verify: `useApprovalItems` not duplicated — spec 01 already added it
- [x] Verify: all FR2 tests pass

### FR3: Overview screen mesh wiring
- [x] Add import: `import { getApprovalMeshState } from '@/src/lib/approvalMeshSignal'`
- [x] Add derived value: `const approvalMeshState = getApprovalMeshState(approvalItems.length)`
- [x] Update `AnimatedMeshBackground` call (mirror of index.tsx changes)
- [x] Verify: all FR3 tests pass

### FR4: AnimatedMeshBackground floor glow node
- [x] Add `pendingApprovals?: number | null` to `AnimatedMeshBackgroundProps` interface
- [x] Add internal constants: `FLOOR_NODE_X_RATIO`, `FLOOR_PULSE_MIN`, `FLOOR_PULSE_MAX`, `FLOOR_PULSE_DURATION`, `FLOOR_GLOW_ALPHA`
- [x] Add `floorPulse = useSharedValue(0)` and `useEffect` with `withRepeat(withTiming(1, { duration: 2000 }), -1, true)`
- [x] Add `floorRadius` and `floorCenter` derived values
- [x] Add conditional floor glow Circle JSX after Node C inside Canvas
- [x] Verify: Nodes A, B, C unaffected (no regressions)
- [x] Verify: all FR4 tests pass

### FR5: resolveFloorGlowColor internal helper
- [x] Add `resolveFloorGlowColor(pendingApprovals, now?)` internal function in AnimatedMeshBackground.tsx
- [x] Implement: `pendingApprovals <= 0` or null/undefined → `null`
- [x] Implement: Thu/Fri/Sat/Sun UTC → `colors.desatCoral`; Mon/Tue/Wed UTC → `colors.warnAmber`
- [x] Wire into floor node: `floorHex = resolveFloorGlowColor(pendingApprovals)` → `floorColors`
- [x] Confirm NOT exported (internal only)
- [x] Verify: all FR5 tests pass

### Integration
- [x] Run full test suite: `npx jest --testPathPattern="approvalMeshSignal|MeshUrgencySignal|AnimatedMeshBackground"`
- [x] Confirm all existing `AnimatedMeshBackground` tests still pass

---

## Phase X.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [x] Run `spec-implementation-alignment` agent — PASS
- [x] All FR success criteria verified in code
- [x] Interface contracts match implementation
- [x] No scope creep or shortfall

### Step 1: Comprehensive PR Review
- [x] Manual review (pr-review-toolkit agents not registered in this environment)
- [x] No blocking issues found; floorPulse always-running animation is acceptable

### Step 2: Address Feedback
- [x] No HIGH severity issues
- [x] MEDIUM: test-optimiser flagged loose source-analysis assertions → fixed in 0ab72be

### Step 3: Test Quality Optimization
- [x] Run `test-optimiser` agent on modified tests
- [x] Tightened SC2.3/SC2.4/SC2.5/SC3.3/SC3.4/SC5.4/SC5.5-6 — JSX prop regex, function-scoped color checks
- [x] All 49 tests passing after fixes

### Final Verification
- [x] All tests passing (49/49)
- [x] No regressions in existing AnimatedMeshBackground tests
- [x] Code follows existing patterns (hexToRgba reused, useDerivedValue pattern, etc.)

---

## Session Notes

**2026-03-24**: Phase X.0 committed (red phase) — 49 tests across approvalMeshSignal.test.ts and MeshUrgencySignal.test.tsx.
Phase X.1 complete — all 49 tests green. Implementation spans 4 files:
- src/lib/approvalMeshSignal.ts (new)
- src/components/AnimatedMeshBackground.tsx (floor glow node + pendingApprovals prop)
- app/(tabs)/index.tsx (approvalMeshState derivation + updated mesh call)
- app/(tabs)/overview.tsx (same wiring as index.tsx)
Commit: feat(FR1-FR5) 3ae5501
Phase X.2 complete — alignment PASS, test-optimiser tightened 7 source-analysis assertions.
Fix commit: 0ab72be. All 49 tests passing.
