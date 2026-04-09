// GlassCard.tsx
// FR1 (03-glass-surfaces): Skia BackdropFilter blur layer — crash-safe glass
// FR2 (03-glass-surfaces): Masked gradient border (MaskedView + LinearGradient)
// FR3 (03-glass-surfaces): Skia inner shadow (top dark + bottom highlight in same Canvas)
// FR4 (03-glass-surfaces): Pressable spring animation (scale 1→0.97)
// FR5 (03-glass-surfaces): layerBudget=false flat-surface fallback
// FR6 (03-glass-surfaces): padding and radius props
//
// Architecture:
//   Animated.View  → dark bg fallback (#16151F) + spring scale wrapper (pressable=true only)
//   MaskedView     → gradient border: LinearGradient through 1.5px perimeter mask
//   Canvas         → BackdropFilter(blur=16) + RoundedRect fill + Skia inner shadow gradient
//   View (noise)   → white noise PNG at 0.03 opacity (brand §1.5)
//   View (content) → plain View with padding — no react-native-inner-shadow
//
// Why not react-native-inner-shadow:
//   ShadowView from react-native-inner-shadow renders an opaque white background for its
//   shadow calculation algorithm regardless of style.backgroundColor. This covers the
//   entire card with white on iOS. Replaced with a Skia LinearGradient drawn inside
//   the existing BackdropFilter Canvas — purely GPU, no white background issues.
//
// Why BackdropFilter instead of BlurView:
//   BlurView allocates a UIVisualEffectView GPU framebuffer at mount time.
//   With 3–5 cards mounting concurrently alongside Reanimated startup, this
//   causes SIGKILL. BackdropFilter runs inside the Skia C++ pipeline — no
//   UIVisualEffectView, no concurrent framebuffer allocation.
//
// Performance:
//   - renderToHardwareTextureAndroid={true} MANDATORY on Android
//   - Card opacity stays at 1.0 (sub-1.0 on BackdropFilter = glitches)
//   - BackdropFilter only rendered when dims.w > 0 (guards zero-canvas crash)
//   - Max 3 overlapping GlassCards per viewport (convention, not runtime guard)

