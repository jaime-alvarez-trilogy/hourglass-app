// modal.tsx
// FR3 (05-panel-glass-surfaces): BlurView dark glass surface

import { View, Text, Switch, StyleSheet, Alert, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useState, startTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clearAll, loadCredentials, saveConfig } from '@/src/store/config';
import { unregisterPushToken } from '@/src/lib/pushToken';
import { fetchAndBuildConfig } from '@/src/api/auth';
import { MOCK_TEAM_ITEMS } from '@/src/lib/devMock';
import { useConfig } from '@/src/hooks/useConfig';
import { colors } from '@/src/lib/colors';

export default function ModalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const [username, setUsername] = useState<string | null>(null);
  const [isSwitchingEnv, setIsSwitchingEnv] = useState(false);

  // Local toggle state — initialized once from config, then owned locally.
  const [managerPreview, setManagerPreview] = useState(false);
  const [overtimePreview, setOvertimePreview] = useState(false);
  const [togglesInitialized, setTogglesInitialized] = useState(false);

  useEffect(() => {
    loadCredentials().then((creds) => setUsername(creds?.username ?? null));
  }, []);

  useEffect(() => {
    if (config && !togglesInitialized) {
      setManagerPreview(config.devManagerView ?? false);
      setOvertimePreview(config.devOvertimePreview ?? false);
      setTogglesInitialized(true);
    }
  }, [config, togglesInitialized]);

  const isMe = username === process.env.EXPO_PUBLIC_DEV_USERNAME;

  async function handleSignOut() {
    Alert.alert('Sign Out', 'This will clear your saved credentials and return to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await unregisterPushToken().catch(() => {});
          await clearAll();
          // 05-cache-hygiene FR2: clear TanStack in-memory cache and cancel notifications
          try { queryClient.clear(); } catch { /* non-blocking */ }
          try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch { /* non-blocking */ }
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  }

  async function handleSwitchEnvironment() {
    if (!config || !username) return;

    const targetEnv = config.useQA ? 'Production' : 'QA / Testing';
    const targetIsQA = !config.useQA;

    Alert.alert(
      `Switch to ${targetEnv}?`,
      targetIsQA
        ? 'You will switch to the QA sandbox environment. Data here is for testing only.'
        : 'You will switch back to Production with your real hours and earnings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Switch to ${targetEnv}`,
          onPress: async () => {
            setIsSwitchingEnv(true);
            try {
              const creds = await loadCredentials();
              if (!creds) return;
              const newConfig = await fetchAndBuildConfig(creds.username, creds.password, targetIsQA);
              await saveConfig(newConfig);
              startTransition(() => {
                // 05-cache-hygiene FR3: resetQueries clears all stale-env data and
                // triggers immediate refetch for active queries.
                // The old invalidateQueries calls used ['hours'] and ['approvals'] — keys
                // that no registered query uses — so they were silent no-ops.
                queryClient.resetQueries();
                // Set config AFTER reset so it isn't immediately wiped.
                queryClient.setQueryData(['config'], newConfig);
              });
              router.dismiss();
            } catch {
              Alert.alert('Failed to Switch', `Could not connect to ${targetEnv}. Check your network and try again.`);
            } finally {
              setIsSwitchingEnv(false);
            }
          },
        },
      ],
    );
  }

  async function toggleDevManagerView(value: boolean) {
    if (!config) return;
    setManagerPreview(value);
    try {
      const updated = { ...config, devManagerView: value };
      await saveConfig(updated);
      startTransition(() => {
        queryClient.setQueryData(['config'], updated);
        queryClient.setQueryData(['approvals'], value ? [...MOCK_TEAM_ITEMS] : []);
      });
    } catch (e) {
      console.error('[settings] toggleDevManagerView failed:', e);
    }
  }

  async function toggleDevOvertimePreview(value: boolean) {
    if (!config) return;
    setOvertimePreview(value);
    try {
      const updated = { ...config, devOvertimePreview: value };
      await saveConfig(updated);
      startTransition(() => {
        queryClient.setQueryData(['config'], updated);
        queryClient.invalidateQueries({ queryKey: ['hours'] });
      });
    } catch (e) {
      console.error('[settings] toggleDevOvertimePreview failed:', e);
    }
  }

  return (
    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={() => router.dismiss()} style={styles.doneButton} hitSlop={16}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
          {config && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>Config Debug</Text>
              <Text style={styles.debugRow}>name: {config.fullName}</Text>
              <Text style={styles.debugRow}>userId: {config.userId}</Text>
              <Text style={styles.debugRow}>managerId: {config.managerId}</Text>
              <Text style={styles.debugRow}>teamId: {config.primaryTeamId}</Text>
              <Text style={styles.debugRow}>assignmentId: {config.assignmentId}</Text>
              <Text style={styles.debugRow}>rate: ${config.hourlyRate}/hr</Text>
              <Text style={styles.debugRow}>isManager: {String(config.isManager)}</Text>
              <Text style={styles.debugRow}>env: {config.useQA ? 'QA' : 'Production'}</Text>
            </View>
          )}

          {/* Environment switcher — shown when user has both envs available */}
          {config && (
            <TouchableOpacity
              style={[styles.envSwitchButton, isSwitchingEnv && { opacity: 0.6 }]}
              onPress={handleSwitchEnvironment}
              disabled={isSwitchingEnv}
              activeOpacity={0.8}
            >
              {isSwitchingEnv ? (
                <ActivityIndicator color={config.useQA ? colors.success : colors.warning} size="small" />
              ) : (
                <>
                  <View>
                    <Text style={styles.envSwitchLabel}>
                      {config.useQA ? '🔄  Switch to Production' : '🧪  Switch to QA / Testing'}
                    </Text>
                    <Text style={styles.envSwitchHint}>
                      {config.useQA
                        ? 'Return to your real hours and earnings'
                        : 'Connect to the sandbox environment'}
                    </Text>
                  </View>
                  <Text style={[styles.envBadge, { color: config.useQA ? colors.success : colors.warning }]}>
                    {config.useQA ? 'QA' : 'PROD'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {config && isMe && (
            <View style={styles.devBox}>
              <Text style={styles.devTitle}>Dev Options</Text>
              {!config.isManager && (
                <>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Manager Preview</Text>
                    <Switch
                      value={managerPreview}
                      onValueChange={toggleDevManagerView}
                      trackColor={{ false: colors.border, true: colors.violet }}
                      thumbColor={colors.textPrimary}
                    />
                  </View>
                  <Text style={styles.toggleHint}>
                    Shows the Team Requests queue with fake pending approvals + fake My Requests.
                  </Text>
                </>
              )}
              <View style={[styles.toggleRow, { marginTop: 12 }]}>
                <Text style={styles.toggleLabel}>Overtime Preview</Text>
                <Switch
                  value={overtimePreview}
                  onValueChange={toggleDevOvertimePreview}
                  trackColor={{ false: colors.border, true: colors.violet }}
                  thumbColor={colors.textPrimary}
                />
              </View>
              <Text style={styles.toggleHint}>
                Forces the home screen hero to show the Overtime panel state.
              </Text>
            </View>
          )}

          <AnimatedPressable style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </AnimatedPressable>
        </ScrollView>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.surfaceElevated + 'D9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doneButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.violet,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  debugBox: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00FF88',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  debugRow: {
    fontSize: 13,
    color: '#8B949E',
    fontFamily: 'Courier',
  },
  envSwitchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  envSwitchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  envSwitchHint: {
    fontSize: 12,
    color: '#484F58',
  },
  envBadge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  devBox: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  devTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E8C97A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  toggleHint: {
    fontSize: 12,
    color: '#484F58',
    marginTop: 6,
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#F85149',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F85149',
  },
});
