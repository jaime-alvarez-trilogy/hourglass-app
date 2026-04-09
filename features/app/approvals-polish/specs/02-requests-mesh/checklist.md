# Checklist: 02-requests-mesh

## Phase 2.0 — Tests (Red Phase)

Write tests for all FRs. Tests must fail before implementation (red phase confirmed).

### FR1: AnimatedMeshBackground renders on Requests screen

- [x] SC1.1 — Source check: `approvals.tsx` imports `AnimatedMeshBackground`
- [x] SC1.2 — Source check: `<AnimatedMeshBackground panelState={meshPanelState} />` appears as first child of root View
- [x] SC1.3 — Runtime: `ApprovalsScreen` renders without throw (contributor, no items)
- [x] SC1.3 — Runtime: `ApprovalsScreen` renders without throw (manager, with items)
- [x] SC1.4 — Source check: root View `className` does NOT contain `bg-background`

### FR2: meshPanelState derives correctly

- [x] SC2.1 — Source check: `meshPanelState` variable with `PanelState | null` type is present
- [x] SC2.2 — Runtime: when `isManager=true` and `items.length > 0`, mesh receives `panelState='critical'`
- [x] SC2.3 — Runtime: when `isManager=true` and `items.length === 0`, mesh receives `panelState=null`
- [x] SC2.4 — Runtime: when `isManager=false` and `items.length > 0`, mesh receives `panelState=null`
- [x] SC2.5 — Runtime: when `isManager=false` and `items.length === 0`, mesh receives `panelState=null`

### FR3: bg-background removed from root View

- [x] SC3.1 — Source check: string `bg-background` absent from root View className
- [x] SC3.2 — Source check: string `flex-1` present in root View className
- [x] SC3.3 — Runtime: header text ("Requests"), MY REQUESTS section still render (content over mesh)

---

## Phase 2.1 — Implementation (Green Phase)

Implement minimum code to pass all tests.

### FR1: Add AnimatedMeshBackground

- [x] Add `import AnimatedMeshBackground from '@/src/components/AnimatedMeshBackground'` to `approvals.tsx`
- [x] Add `<AnimatedMeshBackground panelState={meshPanelState} />` as first child of root `<View className="flex-1">`

### FR2: Compute meshPanelState

- [x] Add `const meshPanelState: PanelState | null = isManager && items.length > 0 ? 'critical' : null` before `return` statement
- [x] Import `PanelState` type (from `@/src/lib/panelState` or via existing imports)

### FR3: Remove bg-background

- [x] Change root View `className` from `"flex-1 bg-background"` to `"flex-1"`

### Verification

- [x] Run `app/(tabs)/__tests__/approvals-mesh.test.tsx` — all 31 new tests pass
- [x] Run full approvals test suite — no regressions (120 passed, 0 failed)

---

## Phase 2.2 — Review

- [x] spec-implementation-alignment: all FR success criteria verified — PASS
- [x] pr-review-toolkit: review-pr passes (6-area manual review — no issues)
- [x] Address feedback: fixed stale `bg-background` assertion in `__tests__/approvals-screen.test.tsx`
- [x] test-optimiser: test quality review — no changes needed

---

## Session Notes

**2026-03-24**: Implementation complete.
- Phase 2.0: 1 test commit — `test(FR1-FR3)`: 31 tests across FR1/FR2/FR3
- Phase 2.1: 1 implementation commit — `feat(FR1-FR3)`: 3 surgical changes to approvals.tsx
- Phase 2.2: 1 fix commit — updated stale `bg-background` assertion from 05-manager-approvals spec
- All 31 new tests passing; 120 total approvals tests passing (no regressions)
