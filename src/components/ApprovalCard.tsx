// ApprovalCard — swipeable manager approval card with Liquid Glass surface
//
// Design: Liquid Glass dark surface per BRAND_GUIDELINES.md v2.0
// Gesture: Gesture.Pan() from react-native-gesture-handler (no legacy Animated/PanResponder)
// Swipe right = approve (green glow bleeds through glass), swipe left = reject (red glow)
//
// Glass layer stack (z-order, bottom to top):
//   1. Outer Animated.View      — swipe transforms + dark bg fallback (#16151F)
//   2. expo-linear-gradient     — gradient border at card perimeter (violet accent)
//   3. Skia Canvas              — BackdropFilter(blur=16) + RoundedRect(GLASS_FILL) + inner shadow
//   4. Noise overlay View       — noise.png at 0.03 opacity (brand §1.5)
//   5. Content View             — p-5, all card content
//   6. Face overlays            — approve/reject icon + label, absoluteFill, pointerEvents=none
//
// Glow layers (behind card, rendered before GestureDetector):
//   - Approve glow: colors.success, opacity 0→GLOW_OPACITY_MAX as translateX 0→SWIPE_THRESHOLD
//   - Reject glow: colors.destructive, opacity GLOW_OPACITY_MAX→0 as translateX -SWIPE_THRESHOLD→0
//   BackdropFilter blur samples the glow colors, tinting the glass surface as user drags.
//
// Performance:
//   - renderToHardwareTextureAndroid={true} MANDATORY on Android
//   - BackdropFilter only rendered when dims.w > 0 (guards zero-canvas crash on new arch)
//   - Card opacity stays at 1.0 during swipe (sub-1.0 on BackdropFilter = glitches)

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  useReducedMotion,
} from 'react-native-reanimated';
import {
  Canvas,
  BackdropFilter,
  Blur,
  RoundedRect,
  LinearGradient as SkiaLinearGradient,
  vec,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { springBouncy, springSnappy, timingInstant } from '@/src/lib/reanimated-presets';
import type { ApprovalItem, OvertimeApprovalItem } from '@/src/lib/approvals';
import { colors } from '@/src/lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 100;
const DISMISS_VELOCITY = 800;

// Glass surface constants — must match GlassCard.tsx
const GLOW_OPACITY_MAX = 0.55;  // max opacity of glow layers behind glass
const GLASS_FILL = 'rgba(22,21,31,0.6)';   // BackdropFilter fill — 60% opaque dark surface
const SHADOW_TOP = 'rgba(0,0,0,0.6)';       // inner shadow top (dark inset)
const SHADOW_BOTTOM = 'rgba(255,255,255,0.08)'; // inner shadow bottom (subtle highlight)
const BLUR_RADIUS = 16;
const BORDER_RADIUS_PX = 16; // corresponds to rounded-2xl

// ─── Type guard ──────────────────────────────────────────────────────────────

function isOvertime(item: ApprovalItem): item is OvertimeApprovalItem {
  return item.category === 'OVERTIME';
}

// ─── Internal: AnimatedButton ─────────────────────────────────────────────────
// Tap gesture with scale press feedback — meets BRAND_GUIDELINES §6.5

interface AnimatedButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  className?: string;
}

