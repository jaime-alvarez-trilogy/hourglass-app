/**
 * FloatingPillTabBar — Android floating pill tab bar component.
 *
 * FR1 (01-floating-pill-tab): Absolutely-positioned pill container with
 *   colors.surface background, colors.border border, borderRadius 28.
 * FR2 (01-floating-pill-tab): Tab items using MaterialIcons directly (not
 *   IconSymbol — Android MAPPING is sparse). Explore route filtered out.
 * FR3 (01-floating-pill-tab): Active indicator — violet 15% fill + violet stroke.
 * FR4 (01-floating-pill-tab): Press scale feedback via Reanimated springSnappy.
 * FR5 (01-floating-pill-tab): Badge — absolute red circle on top-right of icon.
 *
 * Designed to be passed as tabBar prop to expo-router <Tabs> by spec 02.
 * No router wiring here — component only.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { springSnappy } from '@/src/lib/reanimated-presets';
import { colors } from '@/src/lib/colors';

// ─── Icon mapping (SF symbol name → MaterialIcons name) ──────────────────────
// Covers the 4 visible tabs. IconSymbol's Android MAPPING only has 'house.fill',
// so we use MaterialIcons directly rather than patching the shared component.

const ICON_MAP: Record<string, string> = {
  'house.fill':            'home',
  'chart.bar.fill':        'bar_chart',
  'sparkles':              'auto_awesome',
  'checkmark.circle.fill': 'check_circle',
};

// ─── Pill tab configuration ───────────────────────────────────────────────────
// Mirrors TAB_SCREENS in _layout.tsx but excludes 'explore' (href: null).

export const PILL_TABS = [
  { name: 'index',     label: 'Home',     icon: 'house.fill' },
  { name: 'overview',  label: 'Overview', icon: 'chart.bar.fill' },
  { name: 'ai',        label: 'AI',       icon: 'sparkles' },
  { name: 'approvals', label: 'Requests', icon: 'checkmark.circle.fill' },
] as const;

type PillTabName = (typeof PILL_TABS)[number]['name'];

// Module-level set for O(1) route filtering — avoids reconstructing on every render
const PILL_TAB_NAMES = new Set<string>(PILL_TABS.map(t => t.name));

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FloatingPillTabBarProps extends BottomTabBarProps {
  tintColor: string;
  inactiveTintColor: string;
  badgeCounts?: Record<string, number>;
}

// ─── PillTabItem ──────────────────────────────────────────────────────────────

interface PillTabItemProps {
  routeName: PillTabName;
  label: string;
  iconName: string;
  isActive: boolean;
  onPress: () => void;
  onLongPress: () => void;
  tintColor: string;
  inactiveTintColor: string;
  badge?: number;
}

function PillTabItem({
  label,
  iconName,
  isActive,
  onPress,
  onLongPress,
  tintColor,
  inactiveTintColor,
  badge,
}: PillTabItemProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const mdIcon = (ICON_MAP[iconName] ?? 'help') as React.ComponentProps<typeof MaterialIcons>['name'];
  const itemColor = isActive ? tintColor : inactiveTintColor;

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, springSnappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, springSnappy);
        }}
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 14,
          ...(isActive && {
            backgroundColor: colors.violet + '1A',
            borderWidth: 1,
            borderColor: colors.violet,
          }),
        }}
      >
        {/* Icon with optional badge */}
        <View style={{ position: 'relative' }}>
          <MaterialIcons name={mdIcon} size={20} color={itemColor} />
          {badge > 0 && (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.critical,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: 'white',
                  fontSize: 8,
                  fontWeight: 'bold',
                  lineHeight: 10,
                }}
              >
                {String(badge)}
              </Text>
            </View>
          )}
        </View>

        {/* Label */}
        <Text
          style={{
            color: itemColor,
            fontSize: 10,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── FloatingPillTabBar ───────────────────────────────────────────────────────

export function FloatingPillTabBar({
  state,
  navigation,
  descriptors,
  tintColor,
  inactiveTintColor,
  badgeCounts,
}: FloatingPillTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 24 + insets.bottom,
        left: 20,
        right: 20,
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 28,
        paddingVertical: 8,
        paddingHorizontal: 4,
        // Subtle elevation shadow for depth
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      {state.routes.map((route, index) => {
        // Filter out 'explore' and any route not in PILL_TABS (module-level Set)
        if (!PILL_TAB_NAMES.has(route.name)) return null;

        const pillTab = PILL_TABS.find(t => t.name === route.name)!;

        const isActive = state.index === index;

        // Badge: prefer explicit badgeCounts prop, fall back to descriptor option
        const descriptorBadge = descriptors[route.key]?.options?.tabBarBadge;
        const badgeCount =
          badgeCounts?.[route.name] ??
          (typeof descriptorBadge === 'number' ? descriptorBadge : undefined);

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <PillTabItem
            key={route.key}
            routeName={pillTab.name}
            label={pillTab.label}
            iconName={pillTab.icon}
            isActive={isActive}
            onPress={onPress}
            onLongPress={onLongPress}
            tintColor={tintColor}
            inactiveTintColor={inactiveTintColor}
            badge={badgeCount}
          />
        );
      })}
    </View>
  );
}
