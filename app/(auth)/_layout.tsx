// FR2-FR7: Stack navigator for the auth onboarding group
import { Stack } from 'expo-router';
import { OnboardingProvider } from '@/src/contexts/OnboardingContext';

// 10-sdk-58-ios-27 FR4: expo-router 58 removes the Stack `initialRouteName` prop
// (Omit-ted in StackClient.d.ts); the group's first screen is declared as its anchor.
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="credentials" />
        <Stack.Screen name="verifying" options={{ gestureEnabled: false }} />
        <Stack.Screen name="env-select" options={{ gestureEnabled: false }} />
        <Stack.Screen name="setup" />
        <Stack.Screen name="success" />
        {/* 05-onboarding-defense FR7: terminal state for no-contributor accounts. */}
        <Stack.Screen name="not-contributor" options={{ gestureEnabled: false }} />
      </Stack>
    </OnboardingProvider>
  );
}