import React, { useState } from 'react';
import {
  View,
  Platform,
  ViewStyle,
  StyleSheet,
  Pressable,
  ImageBackground,
} from 'react-native';
import {
  Canvas,
  BackdropFilter,
  Blur,
  RoundedRect,
  LinearGradient as SkiaLinearGradient,
  vec,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';

// ─── Constants ────────────────────────────────────────────────────────────────

const BLUR_RADIUS = { base: 16, elevated: 20 };

const BORDER_RADIUS = { 'xl': 12, '2xl': 16 };

const PADDING = { 'md': 20, 'lg': 24 };

const BORDER_GAP = 1.5;

const DEFAULT_BORDER_COLOR = '#A78BFA'; // violetAccent

// BackdropFilter tinted fill — 60% opacity (blur provides the depth)
const GLASS_FILL = 'rgba(22,21,31,0.6)';

// Inner shadow colors (Skia LinearGradient gradient stops)
const SHADOW_TOP = 'rgba(0,0,0,0.6)';
const SHADOW_BOTTOM = 'rgba(255,255,255,0.08)';

// Flat fallback colors (from Card.tsx GLASS_BASE)
const FLAT_BG = 'rgba(22, 21, 31, 0.85)';
const FLAT_BORDER = 'rgba(255, 255, 255, 0.10)';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'md' | 'lg';
  radius?: 'xl' | '2xl';
  elevated?: boolean;
  borderAccentColor?: string;
  pressable?: boolean;
  onPress?: () => void;
  layerBudget?: boolean;
  style?: ViewStyle;
  testID?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlassCard({
  children,
  className,
  padding = 'md',
  radius = '2xl',
  elevated = false,
  borderAccentColor = DEFAULT_BORDER_COLOR,
  pressable = false,
  onPress,
  layerBudget = true,
  style,
  testID,
}: GlassCardProps): JSX.Element {
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const blurRadius = elevated ? BLUR_RADIUS.elevated : BLUR_RADIUS.base;
  const borderRadiusPx = BORDER_RADIUS[radius];
  const paddingPx = PADDING[padding];

  // Spring scale for pressable mode
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { stiffness: 300, damping: 20 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { stiffness: 300, damping: 20 });
  };

  // ── layerBudget=false: flat fallback ─────────────────────────────────────────
  if (!layerBudget) {
    return (
      <View
        testID={testID}
        style={[
          {
            backgroundColor: FLAT_BG,
            borderColor: FLAT_BORDER,
            borderWidth: 1,
            borderRadius: borderRadiusPx,
            overflow: 'hidden',
            padding: paddingPx,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // ── Glass card body ───────────────────────────────────────────────────────────
  const glassBody = (
    <Animated.View
      style={[
        {
          borderRadius: borderRadiusPx,
          overflow: 'hidden',
          // Dark surface fallback — guarantees no white square when BackdropFilter
          // fails or hasn't rendered yet. BackdropFilter + RoundedRect(GLASS_FILL)
          // layers on top of this when Skia is working correctly.
          backgroundColor: '#16151F',
        },
        // Only apply animated scale style when pressable — avoids a no-op GPU
        // layer on Android for the common non-interactive case
        pressable ? animatedStyle : undefined,
        style,
      ]}
      renderToHardwareTextureAndroid={Platform.OS === 'android'}
      testID={testID}
    >
      {/* Gradient border — expo-linear-gradient at low opacity around the perimeter.  */}
      {/* MaskedView (RNCMaskedView) requires a custom dev build and isn't available   */}
      {/* in Expo Go. This approximation uses a gradient overlay at the card edges.    */}
      <LinearGradient
        colors={[borderAccentColor + '80', 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: borderRadiusPx,
            borderWidth: BORDER_GAP,
            borderColor: 'transparent',
          },
        ]}
        pointerEvents="none"
      />

      {/* Skia BackdropFilter + glass fill + inner shadow — all in one Canvas.     */}
      {/* Inner shadow is drawn as a LinearGradient-filled RoundedRect AFTER the   */}
      {/* BackdropFilter, using the painter's algorithm. No react-native-inner-    */}
      {/* shadow needed — ShadowView always renders white regardless of style.     */}
      {/* onLayout must be on the wrapping View, not Canvas (new arch limitation)  */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setDims({ w: width, h: height });
        }}
      >
        {dims.w > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            {/* BackdropFilter: blurs animated mesh behind card + dark glass fill */}
            <BackdropFilter filter={<Blur blur={blurRadius} />}>
              <RoundedRect
                x={0}
                y={0}
                width={dims.w}
                height={dims.h}
                r={borderRadiusPx}
                color={GLASS_FILL}
              />
            </BackdropFilter>
            {/* Inner shadow overlay — top dark inset + bottom highlight.         */}
            {/* Single RoundedRect with a 4-stop gradient:                        */}
            {/*   SHADOW_TOP at y=0 → transparent by 12% → transparent at 85% →  */}
            {/*   SHADOW_BOTTOM at y=100%. Purely Skia, no white background.      */}
            <RoundedRect x={0} y={0} width={dims.w} height={dims.h} r={borderRadiusPx}>
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

      {/* Noise texture — white noise PNG at 0.03 opacity, tiled to fill card surface */}
      {/* Position: above BackdropFilter canvas, below content (brand §1.5). */}
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

      {/* Content — plain View with padding. react-native-inner-shadow removed    */}
      {/* because ShadowView ignores backgroundColor: 'transparent' on iOS and   */}
      {/* renders a white surface, covering the BackdropFilter Canvas beneath it. */}
      <View style={{ padding: paddingPx, flex: 1 }}>
        {children}
      </View>
    </Animated.View>
  );

  // ── Pressable wrapper ─────────────────────────────────────────────────────────
  if (pressable) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {glassBody}
      </Pressable>
    );
  }

  return glassBody;
}
