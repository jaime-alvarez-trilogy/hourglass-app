// FR1: AuthContainer — shared SafeAreaView wrapper for all auth screens
// Local to app/(auth)/ — not exported to global component library
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AuthContainerProps {
  children: React.ReactNode;
}

/**
 * AuthContainer provides consistent screen-level layout for all auth screens.
 * - SafeAreaView: handles notch/home indicator safe areas
 * - bg-background: fills the screen with the design system background color
 * - flex-1 px-4: full height with standard screen edge padding
 */
export default function AuthContainer({ children }: AuthContainerProps): React.JSX.Element {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-4">
        {children}
      </View>
    </SafeAreaView>
  );
}
