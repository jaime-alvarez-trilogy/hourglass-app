// DayByDayStrip.tsx — 1.2 WorkSmart dashboard parity: the per-day row under the THIS WEEK
// chart, after WorkSmart's "This week, day by day" grid. Replaces the plain Mon..Sun labels.
//
// Seven flex-1 columns, one per WeeklyBarChart bar (the chart has no horizontal padding, so
// equal columns sit under the bars). Each column: day label, billable value, then the
// approved-manual line (violet) and the pending line (muted violet, "+"), each only when > 0.
// Future days show "–".
//
// Values use formatMinutes ("8h 40m", "40m", "8h"), single line. A column is ~46pt on a
// 393pt phone (43pt at 375pt); "8h 40m" is ~41pt in Inter 11pt, so the common case fits
// unscaled and the rare 10h+ day ("10h 40m", ~48pt) shrinks to fit instead of wrapping —
// a second line would push the row out of alignment with its neighbours. Words like
// "manual"/"pending" don't fit beside a value at this width, so the lines carry color
// (matching the chart's segments) and the optional legend names them; VoiceOver reads
// full words from each column's accessibilityLabel.
//
// Design system: BRAND_GUIDELINES.md — violet = manual / deep work, success = tracked
// hours; NativeWind className tokens only, no raw hex.

import React from 'react';
import { View, Text } from 'react-native';
import { formatMinutes } from '@/src/lib/hoursOverview';
import type { DailyHours } from './WeeklyBarChart';

export interface DayByDayStripProps {
  /** The same 7 items (Mon → Sun) passed to WeeklyBarChart */
  days: DailyHours[];
  /** Show the Tracked · Manual · Pending key — rendered only when a day has manual or pending time */
  showLegend?: boolean;
  testID?: string;
}

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** Whole minutes from optional hours; absent, negative and NaN read as 0 */
function minutesOf(hours: number | undefined): number {
  return hours !== undefined && hours > 0 ? Math.round(hours * 60) : 0;
}

function spokenDuration(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (r > 0 || h === 0) parts.push(`${r} ${r === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

function columnLabel(d: DailyHours, manual: number, pending: number): string {
  const today = d.isToday ? ', today' : '';
  if (d.isFuture) return `${d.day}${today}, upcoming`;
  const parts = [`${d.day}${today}`, spokenDuration(minutesOf(d.hours))];
  if (manual > 0) parts.push(`${spokenDuration(manual)} manual`);
  if (pending > 0) parts.push(`${spokenDuration(pending)} pending approval`);
  return parts.join(', ');
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View className={`w-2 h-2 rounded-full ${swatch}`} />
      <Text className="text-[11px] font-sans text-textMuted">{label}</Text>
    </View>
  );
}

export default function DayByDayStrip({
  days,
  showLegend = false,
  testID = 'day-by-day-strip',
}: DayByDayStripProps) {
  const hasManualOrPending = days.some(
    (d) => !d.isFuture && (minutesOf(d.manualHours) > 0 || minutesOf(d.pendingHours) > 0),
  );

  return (
    <View className="mt-2" testID={testID}>
      <View className="flex-row">
        {days.map((d, i) => {
          const manual = d.isFuture ? 0 : minutesOf(d.manualHours);
          const pending = d.isFuture ? 0 : minutesOf(d.pendingHours);
          return (
            <View
              key={i}
              className="flex-1 items-center"
              testID={`${testID}-col-${i}`}
              accessible
              accessibilityLabel={columnLabel(d, manual, pending)}
            >
              <Text
                className={`text-xs ${d.isToday ? 'font-sans-semibold text-textPrimary' : 'font-sans text-textMuted'}`}
                testID={`${testID}-day-${i}`}
              >
                {d.day}
              </Text>
              <Text
                className={`mt-1 text-[11px] font-sans ${
                  d.isFuture ? 'text-textMuted' : d.isToday ? 'text-textPrimary' : 'text-textSecondary'
                }`}
                style={TABULAR}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                testID={`${testID}-value-${i}`}
              >
                {d.isFuture ? '–' : formatMinutes(minutesOf(d.hours))}
              </Text>
              {manual > 0 && (
                <Text
                  className="text-[10px] font-sans text-violet"
                  style={TABULAR}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  testID={`${testID}-manual-${i}`}
                >
                  {formatMinutes(manual)}
                </Text>
              )}
              {pending > 0 && (
                <Text
                  className="text-[10px] font-sans text-violet/60"
                  style={TABULAR}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  testID={`${testID}-pending-${i}`}
                >
                  {`+${formatMinutes(pending)}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {showLegend && hasManualOrPending && (
        <View className="flex-row justify-center items-center gap-4 mt-3" testID={`${testID}-legend`}>
          <LegendItem swatch="bg-success" label="Tracked" />
          <LegendItem swatch="bg-violet" label="Manual" />
          <LegendItem swatch="bg-violet/20 border border-violet" label="Pending" />
        </View>
      )}
    </View>
  );
}
