// Card.tsx
// FR1 (02-dark-glass): Card glass layer — base variant
// FR2 (02-dark-glass): Card glass layer — elevated variant
// FR3 (02-dark-glass): glass={false} opt-out for flat legacy render
// FR1 (03-glass-surfaces): delegates glass=true to GlassCard (Skia BackdropFilter)
//
// Design system: BRAND_GUIDELINES.md "Surface & Depth — Dark Glass System"
//   backdrop-filter: blur(16px), background: hsla(248,15%,10%,0.75)
//   gradient border: violetAccent → transparent 45°
//
// Architecture (03-glass-surfaces):
//   glass=true  → delegates to GlassCard (BackdropFilter blur + gradient border + InnerShadow)
//   glass=false → flat legacy View with NativeWind surface classes
//
// GLASS_BASE/GLASS_ELEVATED exported for test compatibility and flat fallback colors.

import React from 'react';
import { View, ViewStyle } from 'react-native';
import GlassCard from './GlassCard';

// ─── Glass style constants (exported for test access) ─────────────────────────
//
// BlurView removed from Card — each BlurView allocates a UIVisualEffectView
// framebuffer at mount time. With 3–5 Cards per tab mounting simultaneously
// alongside Reanimated spring animations, the concurrent GPU + worklet allocation
// causes throwPendingError crashes (SIGKILL, no .ips report).
//
// Cards now use a flat semi-opaque dark surface. The visual is nearly identical
// since the background is already dark (#0A0A0F). PanelGradient and AIArcHero
// retain their single BlurViews (stable, pre-mounted before any tab navigation).

export const GLASS_BASE = {
  backgroundColor: 'rgba(22, 21, 31, 0.85)',    // surface (#16151F) at 85% opacity — opaque glass look
  borderColor: 'rgba(255, 255, 255, 0.10)',
  borderWidth: 1,
} as const;

export const GLASS_ELEVATED = {
  backgroundColor: 'rgba(31, 30, 41, 0.92)',    // surfaceElevated (#1F1E29) at 92% opacity
  borderColor: 'rgba(255, 255, 255, 0.10)',
  borderWidth: 1,
} as const;

// Kept for test compatibility — no longer drives BlurView intensity
export const BLUR_INTENSITY_BASE = 60;
export const BLUR_INTENSITY_ELEVATED = 80;

// ─── Layout constants ──────────────────────────────────────────────────────────

const OUTER_STYLE: ViewStyle = {
  overflow: 'hidden',
  borderRadius: 16,
};

const INNER_STYLE: ViewStyle = {
  padding: 20,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface CardProps {
  /** Use elevated glass (intensity 60, brighter bg) — for modals, active cards */
  elevated?: boolean;
  /**
   * Glass mode (default: true).
   * Set false for surfaces that already have blur context (e.g. modal overlays).
   * glass={false} renders the legacy flat opaque card.
   */
  glass?: boolean;
  /**
   * Gradient border accent color (default: violet #A78BFA).
   * Pass semantic context colors: colors.gold for earnings, colors.cyan for AI,
   * panel state color for status-bearing cards. Brand §1.4.
   */
  borderAccentColor?: string;
  /** Additional NativeWind classes appended to outer wrapper */
  className?: string;
  /** Pass-through style to outer wrapper (merged after glass styles) */
  style?: ViewStyle;
  /** Pass-through testID to outer wrapper for test selection */
  testID?: string;
  children: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Card({
  elevated,
  glass = true,
  borderAccentColor,
  className,
  style,
  testID,
  children,
}: CardProps): JSX.Element {
  // ── glass={false}: flat legacy render ───────────────────────────────────────
  if (!glass) {
    const flatBase = elevated
      ? 'bg-surfaceElevated rounded-2xl border border-border p-5'
      : 'bg-surface rounded-2xl border border-border p-5';
    const flatCombined = className ? `${flatBase} ${className}` : flatBase;
    return (
      <View className={flatCombined} style={style} testID={testID}>
        {children}
      </View>
    );
  }

  // ── glass=true (default): delegate to GlassCard (Skia BackdropFilter) ────────
  // GlassCard provides genuine glass blur via Skia BackdropFilter — no UIVisualEffectView.
  return (
    <GlassCard
      elevated={elevated}
      borderAccentColor={borderAccentColor}
      className={className}
      style={style}
      testID={testID}
    >
      {children}
    </GlassCard>
  );
}
