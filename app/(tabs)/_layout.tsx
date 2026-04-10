// FR1 (02-approvals-tab-redesign): Always-visible Requests tab — no role gate.
// Removed: showApprovals conditional, useConfig import, tabBarButton role check.
// Tab title changed from "Approvals" to "Requests".
//
// FR1 (06-wiring-and-tokens): NoiseOverlay wired — wraps Tabs in View, overlay after.
// FR2 (06-wiring-and-tokens): Tab bar uses color tokens (colors.surface / colors.border).
//
// FR6 (01-widget-activation): useWidgetSync wired — updates home screen widget on each
// app open when fresh hours + config data is available.
//
// FR2–FR6 (06-native-tabs): NativeTabs migration. TAB_SCREENS shared constant eliminates
//   duplication between render paths. HapticTab removed — native tab bars handle haptics.
//
// FR7 (01-data-extensions): useWeeklyHistory wired — derives prevWeekSnapshot for
//   week-over-week delta computation in widget display.
//
// FR1–FR4 (02-platform-split-nav): Platform-split navigation.
//   - iOS → NativeTabs (UITabBarController + iOS 26 glass pill). Unchanged.
//   - Android → FloatingPillTabBar (custom floating pill via <Tabs> tabBar prop).
//   - PILL_BOTTOM_OFFSET applied via contentStyle to prevent content hiding behind pill.
//   - USE_NATIVE_TABS feature flag removed — Platform.OS drives the split always.

import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { View, Platform } from 'react-native';

import NoiseOverlay from '@/src/components/NoiseOverlay';
import { FloatingPillTabBar } from '@/src/components/FloatingPillTabBar';
import { colors } from '@/src/lib/colors';
import { useHistoryBackfill } from '@/src/hooks/useHistoryBackfill';
import { useHoursData } from '@/src/hooks/useHoursData';
import { useAIData } from '@/src/hooks/useAIData';
import { useApprovalItems } from '@/src/hooks/useApprovalItems';
import { useConfig } from '@/src/hooks/useConfig';
import { useWidgetSync } from '@/src/hooks/useWidgetSync';
import { useWeeklyHistory } from '@/src/hooks/useWeeklyHistory';
import { getMondayOfWeek } from '@/src/lib/ai';

// ─── Bottom padding constant (Android floating pill) ──────────────────────────
// Pill height (60) + bottom offset (24) + max safe-area inset (28) = 112.
// Applied via contentStyle to all tab screens so content clears the pill.

const PILL_BOTTOM_OFFSET = 112;

// ─── Shared tab screen configuration ─────────────────────────────────────────
// Single source of truth consumed by both NativeTabs and Android Tabs paths.

const TAB_SCREENS = [
  { name: 'index',     title: 'Home',     icon: 'house.fill' },
  { name: 'overview',  title: 'Overview', icon: 'chart.bar.fill' },
  { name: 'ai',        title: 'AI',       icon: 'sparkles' },
  { name: 'approvals', title: 'Requests', icon: 'checkmark.circle.fill' },
] as const;

export default function TabLayout() {
  useHistoryBackfill(); // fire-and-forget — runs once per session, writes AsyncStorage

  // Widget sync: keep home screen widget up-to-date on every app open
  const { data: hoursData } = useHoursData();
  const { data: aiData, isLoading: aiIsLoading } = useAIData();
  const { items } = useApprovalItems();
  const { config } = useConfig();

  // FR7 (01-data-extensions): derive previous week snapshot for delta fields
  const { snapshots } = useWeeklyHistory();
  const prevWeekSnapshot = useMemo(() => {
    // Use en-CA locale to get YYYY-MM-DD in local timezone without UTC shift
    const thisMonday = getMondayOfWeek(new Date().toLocaleDateString('en-CA'));
    const prev = [...snapshots].reverse().find(s => s.weekStart < thisMonday);
    return prev ? { hours: prev.hours, earnings: prev.earnings } : null;
  }, [snapshots]);

  useWidgetSync(hoursData, aiData, aiIsLoading, items.length, config, items, undefined, prevWeekSnapshot);

  // Approvals badge: show count when pending > 0, omit otherwise
  const approvalBadge = items.length > 0 ? items.length : undefined;

  // Platform split: iOS → NativeTabs, Android → FloatingPillTabBar
  const isIOS = Platform.OS === 'ios';

  if (isIOS) {
    // ── NativeTabs path (iOS) ───────────────────────────────────────────────
    // Compiles to UITabBarController. iOS 26+: system applies UIGlassEffect.
    // API: NativeTabs.Trigger (not .Screen) with Icon/Label/Badge children.
    return (
      <View style={{ flex: 1 }}>
        <NativeTabs
          tintColor={colors.violet}
          iconColor={{ default: colors.textMuted, selected: colors.violet }}
          backgroundColor="transparent"
          blurEffect="systemUltraThinMaterialDark"
          disableTransparentOnScrollEdge={false}
          shadowColor="transparent"
        >
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="overview">
            <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="bar_chart" />
            <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="ai">
            <NativeTabs.Trigger.Icon sf="sparkles" md="auto_awesome" />
            <NativeTabs.Trigger.Label>AI</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="approvals">
            <NativeTabs.Trigger.Icon sf="checkmark.circle.fill" md="check_circle" />
            <NativeTabs.Trigger.Label>Requests</NativeTabs.Trigger.Label>
            {approvalBadge != null && (
              <NativeTabs.Trigger.Badge>{String(approvalBadge)}</NativeTabs.Trigger.Badge>
            )}
          </NativeTabs.Trigger>
        </NativeTabs>
        <NoiseOverlay />
      </View>
    );
  }

  // ── Android path — FloatingPillTabBar ─────────────────────────────────────
  // Custom floating pill tab bar. tabBarStyle: display none hides React
  // Navigation's default BottomNavigationView so only the pill renders.
  // contentStyle padding prevents screen content hiding behind the pill.
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          contentStyle: { paddingBottom: PILL_BOTTOM_OFFSET },
        }}
        tabBar={(props) => (
          <FloatingPillTabBar
            {...props}
            tintColor={colors.violet}
            inactiveTintColor={colors.textMuted}
            badgeCounts={approvalBadge ? { approvals: approvalBadge } : {}}
          />
        )}
      >
        {TAB_SCREENS.map((screen) => {
          return (
            <Tabs.Screen
              key={screen.name}
              name={screen.name}
              options={{
                title: screen.title,
                ...(screen.name === 'approvals' && { tabBarBadge: approvalBadge }),
              }}
            />
          );
        })}
      </Tabs>
      <NoiseOverlay />
    </View>
  );
}
