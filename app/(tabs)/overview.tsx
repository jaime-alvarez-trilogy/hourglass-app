/**
 * Overview tab — synchronized multi-week trend dashboard (07-overview-sync)
 * Updated: 03-overview-hero — hero card + ambient layer wiring
 *
 * Features:
 *   - 4W / 12W toggle — slices all metric arrays to last N weeks (now in OverviewHeroCard)
 *   - Synchronized scrubbing — touching any chart shows cursor on all 4
 *   - Week snapshot panel — slides in during scrub, shows all 4 metrics for selected week
 *   - Real historical data from useWeeklyHistory + live current-week from useHoursData/useAIData
 *   - AmbientBackground: full-screen colored gradient driven by earnings pace signal
 *   - OverviewHeroCard: hero card with period totals (earnings + hours) + overtime badge
 *
 * Architecture:
 *   scrubWeekIndex (number | null) lives here. Any chart's onScrubChange sets it.
 *   All 4 TrendSparkline instances receive externalCursorIndex={scrubWeekIndex}.
 *   AmbientBackground sits absolute inside SafeAreaView, outside ScrollView.
 *   OverviewHeroCard is the first content item; replaces the old standalone toggle row.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useConfig } from '@/src/hooks/useConfig';
import { useOverviewData } from '@/src/hooks/useOverviewData';
import { useFocusKey } from '@/src/hooks/useFocusKey';
import { useEarningsHistory } from '@/src/hooks/useEarningsHistory';
import { colors } from '@/src/lib/colors';
import { springPremium, springBouncy, springSnappy } from '@/src/lib/reanimated-presets';
import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry';
import AmbientBackground, { getAmbientColor } from '@/src/components/AmbientBackground';
import AnimatedMeshBackground from '@/src/components/AnimatedMeshBackground';
import Card from '@/src/components/Card';
import SectionLabel from '@/src/components/SectionLabel';
import TrendSparkline from '@/src/components/TrendSparkline';
import FadeInScreen from '@/src/components/FadeInScreen';
import OverviewHeroCard from '@/src/components/OverviewHeroCard';
import EarningsPaceCard from '@/src/components/EarningsPaceCard';
import { computeEarningsPace, computeStreak, computeTargetHitRate } from '@/src/lib/overviewUtils';
import { computeHoursVariance } from '@/src/lib/hours';
import { setTag } from '@/src/lib/sharedTransitions';
import { ApprovalUrgencyCard } from '@/src/components/ApprovalUrgencyCard';
import { useApprovalItems } from '@/src/hooks/useApprovalItems';
import { getApprovalMeshState } from '@/src/lib/approvalMeshSignal';
import type { ScrubChangeCallback } from '@/src/hooks/useScrubGesture';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a status-aware colour for a weekly hours snapshot value.
 * Gold is reserved for earnings; this uses the status tokens (success/warning/critical).
 *
 * Thresholds (01-color-semantics spec):
 *   >= 85% of weeklyLimit → success (on-track)
 *   60–84%                → warning (behind pace)
 *   < 60%                 → critical (significantly behind)
 *
 * Edge cases:
 *   weeklyLimit === 0 → success (no target configured)
 *   hours > weeklyLimit  → success (overtime counts as on-track)
 */
export function computeSnapshotHoursColor(hours: number, weeklyLimit: number): string {
  if (weeklyLimit === 0) return colors.success;
  const ratio = hours / weeklyLimit;
  if (ratio >= 0.85) return colors.success;
  if (ratio >= 0.60) return colors.warning;
  return colors.critical;
}

// ─── Chart section ────────────────────────────────────────────────────────────

