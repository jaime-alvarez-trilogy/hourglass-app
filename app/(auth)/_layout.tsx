// FR2-FR7: Stack navigator for the auth onboarding group
import { Stack } from 'expo-router';
import { OnboardingProvider } from '@/src/contexts/OnboardingContext';

export default function AuthLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} initialRouteName="welcome">
        <Stack.Screen name="welcome" />
        <Stack.Screen name="credentials" />
        <Stack.Screen name="verifying" options={{ gestureEnabled: false }} />
        <Stack.Screen name="env-select" options={{ gestureEnabled: false }} />
        <Stack.Screen name="setup" />
        <Stack.Screen name="success" />
      </Stack>
    </OnboardingProvider>
  );
}
