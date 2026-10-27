// NoiseOverlay.tsx
// FR4 (05-panel-glass-surfaces): Tileable noise texture overlay
//
// Design system rule (BRAND_GUIDELINES.md v1.1 §Surface & Depth — Noise Texture):
//   Noise is applied once at root screen level only.
//   opacity: 0.04 — subtle texture, adds depth without drawing attention.
//   pointerEvents="none" — never intercepts touch events.
//
// Architecture:
//   Outer View has pointerEvents="none" — guarantees touches pass through.
//   Skia Canvas fills the screen with NoiseShader at one noise pixel per device pixel.
//   Opacity is a paint prop on <Fill>, not a style on the Canvas (Skia canvas +
//   style.opacity < 1.0 = rendering glitch risk). See NoiseShader.tsx for why this is
//   no longer an ImageBackground.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Fill } from '@shopify/react-native-skia';
import { NoiseShader, useNoiseImage } from './NoiseShader';

const NOISE_OPACITY = 0.04;

export default function NoiseOverlay(): React.JSX.Element {
  const noise = useNoiseImage();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {noise && (
          <Fill opacity={NOISE_OPACITY}>
            <NoiseShader image={noise} />
          </Fill>
        )}
      </Canvas>
    </View>
  );
}
