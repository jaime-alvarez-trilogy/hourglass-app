// Environment selection — shown only when credentials work on both prod and QA
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '@/src/contexts/OnboardingContext';

export default function EnvSelectScreen() {
  const router = useRouter();
  const { selectEnvironment, isLoading, step } = useOnboarding();

  useEffect(() => {
    if (step === 'verifying') router.push('/(auth)/verifying');
    if (step === 'setup') router.replace('/(auth)/setup');
    if (step === 'success') router.replace('/(auth)/success');
    if (step === 'credentials') router.replace('/(auth)/credentials');
  }, [step]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Environment</Text>
          <Text style={styles.subtitle}>
            We found your account in two environments. Which would you like to use?
          </Text>
        </View>

        <View style={styles.options}>
          {/* Production */}
          <TouchableOpacity
            style={[styles.card, isLoading && styles.cardDisabled]}
            onPress={() => selectEnvironment(false)}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>Production</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              Your real hours, earnings, and approval data. This is what your manager sees.
            </Text>
          </TouchableOpacity>

          {/* QA */}
          <TouchableOpacity
            style={[styles.card, isLoading && styles.cardDisabled]}
            onPress={() => selectEnvironment(true)}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>QA / Testing</Text>
              <View style={styles.sandboxBadge}>
                <Text style={styles.sandboxBadgeText}>SANDBOX</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>
              A testing sandbox with sample data. Nothing here is real or visible to anyone.
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          {isLoading ? (
            <ActivityIndicator color="#6B7280" />
          ) : (
            <Text style={styles.footerText}>You can switch environments later from Settings.</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0C14',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
  options: {
    gap: 12,
  },
  card: {
    backgroundColor: '#16151F',
    borderWidth: 1,
    borderColor: '#2F2E41',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
  },
  liveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  sandboxBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sandboxBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#484F58',
  },
});
