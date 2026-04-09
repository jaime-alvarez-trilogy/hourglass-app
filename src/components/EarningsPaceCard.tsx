// EarningsPaceCard.tsx — 02-earnings-pace-projection FR2–FR6
//
// Shows EWMA-smoothed annual earnings projection vs target, with a pace bar.
//
// Design system: BRAND_GUIDELINES.md
//   - Card with borderAccentColor={colors.gold} (earnings context, §1.4)
//   - Section label "EARNINGS PACE" in textSecondary
//   - Annual projection in gold (large), target in textMuted
//   - Pace bar: gold track fill, border track, capped at 100%
//   - Bar color: gold ≥90%, warning 60–89%, critical <60%
//   - Footer: "Avg $X/wk · {window}W EWMA" in textMuted
//   - Returns null when computeAnnualProjection returns 0

import React from 'react';
import { View, Text } from 'react-native';
import Card from './Card';
import SectionLabel from './SectionLabel';
import { colors } from '@/src/lib/colors';
import { computeAnnualProjection } from '@/src/lib/overviewUtils';

// ─── Props ────────────────────────────────────────────────────────────────────

interface EarningsPaceCardProps {
  /** Weekly earnings array ordered oldest→newest. Last entry = current partial week. */
  earnings: number[];
  /** Target weekly earnings: hourlyRate * weeklyLimit */
  targetWeeklyEarnings: number;
  /** EWMA window displayed in footer */
  window: 4 | 12 | 24;
}

// ─── Bar color helper ─────────────────────────────────────────────────────────

function getPaceBarColor(paceRatio: number): string {
  if (paceRatio >= 0.9) return colors.gold;
  if (paceRatio >= 0.6) return colors.warning;
  return colors.critical;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EarningsPaceCard({
  earnings,
  targetWeeklyEarnings,
  window,
}: EarningsPaceCardProps): JSX.Element | null {
  const annualProjection = computeAnnualProjection(earnings);

  // FR5 / FR6: Hidden entirely when no sufficient data
  if (annualProjection === 0) return null;

  // Derive ewma weekly from annualProjection
  const ewmaWeekly = annualProjection / 52;

  // Pace ratio: how close the current pace is to the weekly target
  // Capped at 1 for display (can't exceed 100% bar fill)
  const paceRatio = targetWeeklyEarnings > 0
    ? Math.min(ewmaWeekly / targetWeeklyEarnings, 1)
    : 1;

  const barColor = getPaceBarColor(paceRatio);

  // Annualized target for the "/ yr target" row
  const annualTarget = targetWeeklyEarnings * 52;

  return (
    <Card borderAccentColor={colors.gold}>
      <SectionLabel className="mb-3">EARNINGS PACE</SectionLabel>

      {/* Annual projection row */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <Text
          style={{
            color: colors.gold,
            fontSize: 26,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
            letterSpacing: -0.5,
          }}
        >
          {`$${Math.round(annualProjection).toLocaleString()}`}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>/ yr projected</Text>
      </View>

      {/* Target row */}
      {annualTarget > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 14,
              fontVariant: ['tabular-nums'],
            }}
          >
            {`$${Math.round(annualTarget).toLocaleString()}`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>/ yr target</Text>
        </View>
      )}

      {/* Pace bar */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.border,
          marginBottom: 10,
          overflow: 'hidden',
        }}
      >
        <View
          testID="pace-bar-fill"
          style={{
            height: '100%',
            borderRadius: 3,
            backgroundColor: barColor,
            width: `${paceRatio * 100}%`,
          }}
        />
      </View>

      {/* Footer: Avg $X/wk · {window}W EWMA */}
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {`Avg $${Math.round(ewmaWeekly).toLocaleString()}/wk · ${window}W EWMA`}
      </Text>
    </Card>
  );
}