interface ChartSectionProps {
  label: string;
  heroValue: string;
  subtitle?: string;
  /** Inline label appended after subtitle with · separator (03-hours-variance) */
  subtitleRight?: string;
  /** Color for subtitleRight text — defaults to textSecondary when absent */
  subtitleRightColor?: string;
  data: number[];
  color: string;
  /** Semantic border accent color per brand §1.4. Defaults to card default (violet). */
  borderAccentColor?: string;
  maxValue?: number;
  targetValue?: number;
  showGuide?: boolean;
  capLabel?: string;
  weekLabels?: string[];
  /** Consecutive weeks hitting target — shows streak chip when >= 1 */
  streak?: number;
  onScrubChange: ScrubChangeCallback;
  externalCursorIndex: number | null;
  chartKey: string;
}

const CHART_HEIGHT = 96;

function ChartSection({
  label,
  heroValue,
  subtitle,
  subtitleRight,
  subtitleRightColor,
  data,
  color,
  borderAccentColor,
  maxValue,
  targetValue,
  showGuide,
  capLabel,
  weekLabels,
  streak,
  onScrubChange,
  externalCursorIndex,
  chartKey,
}: ChartSectionProps) {
  const [dims, setDims] = useState({ width: 0, height: CHART_HEIGHT });
  const [cardWidth, setCardWidth] = useState(0);

  // Card-level pan: captures horizontal swipes anywhere in the card, not just the chart strip.
  // failOffsetY yields to ScrollView on vertical movement > 10px.
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(5)
    .activeOffsetX([-5, 5])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      if (data.length === 0 || cardWidth === 0) return;
      const idx = Math.max(0, Math.min(Math.round((e.x / cardWidth) * (data.length - 1)), data.length - 1));
      runOnJS(onScrubChange)(idx);
    })
    .onFinalize(() => {
      runOnJS(onScrubChange)(null);
    }),
  [cardWidth, data.length, onScrubChange]);

  return (
    <GestureDetector gesture={gesture}>
      <View onLayout={e => setCardWidth(e.nativeEvent.layout.width)}>
        <Card borderAccentColor={borderAccentColor}>
          <SectionLabel className="mb-2">{label}</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              className="font-display-bold"
              style={{ color, fontSize: 28, fontVariant: ['tabular-nums'], letterSpacing: -0.56 }}
            >
              {heroValue}
            </Text>
            {streak !== undefined && streak >= 1 && (
              <View style={{
                backgroundColor: color + '22',
                borderRadius: 10,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}>
                <Text style={{ color, fontSize: 11, fontWeight: '600' }}>
                  {streak}W ↑
                </Text>
              </View>
            )}
          </View>
          {(subtitle || subtitleRight) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
              {subtitle ? (
                <Text className="text-textSecondary text-xs font-sans">{subtitle}</Text>
              ) : null}
              {subtitleRight ? (
                <Text
                  className="text-xs font-sans"
                  style={{ color: subtitleRightColor ?? colors.textSecondary }}
                >
                  {subtitle ? ' · ' : ''}{subtitleRight}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View
            style={{ height: CHART_HEIGHT }}
            onLayout={e => setDims({ width: e.nativeEvent.layout.width, height: CHART_HEIGHT })}
            className="mt-3"
          >
            <TrendSparkline
              key={chartKey}
              data={data}
              width={dims.width}
              height={dims.height}
              color={color}
              maxValue={maxValue}
              targetValue={targetValue}
              showGuide={showGuide}
              capLabel={capLabel}
              weekLabels={weekLabels}
              onScrubChange={onScrubChange}
              externalCursorIndex={externalCursorIndex}
              gestureDisabled
            />
          </View>
        </Card>
      </View>
    </GestureDetector>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OverviewScreen() {
  const router = useRouter();
  const chartKey = useFocusKey();
  const { config } = useConfig();

  // Approval urgency card (01-approval-urgency-card)
  const { items: approvalItems } = useApprovalItems();
  const isManager = config?.isManager === true || config?.devManagerView === true;
  // Approval mesh signal: amber (behind) Mon-Wed, coral (critical) Thu-Sun UTC.
  // When non-null, overrides earningsPace for Node C and adds floor glow at Requests tab.
  const approvalMeshState = getApprovalMeshState(approvalItems.length);
  // 08-dark-glass-polish: count 4→3 because Hours+AI% share one stagger row
  const { getEntryStyle } = useStaggeredEntry({ count: 3 });

  // Ensure earnings/hours history is populated even if home tab hasn't run yet
  useEarningsHistory(24);

  // ── Time window ────────────────────────────────────────────────────────────
  const [window, setWindow] = useState<4 | 12 | 24>(4);

  // ── Synchronized scrub state ───────────────────────────────────────────────
  const [scrubWeekIndex, setScrubWeekIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastHapticIndex = useRef<number | null>(null);

  const handleScrubChange = useCallback((index: number | null) => {
    setScrubWeekIndex(index);
    // Lock scroll while scrubbing so vertical drift doesn't pan the list
    scrollRef.current?.setNativeProps({ scrollEnabled: index === null });
    // Haptic tick when crossing to a new index
    if (index !== null && index !== lastHapticIndex.current) {
      lastHapticIndex.current = index;
      Haptics.selectionAsync();
    } else if (index === null) {
      lastHapticIndex.current = null;
    }
  }, []);

  // Reset scrub when window changes (avoids stale index)
  const handleWindowChange = (newWindow: 4 | 12 | 24) => {
    setScrubWeekIndex(null);
    setWindow(newWindow);
  };

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: overviewData } = useOverviewData(window);

  const weeklyLimit = config?.weeklyLimit ?? 40;
  const hourlyRate = config?.hourlyRate ?? 0;
  const maxEarnings = hourlyRate * weeklyLimit;

  // ── Hero card props ─────────────────────────────────────────────────────────
  // FR5: period totals for the selected window
  const totalEarnings = overviewData.earnings.reduce((s, v) => s + v, 0);
  const totalHours = overviewData.hours.reduce((s, v) => s + v, 0);
  // FR2: sum of actualOvertime from payments API per week.
  // This is the "Actual Overtime" column — hours worked above the weekly limit,
  // sourced directly from the payments dashboard data (not derived from hours math).
  const overtimeHours = overviewData.overtimeHours.reduce((s, v) => s + v, 0);

  // ── Hours variance (03-hours-variance) ────────────────────────────────────
  const hoursVariance = computeHoursVariance(overviewData.hours);
  const varianceColor = hoursVariance
    ? hoursVariance.isConsistent
      ? colors.success                 // stdDev ≤ 2 → on-track green
      : hoursVariance.stdDev <= 3
        ? colors.warning               // 2 < stdDev ≤ 3 → amber caution
        : colors.textSecondary         // stdDev > 3 → informational grey
    : undefined;

  // ── Streaks & hit rate ─────────────────────────────────────────────────────
  const aiStreak = computeStreak(overviewData.aiPct, 75);
  const brainliftStreak = computeStreak(overviewData.brainliftHours, 5);
  const hoursHitRate = computeTargetHitRate(overviewData.hours, weeklyLimit);

  // ── Ambient color ───────────────────────────────────────────────────────────
  // FR4: earnings pace ratio → ambient signal → color
  const earningsPace = overviewData.earnings.length > 0
    ? computeEarningsPace(overviewData.earnings)
    : null;
  const ambientColor = earningsPace !== null
    ? getAmbientColor({ type: 'earningsPace', ratio: earningsPace })
    : null;

  // ── Snapshot panel animation ───────────────────────────────────────────────
  // Height animates 0 → SNAPSHOT_PANEL_HEIGHT so the panel takes no space at rest —
  // charts sit flush below the hero card and the panel slides in during scrub.
  const SNAPSHOT_PANEL_HEIGHT = 64;
  const panelOpacity = useSharedValue(0);
  const panelTranslateY = useSharedValue(8);
  const panelHeight = useSharedValue(0);
  const panelMarginBottom = useSharedValue(0);

  useEffect(() => {
    if (scrubWeekIndex !== null) {
      panelOpacity.value = withSpring(1, springPremium);
      panelTranslateY.value = withSpring(0, springPremium);
      panelHeight.value = withSpring(SNAPSHOT_PANEL_HEIGHT, springBouncy);
      panelMarginBottom.value = withSpring(4, springBouncy);
    } else {
      panelOpacity.value = withSpring(0, springPremium);
      panelTranslateY.value = withSpring(8, springPremium);
      panelHeight.value = withSpring(0, springSnappy);
      panelMarginBottom.value = withSpring(0, springSnappy);
    }
  }, [scrubWeekIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
    transform: [{ translateY: panelTranslateY.value }],
    height: panelHeight.value,
    marginBottom: panelMarginBottom.value,
    overflow: 'hidden',
  }));

  // ── Hero value helpers ─────────────────────────────────────────────────────
  const lastIdx = overviewData.earnings.length - 1;

  const heroEarnings = scrubWeekIndex !== null
    ? overviewData.earnings[scrubWeekIndex] ?? 0
    : overviewData.earnings[lastIdx] ?? 0;

  const heroHours = scrubWeekIndex !== null
    ? overviewData.hours[scrubWeekIndex] ?? 0
    : overviewData.hours[lastIdx] ?? 0;

  const heroAiPct = scrubWeekIndex !== null
    ? overviewData.aiPct[scrubWeekIndex] ?? 0
    : overviewData.aiPct[lastIdx] ?? 0;

  const heroBrainlift = scrubWeekIndex !== null
    ? overviewData.brainliftHours[scrubWeekIndex] ?? 0
    : overviewData.brainliftHours[lastIdx] ?? 0;

  // Snapshot panel content
  const snapLabel = scrubWeekIndex !== null
    ? `Week of ${overviewData.weekLabels[scrubWeekIndex] ?? ''}`
    : '';

  return (
    <FadeInScreen>
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {/* Layer 1: ambient field — absolute, full-screen, behind all content */}
        {/* 08-dark-glass-polish: direct AnimatedMeshBackground wiring with earningsPace signal */}
        {/* 02-mesh-urgency-signal: approvalMeshState overrides earningsPace when non-null */}
        <AnimatedMeshBackground
          panelState={approvalMeshState}
          earningsPace={approvalMeshState === null ? earningsPace : null}
          pendingApprovals={approvalItems.length}
        />

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 100, gap: 12 }}
        >
          {/* ── Approval urgency card (01-approval-urgency-card) ──────────── */}
          {isManager && approvalItems.length > 0 && (
            <ApprovalUrgencyCard
              pendingCount={approvalItems.length}
              onPress={() => router.push('/(tabs)/approvals')}
            />
          )}

          {/* Hero card — period totals + window toggle (replaces standalone header) */}
          <OverviewHeroCard
            totalEarnings={totalEarnings}
            totalHours={totalHours}
            overtimeHours={overtimeHours}
            window={window}
            onWindowChange={handleWindowChange}
            hoursHitRate={hoursHitRate}
          />

          {/* 02-earnings-pace-projection: EWMA annual projection card */}
          <EarningsPaceCard
            earnings={overviewData.earnings}
            targetWeeklyEarnings={hourlyRate * weeklyLimit}
            window={window}
          />

          {/* Week snapshot panel — always rendered, animated opacity/translateY */}
          <Animated.View
            style={[panelStyle, {
              backgroundColor: colors.surfaceElevated,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }]}
            pointerEvents={scrubWeekIndex !== null ? 'auto' : 'none'}
          >
            <Text style={{ color: colors.textMuted ?? '#888', fontSize: 11, marginBottom: 6 }}>
              {snapLabel}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.gold, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {`$${Math.round(heroEarnings).toLocaleString()}`}
                </Text>
                <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>Earnings</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: computeSnapshotHoursColor(heroHours, weeklyLimit), fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {`${heroHours.toFixed(1)}h`}
                </Text>
                <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>Hours</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.cyan, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {`${Math.round(heroAiPct)}%`}
                </Text>
                <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>AI%</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: colors.violet, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {`${heroBrainlift.toFixed(1)}h`}
                </Text>
                <Text style={{ color: colors.textMuted ?? '#888', fontSize: 10, marginTop: 2 }}>BrainLift</Text>
              </View>
            </View>
          </Animated.View>

          {/* 08-dark-glass-polish FR1: Bento grid layout */}
          {/* Earnings — full width (primary importance) */}
          <Animated.View style={getEntryStyle(0)}>
          <Animated.View {...setTag('home-earnings-card')}>
          <ChartSection
            label="WEEKLY EARNINGS"
            heroValue={`$${Math.round(heroEarnings).toLocaleString()}`}
            subtitle={maxEarnings > 0 ? `Max $${Math.round(maxEarnings).toLocaleString()} / week` : undefined}
            data={overviewData.earnings}
            color={colors.gold}
            borderAccentColor={colors.gold}
            maxValue={maxEarnings > 0 ? maxEarnings : undefined}
            targetValue={maxEarnings > 0 ? maxEarnings : undefined}
            showGuide={maxEarnings > 0}
            capLabel={maxEarnings > 0 ? `$${Math.round(maxEarnings).toLocaleString()}` : undefined}
            weekLabels={overviewData.weekLabels}
            onScrubChange={handleScrubChange}
            externalCursorIndex={scrubWeekIndex}
            chartKey={`earnings-${chartKey}-${window}`}
          />
          </Animated.View>
          </Animated.View>

          {/* Hours + AI% — side-by-side half-width cards (secondary metrics) */}
          <Animated.View style={[getEntryStyle(1), { flexDirection: 'row', gap: 8 }]}>
            <View style={{ flex: 1 }}>
            <ChartSection
              label="WEEKLY HOURS"
              heroValue={`${heroHours.toFixed(1)}h`}
              subtitle={`Goal: ${weeklyLimit}h / week`}
              subtitleRight={hoursVariance?.label}
              subtitleRightColor={varianceColor}
              data={overviewData.hours}
              color={colors.success}
              borderAccentColor={computeSnapshotHoursColor(heroHours, weeklyLimit)}
              maxValue={weeklyLimit > 0 ? weeklyLimit : undefined}
              targetValue={weeklyLimit > 0 ? weeklyLimit : undefined}
              showGuide={weeklyLimit > 0}
              capLabel={weeklyLimit > 0 ? `${weeklyLimit}h` : undefined}
              weekLabels={overviewData.weekLabels}
              onScrubChange={handleScrubChange}
              externalCursorIndex={scrubWeekIndex}
              chartKey={`hours-${chartKey}-${window}`}
            />
            </View>
            <View style={{ flex: 1 }}>
            <ChartSection
              label="AI USAGE %"
              heroValue={`${Math.round(heroAiPct)}%`}
              subtitle="Target: 75% of tracked time"
              data={overviewData.aiPct}
              color={colors.cyan}
              borderAccentColor={colors.cyan}
              maxValue={100}
              targetValue={75}
              showGuide
              capLabel="75%"
              streak={aiStreak}
              weekLabels={overviewData.weekLabels}
              onScrubChange={handleScrubChange}
              externalCursorIndex={scrubWeekIndex}
              chartKey={`ai-${chartKey}-${window}`}
            />
            </View>
          </Animated.View>

          {/* BrainLift — full width at bottom */}
          <Animated.View style={getEntryStyle(2)}>
          <ChartSection
            label="BRAINLIFT HOURS"
            heroValue={`${heroBrainlift.toFixed(1)}h`}
            subtitle="Target: 5h / week"
            data={overviewData.brainliftHours}
            color={colors.violet}
            borderAccentColor={colors.violet}
            showGuide
            targetValue={5}
            capLabel="5h"
            streak={brainliftStreak}
            weekLabels={overviewData.weekLabels}
            onScrubChange={handleScrubChange}
            externalCursorIndex={scrubWeekIndex}
            chartKey={`brainlift-${chartKey}-${window}`}
          />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </FadeInScreen>
  );
}
