import '../global.css';

import { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { focusManager, QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 10-sdk-58-ios-27 FR4: the navigation themes come from expo-router 58 (its own navigation fork).
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConfig } from '@/src/hooks/useConfig';
import { useRoleRefresh } from '@/src/hooks/useRoleRefresh';
import { useScheduledNotifications } from '@/src/hooks/useScheduledNotifications';
import { colors } from '@/src/lib/colors';
import { registerPushToken } from '@/src/lib/pushToken';
import { shouldDehydrateQuery } from '@/src/lib/queryPersist';
import { registerBackgroundPushHandler } from '@/src/notifications/handler';

// FR1: Configure foreground notification display before any component renders
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Prevent auto-hide so we can control it after config loads
SplashScreen.preventAutoHideAsync();

// Wire TanStack Query focus manager to React Native AppState so queries
// refetch automatically when the app comes to the foreground.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 15, // 15 minutes — matches widget refresh cycle
      retry: 2,
      gcTime: 1000 * 60 * 60 * 24, // keep cache for 24h so persistence has data to save
    },
  },
});

// Persist query cache to AsyncStorage so data survives app restarts.
// Max age 24h — stale data is better than a blank screen on cold start.
// durable-data 03 FR5: shouldDehydrateQuery also keeps errored queries that still hold
// their last good data, and never keeps the 'dev-mock' manager-preview requests view.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'HOURGLASS_QUERY_CACHE',
});

function RootLayout() {
  const colorScheme = useColorScheme();
  const { config, isLoading } = useConfig();
  // durable-data 04 FR5: while PersistQueryClientProvider restores, queries neither subscribe
  // nor fetch, so useConfig reports config: null with isLoading: false. The splash, the auth
  // gate and the overlay all wait for the restore so a signed-in cold start never sees welcome.
  const isRestoring = useIsRestoring();
  const router = useRouter();
  const segments = useSegments();
  useRoleRefresh();
  useScheduledNotifications(config);

  // FR2: Register push token once when setup completes
  const hasRegisteredToken = useRef(false);
  useEffect(() => {
    if (!config?.setupComplete || hasRegisteredToken.current) return;
    hasRegisteredToken.current = true;
    registerPushToken().catch(() => {});
  }, [config?.setupComplete]);

  // FR3: Register background push handler on mount, clean up on unmount
  const pushSubscription = useRef<Notifications.Subscription | null>(null);
  useEffect(() => {
    pushSubscription.current = registerBackgroundPushHandler();
    return () => {
      pushSubscription.current?.remove();
    };
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    // SpaceGrotesk — hero metrics, headings (brand-revamp/01-design-tokens)
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    // SpaceMono — data tables, timestamps (brand-revamp/01-design-tokens)
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // SC1.3: hide native splash once config resolves and the cache restore is done
  useEffect(() => {
    if (!isLoading && !isRestoring) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, isRestoring]);

  // SC1.1 + SC1.2: auth gate — redirect after config resolves and the cache restore is done
  useEffect(() => {
    if (isLoading || isRestoring) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!config?.setupComplete && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (config?.setupComplete && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isRestoring, config, segments, router]);

  // SC1.3: overlay while config or fonts load, or the cache restores
  if (isLoading || !fontsLoaded || isRestoring) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.violet} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* 1.2 auto-approve: per-report settings, pushed from the Requests tab */}
        <Stack.Screen
          name="direct-reports"
          options={{
            title: 'Direct reports',
            // (tabs) has no title of its own, so the back button would read "(tabs)"
            headerBackTitle: 'Requests',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.violet,
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: asyncStoragePersister,
          maxAge: 1000 * 60 * 60 * 24,
          dehydrateOptions: { shouldDehydrateQuery },
        }}
      >
        <RootLayout />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