function AnimatedButton({ children, onPress, className = '' }: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const tap = Gesture.Tap()
    .onBegin(() => {
      if (!reducedMotion) scale.value = withTiming(0.96, timingInstant);
    })
    .onFinalize(() => {
      if (!reducedMotion) scale.value = withTiming(1, timingInstant);
    })
    .onEnd(() => {
      runOnJS(onPress)();
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={animStyle} className={className}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApprovalCard({ item, onApprove, onReject }: {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // Dims for Skia Canvas — updated by onLayout on wrapping View (new arch limitation)
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const overtime = isOvertime(item);

  // ── Callbacks (JS thread) ──────────────────────────────────────────────────

  const triggerApprove = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApprove();
  };

  const triggerReject = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onReject();
  };

  const triggerLight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Pan Gesture ────────────────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-8, 8])
    .onStart(() => {
      startX.value = translateX.value;
      runOnJS(triggerLight)();
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
    })
    .onEnd((e) => {
      const shouldApprove =
        !reducedMotion &&
        (translateX.value > SWIPE_THRESHOLD || e.velocityX > DISMISS_VELOCITY);
      const shouldReject =
        !reducedMotion &&
        (translateX.value < -SWIPE_THRESHOLD || e.velocityX < -DISMISS_VELOCITY);

      if (shouldApprove) {
        translateX.value = withSpring(screenWidth * 1.2, springSnappy);
        cardOpacity.value = withTiming(0, { duration: 250 });
        runOnJS(triggerApprove)();
      } else if (shouldReject) {
        translateX.value = withSpring(-screenWidth * 1.2, springSnappy);
        cardOpacity.value = withTiming(0, { duration: 250 });
        runOnJS(triggerReject)();
      } else {
        translateX.value = withSpring(0, springBouncy);
      }
    });

  // ── Animated Styles ────────────────────────────────────────────────────────

  // Card: swipe translation + tilt rotation (gated by reducedMotion)
  const cardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-screenWidth * 0.5, 0, screenWidth * 0.5],
      [-6, 0, 6],
      Extrapolation.CLAMP
    );
    return {
      opacity: cardOpacity.value,
      transform: [
        { translateX: translateX.value },
        { rotate: reducedMotion ? '0deg' : `${rotation}deg` },
      ],
    };
  });

  // Approve glow (behind card): opacity 0 → GLOW_OPACITY_MAX as card slides right
  // Suppressed entirely when reducedMotion is active (decorative effect)
  const approveGlowStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 0 };
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD],
        [0, GLOW_OPACITY_MAX],
        Extrapolation.CLAMP
      ),
    };
  });

  // Reject glow (behind card): opacity GLOW_OPACITY_MAX → 0 as card slides left
  // Suppressed entirely when reducedMotion is active
  const rejectGlowStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 0 };
    return {
      opacity: interpolate(
        translateX.value,
        [-SWIPE_THRESHOLD, 0],
        [GLOW_OPACITY_MAX, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  // Approve face overlay: fades in during right swipe (starts at half-threshold)
  // Suppressed when reducedMotion — decorative feedback only
  const approveFaceStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 0 };
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD * 0.5],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  // Reject face overlay: fades in during left swipe (starts at half-threshold)
  // Suppressed when reducedMotion
  const rejectFaceStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 0 };
    return {
      opacity: interpolate(
        translateX.value,
        [-SWIPE_THRESHOLD * 0.5, 0],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  // Approve icon: scale pop — 0.5 at rest → 1.0 at threshold → 1.3 past threshold
  const approveIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD * 0.6, SWIPE_THRESHOLD, SWIPE_THRESHOLD * 1.4],
      [0.5, 0.85, 1.0, 1.3],
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }] };
  });

  // Reject icon: scale pop — 1.3 past threshold → 1.0 at threshold → 0.5 at rest
  const rejectIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD * 1.4, -SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.6, 0],
      [1.3, 1.0, 0.85, 0.5],
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }] };
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View className="px-4 my-2">
      <View className="relative">

        {/* ── Glow layers (behind card, BEFORE GestureDetector) ──────────────
            These full-width colored views sit beneath the glass card.
            The BackdropFilter blur samples their color, tinting the glass
            surface as the user swipes — "lit card" Liquid Glass effect.    */}

        {/* Approve glow — green, fades in as card slides right */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.success, borderRadius: BORDER_RADIUS_PX },
            approveGlowStyle,
          ]}
          pointerEvents="none"
        />

        {/* Reject glow — red, fades in as card slides left */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.destructive, borderRadius: BORDER_RADIUS_PX },
            rejectGlowStyle,
          ]}
          pointerEvents="none"
        />

        {/* ── Swipeable glass card ───────────────────────────────────────── */}
        <GestureDetector gesture={panGesture}>
          {/* Outer Animated.View: carries swipe transforms.
              Dark bg fallback (#16151F) prevents white flash while BackdropFilter
              initialises. renderToHardwareTextureAndroid is MANDATORY on Android. */}
          <Animated.View
            style={[
              cardStyle,
              {
                borderRadius: BORDER_RADIUS_PX,
                overflow: 'hidden',
                backgroundColor: '#16151F',
              },
            ]}
            renderToHardwareTextureAndroid={Platform.OS === 'android'}
          >
            {/* Layer 2: Gradient border — expo-linear-gradient approximation.
                MaskedView (RNCMaskedView) requires a custom dev build and is
                unavailable in Expo Go. This gradient overlay at card edges is
                the same approximation used by GlassCard.tsx.                */}
            <LinearGradient
              colors={[colors.violet + '40', 'transparent']}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: BORDER_RADIUS_PX,
                  borderWidth: 1.5,
                  borderColor: 'transparent',
                },
              ]}
              pointerEvents="none"
            />

            {/* Layer 3: Skia Canvas — BackdropFilter + glass fill + inner shadow.
                onLayout on wrapping View (not Canvas) — new arch limitation.
                Render guarded by dims.w > 0 to prevent zero-canvas crash.  */}
            <View
              style={StyleSheet.absoluteFill}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setDims({ w: width, h: height });
              }}
            >
              {dims.w > 0 && (
                <Canvas style={StyleSheet.absoluteFill}>
                  {/* BackdropFilter: blurs glow colors from behind card into glass tint */}
                  <BackdropFilter filter={<Blur blur={BLUR_RADIUS} />}>
                    <RoundedRect
                      x={0}
                      y={0}
                      width={dims.w}
                      height={dims.h}
                      r={BORDER_RADIUS_PX}
                      color={GLASS_FILL}
                    />
                  </BackdropFilter>
                  {/* Inner shadow — 4-stop gradient: dark top inset → transparent → highlight bottom */}
                  <RoundedRect x={0} y={0} width={dims.w} height={dims.h} r={BORDER_RADIUS_PX}>
                    <SkiaLinearGradient
                      start={vec(0, 0)}
                      end={vec(0, dims.h)}
                      colors={[SHADOW_TOP, 'transparent', 'transparent', SHADOW_BOTTOM]}
                      positions={[0, 0.12, 0.85, 1]}
                    />
                  </RoundedRect>
                </Canvas>
              )}
            </View>

            {/* Layer 4: Noise texture — white noise PNG at 0.03 opacity (brand §1.5).
                Adds organic grain to the glass surface. pointerEvents=none — no interaction. */}
            <View
              style={[StyleSheet.absoluteFill, { opacity: 0.03 }]}
              pointerEvents="none"
            >
              <ImageBackground
                source={require('../../assets/images/noise.png')}
                style={StyleSheet.absoluteFill}
                resizeMode="repeat"
              />
            </View>

            {/* Layer 5: Content */}
            <View className="p-5">
              {/* Header: name + category badge */}
              <View className="flex-row items-start justify-between mb-3">
                <Text
                  className="text-textPrimary font-display-semibold text-base flex-1 mr-3"
                  numberOfLines={1}
                >
                  {item.fullName}
                </Text>

                <View
                  className={`px-2.5 py-1 rounded-xl ${
                    overtime ? 'bg-warning/15' : 'bg-violet/15'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-sans-semibold uppercase ${
                      overtime ? 'text-warning' : 'text-violet'
                    }`}
                    style={{ letterSpacing: 0.8 }}
                  >
                    {item.category}
                  </Text>
                </View>
              </View>

              {/* Hours + cost row */}
              <View className="flex-row items-baseline gap-4 mb-3">
                <Text
                  className="text-textPrimary font-mono text-xl"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {item.hours}
                  <Text className="text-textSecondary font-sans text-sm"> hrs</Text>
                </Text>

                {overtime && (
                  <Text
                    className="text-gold font-mono text-base"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    ${(item as OvertimeApprovalItem).cost.toFixed(2)}
                  </Text>
                )}
              </View>

              {/* Description */}
              <Text
                className="text-textSecondary font-sans text-sm leading-5 mb-4"
                numberOfLines={2}
              >
                {item.description}
              </Text>

              {/* Divider */}
              <View className="h-[1px] bg-border mb-4" />

              {/* Fallback action buttons */}
              <View className="flex-row gap-3">
                <AnimatedButton
                  onPress={onReject}
                  className="flex-1 bg-destructive/10 border border-destructive/25 rounded-xl py-3 items-center"
                >
                  <Text className="text-destructive font-sans-semibold text-sm">Reject</Text>
                </AnimatedButton>

                <AnimatedButton
                  onPress={onApprove}
                  className="flex-1 bg-success/10 border border-success/25 rounded-xl py-3 items-center"
                >
                  <Text className="text-success font-sans-semibold text-sm">Approve</Text>
                </AnimatedButton>
              </View>

              {/* Swipe hint */}
              <Text
                className="text-textMuted font-sans text-xs text-center mt-3"
                style={{ letterSpacing: 0.5 }}
              >
                ← reject · approve →
              </Text>

              {/* Layer 6: Face overlays — approve + reject icons, absoluteFill, pointerEvents=none.
                  Positioned inside the content View so they render above all card layers.
                  pointerEvents="none" is REQUIRED — must not intercept GestureDetector events. */}

              {/* Approve face overlay: green checkmark fades in as card slides right */}
              <Animated.View
                style={[StyleSheet.absoluteFill, approveFaceStyle, { alignItems: 'center', justifyContent: 'center' }]}
                pointerEvents="none"
              >
                <Animated.View style={approveIconStyle} className="items-center">
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                  <Text
                    className="font-sans-bold text-sm uppercase mt-1"
                    style={{ color: colors.success, letterSpacing: 1.5 }}
                  >
                    APPROVE
                  </Text>
                </Animated.View>
              </Animated.View>

              {/* Reject face overlay: red X fades in as card slides left */}
              <Animated.View
                style={[StyleSheet.absoluteFill, rejectFaceStyle, { alignItems: 'center', justifyContent: 'center' }]}
                pointerEvents="none"
              >
                <Animated.View style={rejectIconStyle} className="items-center">
                  <Ionicons name="close-circle" size={48} color={colors.destructive} />
                  <Text
                    className="font-sans-bold text-sm uppercase mt-1"
                    style={{ color: colors.destructive, letterSpacing: 1.5 }}
                  >
                    REJECT
                  </Text>
                </Animated.View>
              </Animated.View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

export default ApprovalCard;
