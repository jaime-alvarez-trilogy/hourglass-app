# Approval Urgency Signals

## Goal

Surface pending team approvals as unmissable environmental urgency across the entire app —
not just a small badge on the tab bar. Three layers of signal, escalating toward end of week:

1. **Action Required card** — full-width Liquid Glass card at the top of Home + Overview
   when pending > 0. Breathing scale animation (Reanimated 4 CSS keyframes) + pulsing
   coral border ring. "Review Now" CTA navigates to Requests tab.

2. **Time-aware ambient mesh** — Home and Overview mesh Node C shifts based on pending count
   AND how close we are to end-of-week: amber (behind) Mon-Wed, coral (critical) Thu-Sun.
   Reverts to earningsPace signal when queue is clear.

3. **Ambient floor glow through tab bar** — A 4th Skia RadialGradient node in
   AnimatedMeshBackground, statically positioned at the Requests tab location (bottom-right
   of screen), with pulsing radius. Because NativeTabs uses UIGlassEffect (iOS 26), the
   frosted glass tab bar refracts this glow node, making the Requests tab itself appear to
   glow coral/amber when approvals are pending.

## Specs

| Spec | Description | Blocks | Blocked By | Complexity |
|------|-------------|--------|------------|------------|
| 01-approval-urgency-card | ApprovalUrgencyCard component + Home/Overview insertion | 02 | — | M |
| 02-mesh-urgency-signal | Time-aware mesh signal + 4th floor-glow node for tab bar | — | 01 | M |

Spec 02 is blocked by 01 because both touch `app/(tabs)/index.tsx` and
`app/(tabs)/overview.tsx`. Sequential execution avoids merge conflicts.

## Context

- Tab bar currently shows a static badge with approval count (already working)
- Neither Home nor Overview screens currently show any pending approval awareness
- `useApprovalItems()` is already called in `_layout.tsx` for the tab badge — adding it
  to Home/Overview is safe (TanStack Query deduplicates the fetch)
- `ENABLE_NATIVE_TABS: true` in app.json — NativeTabs uses UIGlassEffect on iOS 26
- AnimatedMeshBackground already has 3 orbital nodes (violet A, cyan B, status C)
- Week boundary: Mon-Sun UTC (Crossover standard)

## Files Touched

### 01-approval-urgency-card
- `src/components/ApprovalUrgencyCard.tsx` — new component
- `app/(tabs)/index.tsx` — useApprovalItems + card insertion
- `app/(tabs)/overview.tsx` — useApprovalItems + card insertion

### 02-mesh-urgency-signal
- `src/lib/approvalMeshSignal.ts` — new: getApprovalMeshState() helper
- `src/components/AnimatedMeshBackground.tsx` — new pendingApprovals prop + 4th floor node
- `app/(tabs)/index.tsx` — pass approvalMeshState to mesh
- `app/(tabs)/overview.tsx` — pass approvalMeshState to mesh

## Changelog

### 01-approval-urgency-card
- **Status**: Complete (2026-03-24)
- **Spec**: [spec.md](specs/01-approval-urgency-card/spec.md)
- **Checklist**: [checklist.md](specs/01-approval-urgency-card/checklist.md)
- **Commits**: test(FR1-FR5), feat(FR1-FR5), docs(01-approval-urgency-card)
- **Tests**: 35 passing (ApprovalUrgencyCard + ScreenIntegration suites)

### 02-mesh-urgency-signal
- **Status**: Complete (2026-03-24)
- **Spec**: [spec.md](specs/02-mesh-urgency-signal/spec.md)
- **Checklist**: [checklist.md](specs/02-mesh-urgency-signal/checklist.md)
- **Commits**: test(FR1-FR5) 02536b4, feat(FR1-FR5) 3ae5501, fix 0ab72be
- **Tests**: 49 passing (approvalMeshSignal + MeshUrgencySignal suites)
