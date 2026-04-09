// FR4: Verifying screen — non-interactive loading while auth + profile fetch runs
import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '@/src/contexts/OnboardingContext';

export default function VerifyingScreen() {
  const router = useRouter();
  const { step } = useOnboarding();

  // SC4.3–4.5: Navigate automatically when step leaves 'verifying'
  useEffect(() => {
    if (step === 'success') {
      router.replace('/(auth)/success');
    } else if (step === 'setup') {
      router.replace('/(auth)/setup');
    } else if (step === 'env-select') {
      router.replace('/(auth)/env-select');
    } else if (step === 'credentials') {
      router.replace('/(auth)/credentials');
    }
  }, [step, router]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-4 items-center justify-center gap-5">
        <ActivityIndicator size="large" color="#8B949E" />
        <Text className="font-sans text-base text-textSecondary">
          Verifying your account…
        </Text>
      </View>
    </SafeAreaView>
  );
}
