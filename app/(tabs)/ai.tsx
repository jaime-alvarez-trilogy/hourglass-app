// FR9 (04-ai-brainlift): AI & BrainLift screen — rebuilt for 06-ai-tab design system
// FR5: DailyAIRow (className-only styling)
// FR1 (03-ai-tab-integration): Prime Radiant card — AIConeChart full-size with re-animation
// FR4 (04-ai-hero-arc): AmbientBackground wiring — full-screen ambient behind ScrollView
// FR5 (04-ai-hero-arc): AIArcHero replaces two-card ring hero + standalone BrainLift card
// FR1 (04-ai-tab-screen): Data-gated loading — ActivityIndicator while data=null, no stagger
// FR4 (12-app-breakdown-ui): AppBreakdownCard inserted between Daily Breakdown and Trajectory

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAIData } from '@/src/hooks/useAIData';
import { useConfig } from '@/src/hooks/useConfig';
import { useFocusKey } from '@/src/hooks/useFocusKey';
import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry';
import { useListCascade } from '@/src/hooks/useListCascade';
import { useWeeklyHistory } from '@/src/hooks/useWeeklyHistory';
import { getWeekStartDate } from '@/src/lib/hours';
import AIConeChart from '@/src/components/AIConeChart';
import type { AIScrubPoint } from '@/src/components/AIConeChart';
import FadeInScreen from '@/src/components/FadeInScreen';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import Card from '@/src/components/Card';
import SectionLabel from '@/src/components/SectionLabel';
import AIArcHero from '@/src/components/AIArcHero';
import AmbientBackground, { getAmbientColor } from '@/src/components/AmbientBackground';
import AnimatedMeshBackground from '@/src/components/AnimatedMeshBackground';
import TrendSparkline from '@/src/components/TrendSparkline';
import { DailyAIRow } from '@/src/components/DailyAIRow';
import AppBreakdownCard from '@/src/components/AppBreakdownCard';
import { computeAICone } from '@/src/lib/aiCone';
import { colors } from '@/src/lib/colors';
import { generateGuidance } from '@/src/lib/appGuidance';
import { useAppBreakdown } from '@/src/hooks/useAppBreakdown';
import { classifyAIPct, type AITier } from '@/src/lib/aiTier';
import { setTag } from '@/src/lib/sharedTransitions';
import Animated from 'react-native-reanimated';

// ─── Layout constants ─────────────────────────────────────────────────────────

const CONTENT_STYLE = { padding: 16, paddingTop: 56, paddingBottom: 100, gap: 12 } as const;

