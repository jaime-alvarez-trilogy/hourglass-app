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
//   ImageBackground handles tiling correctly (Image resizeMode="repeat" renders
//   a fixed square on iOS; ImageBackground tiles properly).

import React from 'react';
import { View, ImageBackground, StyleSheet } from 'react-native';

export default function NoiseOverlay(): JSX.Element {
  return (
    <View pointerEvents="none" style={styles.container}>
      <ImageBackground
        source={require('../../assets/images/noise.png')}
        style={StyleSheet.absoluteFill}
        resizeMode="repeat"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.04,
  },
});
