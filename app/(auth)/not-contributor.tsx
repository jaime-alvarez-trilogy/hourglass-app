// 05-onboarding-defense FR7: terminal onboarding screen for accounts with no
// contributor (CANDIDATE) role. Shows detected roles + Sign Out → welcome.
// Reached when fetchAndBuildConfig throws NotContributorError (see useAuth.ts).

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/src/contexts/OnboardingContext';
import { clearAll } from '@/src/store/config';
import { invalidateAuthToken } from '@/src/api/client';

export default function NotContributorScreen() {
  const router = useRouter();
  const { nonContributorRoles } = useOnboarding();

  const rolesText =
    nonContributorRoles && nonContributorRoles.length > 0
      ? nonContributorRoles.join(', ')
      : 'unknown';

  async function handleSignOut() {
    try {
      await clearAll();
    } finally {
      // Spec 04 FR7: wipe the in-memory auth-token cache even if clearAll throws.
      invalidateAuthToken();
    }
    router.replace('/(auth)/welcome');
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Account not supported</Text>
          <Text style={styles.subtitle}>
            Hourglass tracks contributor activity — hours, AI usage, and earnings.
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.bodyText}>
            Your Crossover account has these roles:{' '}
            <Text style={styles.bodyEmphasis}>{rolesText}</Text>.
          </Text>
          <Text style={styles.bodyText}>
            To use Hourglass, you&apos;ll need a Crossover Candidate (contributor)
            role. Resolve this on crossover.com, then sign back in.
          </Text>
        </View>

        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.85}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0C14',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  inner: {
    flex: 1,
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 22,
  },
  body: {
    flex: 1,
    gap: 16,
  },
  bodyText: {
    fontSize: 15,
    color: '#9CA3AF',
    lineHeight: 22,
  },
  bodyEmphasis: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  ctaWrap: {
    marginTop: 32,
  },
  signOutButton: {
    backgroundColor: '#1F1E29',
    borderWidth: 1,
    borderColor: '#2F2E41',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