/** Compare first half vs second half of the series to detect trend direction. */
function trendDirection(aiPct: number[]): 'up' | 'down' | 'flat' {
  if (aiPct.length < 4) return 'flat';
  const half = Math.floor(aiPct.length / 2);
  const firstAvg = aiPct.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondAvg = aiPct.slice(-half).reduce((a, b) => a + b, 0) / half;
  const diff = secondAvg - firstAvg;
  if (diff > 2) return 'up';
  if (diff < -2) return 'down';
  return 'flat';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AIScreen() {
  const router = useRouter();
  const { data, isLoading, lastFetchedAt, error, refetch, previousWeekPercent } = useAIData();
  const { config } = useConfig();
  const chartKey = useFocusKey();
  const { getEntryStyle } = useStaggeredEntry({ count: 7 });
  const { getItemStyle } = useListCascade({ count: data?.dailyBreakdown.length ?? 0 }, [chartKey]);

  // App breakdown — reads ai_app_history cache from AsyncStorage (no API calls).
  const { aggregated12w, currentWeek } = useAppBreakdown();

  // 12-week AI trajectory — reads persisted history only (no API calls).
  // Deliberately avoids useOverviewData which spins up a second useAIData instance,
  // doubling the parallel work diary fetches during the animation window (OOM pressure).
  const { snapshots } = useWeeklyHistory();
  const [trajectoryDims, setTrajectoryDims] = useState({ width: 0, height: 52 });

  // Prime Radiant cone dims — measured via onLayout; chart renders null until width > 0
  const [coneDims, setConeDims] = useState({ width: 0, height: 240 });

  // Scrub state — when user drags AIConeChart, hero AIArcHero shows scrubPoint.pctY via heroAIPct
  const [scrubPoint, setScrubPoint] = useState<AIScrubPoint | null>(null);

  // Config-derived weekly limit (FR1 03-ai-tab-integration)
  const weeklyLimit = config?.weeklyLimit ?? 40;

  // Auth error state
  if (error === 'auth') {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3" testID="error-auth">
        <Text className="text-xl font-bold text-textPrimary text-center">Session expired</Text>
        <Text className="text-sm text-textSecondary text-center">Please re-login to continue.</Text>
        <AnimatedPressable
          className="bg-success rounded-xl px-6 py-3 mt-2"
          onPress={() => router.replace('/(auth)/welcome')}
          testID="relogin-button"
        >
          <Text className="text-base font-bold text-background">Re-login</Text>
        </AnimatedPressable>
      </View>
    );
  }

  // Network error state
  if (error === 'network') {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3" testID="error-network">
        <Text className="text-xl font-bold text-textPrimary text-center">No connection</Text>
        <Text className="text-sm text-textSecondary text-center">Pull to refresh when connected.</Text>
        <AnimatedPressable
          className="bg-success rounded-xl px-6 py-3 mt-2"
          onPress={refetch}
          testID="retry-button"
        >
          <Text className="text-base font-bold text-background">Retry</Text>
        </AnimatedPressable>
      </View>
    );
  }

  // FR1 (04-ai-tab-screen): Data-gated loading — no Reanimated until data arrives.
  // isLoading=true AND data=null means no cache and fetch in-flight.
  // ActivityIndicator is a native component (zero Reanimated worklet pressure).
  if (!data && isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.success} />
      </View>
    );
  }

  // Empty state
  if (!data && !isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6 gap-3" testID="empty-state">
        <Text className="text-xl font-bold text-textPrimary text-center">No data yet.</Text>
        <Text className="text-sm text-textSecondary text-center">Come back after tracking some hours.</Text>
        <AnimatedPressable
          className="bg-success rounded-xl px-6 py-3 mt-2"
          onPress={refetch}
        >
          <Text className="text-base font-bold text-background">Refresh</Text>
        </AnimatedPressable>
      </View>
    );
  }

  // data !== null guaranteed below this point. TypeScript non-null assertion for narrowing.
  const safeData = data!;

  // Compute trajectory: use all 12 weeks but only average weeks with real data (> 0)
  // Include current week (last entry) in sparkline, exclude from average (partial week)
  const currentMonday = getWeekStartDate(true); // UTC Monday — matches storage keys
  const pastSnaps = snapshots.filter(s => s.weekStart < currentMonday).slice(-11);
  const currentAiPct = Math.round((safeData.aiPctLow + safeData.aiPctHigh) / 2);
  const aiPctSeries = [...pastSnaps.map(s => s.aiPct), currentAiPct];
  const completedAIPct = aiPctSeries.slice(0, -1); // past completed weeks only
  const nonZeroCompleted = completedAIPct.filter(v => v > 0);
  const hasTrajectory = nonZeroCompleted.length >= 2;
  const avgAIPct = nonZeroCompleted.length > 0
    ? nonZeroCompleted.reduce((a, b) => a + b, 0) / nonZeroCompleted.length
    : 0;
  const tier = classifyAIPct(avgAIPct);
  const trend = trendDirection(completedAIPct);

  // Cone data — computed once data is guaranteed non-null
  const coneData = computeAICone(safeData.dailyBreakdown, weeklyLimit, previousWeekPercent);

  // Derive display values
  const aiPercent = (safeData.aiPctLow + safeData.aiPctHigh) / 2;

  // Hero AI% — overridden by scrubPoint during scrub, otherwise live value
  const heroAIPct = scrubPoint !== null ? scrubPoint.pctY : aiPercent;
  const brainliftHours = safeData.brainliftHours;

  // Week-over-week delta (FR4) — only computed when we have real data and a prior week reference
  const delta = previousWeekPercent !== undefined ? aiPercent - previousWeekPercent : null;

  // Ambient color — drives AmbientBackground halo + AIArcHero fill arc
  // getAmbientColor({ type: 'aiPct' }) always returns a non-null string (no idle case for aiPct)
  const ambientColor = getAmbientColor({ type: 'aiPct', pct: Math.round(heroAIPct) }) as string;

  return (
    <View style={{ flex: 1, backgroundColor: '#0D0C14' }}>
      {/* FR4 (04-ai-hero-arc): Ambient layer — full-screen behind all content */}
      {/* 08-dark-glass-polish: direct AnimatedMeshBackground wiring with aiPct signal */}
      <AnimatedMeshBackground aiPct={Math.round(heroAIPct)} />
      <FadeInScreen>
        <ScrollView
          className="flex-1 bg-background"
          contentContainerStyle={CONTENT_STYLE}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.success}
            />
          }
        >
          {/* Header */}
          <Text className="text-3xl font-bold text-textPrimary mb-1">AI &amp; BrainLift</Text>

          {/* FR5 (04-ai-hero-arc): AIArcHero — replaces AIRingChart + standalone BrainLift card */}
          <Animated.View style={getEntryStyle(0)}>
          <AIArcHero
            aiPct={Math.round(heroAIPct)}
            brainliftHours={brainliftHours}
            deltaPercent={delta}
            ambientColor={ambientColor}
          />
          </Animated.View>

          {/* Prime Radiant Card — FR1 (03-ai-tab-integration) */}
          <Animated.View style={getEntryStyle(1)}>
          <Animated.View {...setTag('home-ai-card')}>
          <Card borderAccentColor={colors.cyan}>
            <SectionLabel className="mb-3">PRIME RADIANT</SectionLabel>
            {coneData ? (
              <View
                onLayout={e => setConeDims({ width: e.nativeEvent.layout.width, height: 240 })}
              >
                <AIConeChart
                  key={chartKey}
                  data={coneData}
                  width={coneDims.width}
                  height={240}
                  size="full"
                  onScrubChange={setScrubPoint}
                />
              </View>
            ) : null}
          </Card>
          </Animated.View>
          </Animated.View>

          {/* Daily Breakdown Card — FR5 */}
          {safeData.dailyBreakdown.length > 0 && (
            <Animated.View style={getEntryStyle(2)}>
            <Card testID="daily-breakdown" borderAccentColor={colors.cyan}>
              {/* Column headers */}
              <View className="flex-row pb-1.5 border-b border-border mb-1">
                <Text className="flex-1 text-xs text-textMuted uppercase tracking-wider">Day</Text>
                <Text className="w-[70px] text-right text-xs text-textMuted uppercase tracking-wider">AI%</Text>
                <Text className="w-[70px] text-right text-xs text-textMuted uppercase tracking-wider">BrainLift</Text>
              </View>
              {safeData.dailyBreakdown.map((day, index) => (
                <Animated.View key={day.date} style={getItemStyle(index)}>
                  <DailyAIRow item={day} />
                </Animated.View>
              ))}
            </Card>
            </Animated.View>
          )}

          {/* 12-Week AI Trajectory Card — above app breakdown per user preference */}
          {hasTrajectory && (
            <Animated.View style={getEntryStyle(3)}>
            <Card borderAccentColor={colors.cyan}>
              <SectionLabel className="mb-2">12-WEEK TRAJECTORY</SectionLabel>

              {/* Hero average + trend row */}
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text
                  className="font-display-bold"
                  style={{ color: tier.color, fontSize: 28, fontVariant: ['tabular-nums'], letterSpacing: -0.56 }}
                >
                  {Math.round(avgAIPct)}% avg
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {trend === 'up' ? '↑ Trending up' : trend === 'down' ? '↓ Trending down' : '→ Stable'}
                </Text>
              </View>

              {/* Tier label */}
              <Text style={{ color: tier.color, fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                {tier.label}
              </Text>

              {/* Sparkline */}
              <View
                style={{ height: 52 }}
                onLayout={e => setTrajectoryDims({ width: e.nativeEvent.layout.width, height: 52 })}
                className="mt-3"
              >
                <TrendSparkline
                  key={`trajectory-${chartKey}`}
                  data={aiPctSeries}
                  width={trajectoryDims.width}
                  height={trajectoryDims.height}
                  color={tier.color}
                  maxValue={100}
                  targetValue={75}
                  showGuide
                />
              </View>

              {/* Tier legend */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {[
                  { label: 'AI Leader', range: '75%+', color: colors.cyan as string },
                  { label: 'Consistent Progress', range: '50–74%', color: colors.success as string },
                  { label: 'Building Momentum', range: '30–49%', color: colors.warning as string },
                  { label: 'Getting Started', range: '<30%', color: colors.textMuted as string },
                ].map(t => {
                  const isActive = tier.label === t.label;
                  return (
                    <View key={t.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isActive ? t.color : colors.border }} />
                      <Text style={{ color: isActive ? t.color : colors.textMuted, fontSize: 10, fontWeight: isActive ? '600' : '400' }}>
                        {t.label} {t.range}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
            </Animated.View>
          )}

          {/* App Breakdown Card — FR4 (12-app-breakdown-ui) */}
          {aggregated12w.length > 0 && (
            <Animated.View style={getEntryStyle(4)}>
              <AppBreakdownCard
                entries={aggregated12w.slice(0, 8)}
                guidance={generateGuidance(aggregated12w, currentWeek)}
              />
            </Animated.View>
          )}

          {/* Legend Card */}
          <Animated.View style={getEntryStyle(5)}>
          <Card>
            <Text className="text-sm font-semibold text-textPrimary mb-1">How it&apos;s calculated</Text>
            <Text className="text-sm text-textSecondary leading-5">
              <Text className="text-cyan font-semibold">AI%</Text>
              {'  '}Slots tagged ai_usage or second_brain ÷ tagged slots × 100
            </Text>
            <Text className="text-sm text-textSecondary leading-5 mt-1">
              <Text className="text-violet font-semibold">BrainLift</Text>
              {'  '}Slots tagged second_brain × 10 min
            </Text>
            <Text className="text-xs text-textMuted mt-2">
              ±2% display range accounts for measurement variation.
            </Text>
          </Card>
          </Animated.View>

          {/* Last fetched timestamp */}
          <Animated.View style={getEntryStyle(6)}>
          {lastFetchedAt && (
            <Text className="text-xs text-textMuted text-center mt-1" testID="last-fetched">
              Updated {new Date(lastFetchedAt).toLocaleTimeString()}
            </Text>
          )}
          </Animated.View>
        </ScrollView>
      </FadeInScreen>
    </View>
  );
}
