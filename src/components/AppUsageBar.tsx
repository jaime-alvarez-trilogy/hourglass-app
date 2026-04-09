// AppUsageBar — 12-app-breakdown-ui FR1
// Three-segment static bar: violet (BrainLift) | cyan (AI-only) | grey (non-AI)
//
// Design:
//   - Segments use flex proportions (no animation — static by spec decision)
//   - Inline backgroundColor for each segment (NativeWind className unreliable for
//     per-View color in this codebase; see ProgressBar.tsx comment for rationale)
//   - Violet segment omitted entirely when brainliftSlots=0 (no zero-width View)
//   - All-zero input → single full-width grey segment (empty bar)
//   - aiOnlySlots = Math.max(0, aiSlots - brainliftSlots) — defensive clamp

import React from 'react';
import { View } from 'react-native';
import { colors } from '@/src/lib/colors';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AppUsageBarProps {
  /** Total AI slots (includes brainliftSlots). */
  aiSlots: number;
  /** second_brain slots — strict subset of aiSlots. Shown as violet segment. */
  brainliftSlots: number;
  /** Slots without any AI tag. */
  nonAiSlots: number;
  /** Bar height in pixels. Default: 4 */
  height?: number;
  /** Additional NativeWind classes for the outer container. */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppUsageBar({
  aiSlots,
  brainliftSlots,
  nonAiSlots,
  height = 4,
  className,
}: AppUsageBarProps): JSX.Element {
  // Clamp aiOnly to 0 — brainliftSlots should be a subset of aiSlots, but be defensive
  const aiOnlySlots = Math.max(0, aiSlots - brainliftSlots);
  const total = brainliftSlots + aiOnlySlots + nonAiSlots;

  // All-zero input: render single full-width grey bar
  if (total === 0) {
    return (
      <View
        className={className}
        style={{
          height,
          borderRadius: height / 2,
          overflow: 'hidden',
          flexDirection: 'row',
          backgroundColor: colors.border,
        }}
      />
    );
  }

  return (
    <View
      className={className}
      style={{
        height,
        borderRadius: height / 2,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      {/* Violet segment — BrainLift slots (omitted when 0) */}
      {brainliftSlots > 0 && (
        <View
          style={{
            flex: brainliftSlots,
            backgroundColor: colors.violet,
          }}
        />
      )}

      {/* Cyan segment — AI-only slots (ai_usage but not second_brain) */}
      {aiOnlySlots > 0 && (
        <View
          style={{
            flex: aiOnlySlots,
            backgroundColor: colors.cyan,
          }}
        />
      )}

      {/* Grey segment — non-AI slots */}
      {nonAiSlots > 0 && (
        <View
          style={{
            flex: nonAiSlots,
            backgroundColor: colors.border,
          }}
        />
      )}

      {/* Fallback: if aiOnly=0 and nonAi=0, only brainlift is shown — handled above.
          If brainlift=0 and aiOnly=0, grey fills (total > 0 so nonAiSlots > 0).
          All combinations covered. */}
    </View>
  );
}
