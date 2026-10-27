// AutoApproveEntryRow — the Requests tab's way in to manager auto-approve (1.2)
//
// A compact row at the top of TEAM REQUESTS, "Auto-approve · On for N of M direct reports ›"
// (N = countEnabled), that opens app/direct-reports.tsx. Under it, a quiet "Auto-approved 3
// requests today" when the auto-approve log holds approvals from today's local date.
//
// The count comes from the store's log (useAutoApproveSettings), which the runner writes
// into the query cache after every run. This row does not call useAutoApproveRunner: the
// runner is mounted once in app/(tabs)/_layout.tsx, and a second instance would only see
// the runs it started itself.
//
// Manager-only: app/(tabs)/approvals.tsx renders it in the manager branch.
// NativeWind className only — no StyleSheet.create, no hex.

import React from 'react';
import { View, Text } from 'react-native';
import type { TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { AnimatedPressable } from './AnimatedPressable';
import { useAutoApproveSettings, useDirectReports } from '@/src/hooks/useAutoApprove';
import { countEnabled } from '@/src/lib/autoApprove';
import { approvedTodayCount } from '@/src/lib/autoApproveView';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export function AutoApproveEntryRow(): React.JSX.Element {
  const router = useRouter();
  const { rules, log } = useAutoApproveSettings();
  const { reports, isLoading, error } = useDirectReports();

  // While the roster loads, or when it failed with nothing to show, the row is just the
  // way in: the screen behind it has the skeleton and the Retry.
  const showCount = reports.length > 0 || (!isLoading && !error);
  const enabled = countEnabled(rules, reports);
  const total = reports.length;
  const approvedToday = approvedTodayCount(log, new Date());

  const status = showCount
    ? `On for ${enabled} of ${total} direct ${total === 1 ? 'report' : 'reports'}`
    : null;

  return (
    <View className="px-4 mb-2">
      <AnimatedPressable
        testID="auto-approve-entry"
        onPress={() => router.push('/direct-reports')}
        accessibilityRole="button"
        accessibilityLabel={status ? `Auto-approve, ${status}` : 'Auto-approve'}
        className="bg-surface rounded-2xl border border-border"
      >
        <View className="flex-row items-center px-4 py-3 gap-2">
          <Text className="text-textPrimary text-sm font-sans-semibold">Auto-approve</Text>
          {status !== null && (
            <Text className="text-textSecondary text-sm flex-1" numberOfLines={1}>
              {'· On for '}
              <Text className="font-mono text-textPrimary" style={TABULAR}>{enabled}</Text>
              {' of '}
              <Text className="font-mono text-textPrimary" style={TABULAR}>{total}</Text>
              {` direct ${total === 1 ? 'report' : 'reports'}`}
            </Text>
          )}
          {status === null && <View className="flex-1" />}
          <Text className="text-textMuted text-lg">›</Text>
        </View>
      </AnimatedPressable>

      {approvedToday > 0 && (
        <Text testID="auto-approve-today" className="text-textSecondary text-xs mt-1.5 px-1">
          {'Auto-approved '}
          <Text className="font-mono" style={TABULAR}>{approvedToday}</Text>
          {` ${approvedToday === 1 ? 'request' : 'requests'} today`}
        </Text>
      )}
    </View>
  );
}
