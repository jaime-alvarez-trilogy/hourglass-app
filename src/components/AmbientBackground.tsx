// AmbientBackground.tsx
// FR1 (01-ambient-layer): full-screen SVG radial gradient ambient layer
// FR2 (01-ambient-layer): AMBIENT_COLORS constant + getAmbientColor() pure function
// FR5 (01-ambient-layer): Reanimated color transition (fade-through-opacity pattern)
//
// @deprecated (02-animated-mesh): Default export delegates to AnimatedMeshBackground.
//   The named exports (AMBIENT_COLORS, getAmbientColor, AmbientSignal) are preserved
//   for backward compatibility — screens that call getAmbientColor() directly continue
//   to work without changes. Only the visual rendering has changed (animated mesh vs SVG).
//
// Design system: FEATURE.md "Hero Glass System — The Three-Layer Stack"
//   Layer 1 = AmbientBackground / AnimatedMeshBackground (absolute, full-screen, behind all content)
//
// Architecture:
//   - Default export: AnimatedMeshBackground (re-exported for zero import-site changes)
//   - Named exports: AMBIENT_COLORS, getAmbientColor, AmbientSignal (preserved)
//   - No StyleSheet.create — inline styles consistent with project convention
//   - StyleSheet.absoluteFill is a read-only constant (not StyleSheet.create)

import React from 'react';
import { colors } from '@/src/lib/colors';
import type { PanelState } from '@/src/lib/panelState';
import AnimatedMeshBackgroundComponent from '@/src/components/AnimatedMeshBackground';

// ─── FR2: AMBIENT_COLORS — exported for tests ─────────────────────────────────
//
// Maps each signal type to its ambient hex color.
// panelState mapping is identical to PanelGradient.colorMap — same signal, wider field.
// idle = null (no ambient — flat background only).

export const AMBIENT_COLORS = {
  // panelState — Record<PanelState, string | null>
  panelState: {
    onTrack:   colors.success,           // #10B981 — green
    behind:    colors.warning,           // #F59E0B — amber
    critical:  colors.critical,          // #F43F5E — rose
    crushedIt:   colors.gold,              // #E8C97A — gold
    aheadOfPace: colors.gold,              // #E8C97A — gold, same family as crushedIt
    overtime:    colors.overtimeWhiteGold, // #FFF8E7 — warm white-gold
    idle:        null,                     // no ambient in idle state
  } as Record<PanelState, string | null>,

  // earningsPace — Overview tab signal (earnings pace vs prior period avg)
  earningsPaceStrong:   colors.gold,     // ratio ≥ 0.85 — strong pace
  earningsPaceBehind:   colors.warning,  // 0.60 ≤ ratio < 0.85 — behind pace
  earningsPaceCritical: colors.critical, // ratio < 0.60 — critical behind

  // aiPct — AI tab signal (AI usage % vs 75% target)
  aiAtTarget:    colors.violet,  // pct ≥ 75 — at or above target
  aiApproaching: colors.cyan,    // 60 ≤ pct < 75 — approaching target
  aiBelow:       colors.warning, // pct < 60 — below target
} as const;

// ─── FR2: AmbientSignal — typed signal union ──────────────────────────────────
//
// Screens pass a typed signal; getAmbientColor() resolves to a hex color.
// This keeps AmbientBackground dumb — screens compute the signal, not the color logic.

export type AmbientSignal =
  | { type: 'panelState'; state: PanelState }
  | { type: 'earningsPace'; ratio: number }  // ratio = currentPeriod / avg(priorPeriods)
  | { type: 'aiPct'; pct: number };

// ─── FR2: getAmbientColor — pure function ─────────────────────────────────────
//
// Maps a typed signal to hex color or null (idle).
// Pure: no side effects, deterministic, no imports of external state.
//
// earningsPace boundary rules:
//   ratio = 0 (no prior data) → gold (assume strong — no comparison to make)
//   ratio ≥ 0.85              → gold (strong pace)
//   0.60 ≤ ratio < 0.85       → warning (behind but recoverable)
//   ratio < 0.60              → critical (severe deficit)
//
// aiPct boundary rules:
//   pct ≥ 75  → violet (at or above 75% target)
//   60 ≤ pct < 75  → cyan (approaching target)
//   pct < 60  → warning (below target)

export function getAmbientColor(signal: AmbientSignal): string | null {
  switch (signal.type) {
    case 'panelState':
      return AMBIENT_COLORS.panelState[signal.state];

    case 'earningsPace': {
      const { ratio } = signal;
      // ratio=0 means no prior period data — treat as strong (gold, not critical)
      if (ratio === 0) return AMBIENT_COLORS.earningsPaceStrong;
      if (ratio >= 0.85) return AMBIENT_COLORS.earningsPaceStrong;
      if (ratio >= 0.60) return AMBIENT_COLORS.earningsPaceBehind;
      return AMBIENT_COLORS.earningsPaceCritical;
    }

    case 'aiPct': {
      const { pct } = signal;
      if (pct >= 75) return AMBIENT_COLORS.aiAtTarget;
      if (pct >= 60) return AMBIENT_COLORS.aiApproaching;
      return AMBIENT_COLORS.aiBelow;
    }
  }
}

// ─── FR1: AmbientBackground props ────────────────────────────────────────────

interface AmbientBackgroundProps {
  /** Hex color for the ambient halo — null = idle state (renders nothing) */
  color: string | null;
  /**
   * Gradient opacity multiplier (0–1), default 1.0.
   * Final center stop opacity = 0.08 × intensity.
   * Use to dim the ambient layer for screens with brighter hero cards.
   * @deprecated Not used by AnimatedMeshBackground — provided for API compatibility only.
   */
  intensity?: number;
}

// ─── FR1 + FR5: AmbientBackground component ──────────────────────────────────
//
// @deprecated Use AnimatedMeshBackground directly for new code.
// This wrapper accepts the old { color, intensity } interface and delegates to
// AnimatedMeshBackground. The `color` and `intensity` props are intentionally ignored
// since AnimatedMeshBackground drives its own orbital color animation — the screens
// that use this wrapper should migrate to passing panelState/earningsPace/aiPct props
// directly to AnimatedMeshBackground in a future cleanup.

export default function AmbientBackground({ color: _color, intensity: _intensity }: AmbientBackgroundProps): React.JSX.Element {
  // Delegate to AnimatedMeshBackground — no props needed as the animated mesh
  // always renders with its own color nodes. Node C will be idle (#0D0C14) since
  // no panelState signal is passed, but the violet + cyan orbital nodes remain active.
  return React.createElement(AnimatedMeshBackgroundComponent, {});
}
