// OverviewHeroCard.tsx — 03-overview-hero FR1 + FR2
//
// Hero card for the Overview tab. Displays period totals (earnings + hours) with
// an embedded 4W/12W window toggle and an optional current-week overtime badge.
//
// Design system: FEATURE.md "Hero Glass System — Overview hero"
//   Layer 2: Hero Card — uses Card(elevated) as glass base
//   Internal layout: period label + toggle row / dual-metric row (side by side)
//   Earnings: gold (#E8C97A), 28sp bold
//   Hours: textPrimary (#FFFFFF), 28sp bold
//   OT badge: overtimeWhiteGold (#FFF8E7), 13sp — only when overtimeHours > 0
//
// Architecture:
//   - Pure presentational component — no hooks, no data fetching
//   - No StyleSheet.create — inline styles consistent with project convention

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Card from './Card';
import SectionLabel from './SectionLabel';
import { colors } from '@/src/lib/colors';

// ─── Props ────────────────────────────────────────────────────────────────────

interface OverviewHeroCardProps {
  /** Sum of earnings[] for the selected window */
  totalEarnings: number;
  /** Sum of paidHours (Payment hours column) for the selected window */
  totalHours: number;
  /** Sum of actualOvertime (Actual Overtime column) for the selected window */
  overtimeHours: number;
  /** Selected time window */
  window: 4 | 12 | 24;
  /** Called when user taps a window toggle button */
  onWindowChange: (w: 4 | 12 | 24) => void;
  /** 0–100 — % of completed weeks in window where hours target was met */
  hoursHitRate?: number;
}

// ─── Toggle pill style constants (stable references — no recreation per render) ─

const ACTIVE_PILL = {
  backgroundColor: colors.surface,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 4,
} as const;

const INACTIVE_PILL = {
  paddingHorizontal: 12,
  paddingVertical: 4,
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function OverviewHeroCard({
  totalEarnings,
  totalHours,
  overtimeHours,
  window,
  onWindowChange,
  hoursHitRate,
}: OverviewHeroCardProps): JSX.Element {
  const periodLabel = window === 4 ? 'LAST 4 WEEKS' : window === 12 ? 'LAST 12 WEEKS' : 'LAST 24 WEEKS';

  return (
    <Card elevated>
      {/* Header row: period label + 4W/12W toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <SectionLabel className="flex-1">{periodLabel}</SectionLabel>

        {/* 4W/12W segmented toggle */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.border,
          borderRadius: 10,
          padding: 2,
        }}>
          {([4, 12, 24] as const).map(w => (
            <TouchableOpacity
              key={w}
              onPress={() => onWindowChange(w)}
              style={window === w ? ACTIVE_PILL : INACTIVE_PILL}
              activeOpacity={0.7}
            >
              <Text style={{
                color: window === w ? colors.violet : colors.textMuted,
                fontWeight: window === w ? '600' : '400',
                fontSize: 13,
              }}>
                {w}W
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Metrics row: 3 columns — Earnings | Paid Hours | Actual OT */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {/* Earnings */}
        <View>
          <Text style={{
            color: colors.gold,
            fontSize: 24,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}>
            {`$${Math.round(totalEarnings).toLocaleString()}`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
            Earnings
          </Text>
        </View>

        {/* Paid Hours */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{
            color: colors.textPrimary,
            fontSize: 24,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}>
            {`${totalHours % 1 === 0 ? Math.round(totalHours) : totalHours.toFixed(1)}h`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
            Paid Hours
          </Text>
        </View>

        {/* Actual OT */}
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{
            color: overtimeHours > 0 ? colors.overtimeWhiteGold : colors.textMuted,
            fontSize: 24,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}>
            {`${overtimeHours % 1 === 0 ? Math.round(overtimeHours) : overtimeHours.toFixed(1)}h`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
            Actual OT
          </Text>
        </View>
      </View>

      {/* Hit rate row — % of completed weeks where hours target was met */}
      {hoursHitRate !== undefined && hoursHitRate > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
          <View style={{
            height: 4,
            flex: 1,
            backgroundColor: colors.border,
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <View style={{
              height: 4,
              width: `${hoursHitRate}%`,
              backgroundColor: hoursHitRate >= 75 ? colors.success : hoursHitRate >= 50 ? colors.warning : colors.critical,
              borderRadius: 2,
            }} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {hoursHitRate}% target weeks
          </Text>
        </View>
      )}
    </Card>
  );
}
