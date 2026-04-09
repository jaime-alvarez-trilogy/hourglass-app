// NATIVEWIND_VERIFIED: 2026-03-14 — className renders correctly in Expo Go
// Expo SDK 54, react-native 0.81.5, nativewind ^4.2.2
// This is a TEMPORARY smoke-test component. Do NOT use in production screens.
// Purpose: verify the NativeWind v4 className pipeline end-to-end before
// building the design system component library (spec 03-base-components+).

import { View, Text } from 'react-native';

export default function NativeWindSmoke(): JSX.Element {
  return (
    <View style={{ height: 120, backgroundColor: 'red', alignItems: 'center', justifyContent: 'center' }}>
      <View className="bg-surface rounded-2xl p-5 border border-border">
        <Text className="text-gold font-display text-3xl">42.5</Text>
        <Text className="text-textSecondary font-sans text-sm">Hours This Week</Text>
        <View className="bg-cyan w-3 h-3 rounded-full mt-2" />
      </View>
    </View>
  );
}
