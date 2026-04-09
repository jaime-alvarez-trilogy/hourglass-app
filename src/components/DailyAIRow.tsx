// FR9 (04-ai-brainlift): DailyAIRow — single row in daily AI breakdown list
// FR5 (06-ai-tab): Migrated from StyleSheet.create() to NativeWind className.
// FR3 (08-dark-glass-polish): Row elevation — semi-transparent glass surface with Skia inner shadow.
//   No BackdropFilter (would SIGKILL when nested inside GlassCard's BackdropFilter).
//   Uses: rgba(255,255,255,0.05) bg + 1px rgba(255,255,255,0.10) border + Skia LinearGradient inset.

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  RoundedRect,
  LinearGradient,
  vec,
} from '@shopify/react-native-skia';
import type { DailyTagData } from '../lib/ai';

// ─── Glass row constants (08-dark-glass-polish FR3) ──────────────────────────

const ROW_BG = 'rgba(255,255,255,0.05)';       // subtle surface lift
const ROW_BORDER = 'rgba(255,255,255,0.10)';    // 1px subtle border
const ROW_SHADOW_TOP = 'rgba(0,0,0,0.40)';      // Skia inner shadow top edge
const ROW_RADIUS = 8;

// ─── Props ────────────────────────────────────────────────────────────────────

interface DailyAIRowProps {
  item: DailyTagData;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formats YYYY-MM-DD as "Mon 3/3" style label */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[d.getDay()];
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${dayName} ${month}/${day}`;
}

/** Per-day AI% display: (aiUsage / taggedSlots) * 100, or "—" if no tagged slots */
function formatDayAIPct(item: DailyTagData): string {
  const taggedSlots = item.total - item.noTags;
  if (taggedSlots === 0) return '—';
  const pct = Math.round((item.aiUsage / taggedSlots) * 100);
  return `${pct}%`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyAIRow({ item }: DailyAIRowProps) {
  const dateLabel = formatDateLabel(item.date);
  const aiPct = formatDayAIPct(item);
  const brainliftDisplay = item.secondBrain > 0 ? `${item.secondBrain} slots` : '—';

  // Measure row dimensions for the Canvas inner shadow
  const [dims, setDims] = useState({ w: 0, h: 0 });

  return (
    <View
      onLayout={e => setDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{
        backgroundColor: ROW_BG,
        borderRadius: ROW_RADIUS,
        borderWidth: 1,
        borderColor: ROW_BORDER,
        marginVertical: 2,
        overflow: 'hidden',
      }}
    >
      {/* Skia inner shadow — dark gradient at top edge, fades to transparent by 12px */}
      {/* Gated on dims.w > 0 to avoid zero-size Canvas on first render               */}
      {dims.w > 0 && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <RoundedRect x={0} y={0} width={dims.w} height={dims.h} r={ROW_RADIUS}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, 12)}
              colors={[ROW_SHADOW_TOP, 'transparent']}
            />
          </RoundedRect>
        </Canvas>
      )}

      {/* Row content */}
      <View
        className={`flex-row items-center py-2.5 px-4${item.isToday ? ' bg-surface' : ''}`}
      >
        <Text
          className={`flex-1 text-sm font-mono${item.isToday ? ' text-success' : ' text-textPrimary'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {dateLabel}
          {item.isToday ? ' (today)' : ''}
        </Text>
        <Text className="w-[70px] text-right text-sm font-mono text-textSecondary" style={{ fontVariant: ['tabular-nums'] }}>
          {aiPct}
        </Text>
        <Text className="w-[70px] text-right text-sm font-mono text-textSecondary" style={{ fontVariant: ['tabular-nums'] }}>
          {brainliftDisplay}
        </Text>
      </View>
    </View>
  );
}
