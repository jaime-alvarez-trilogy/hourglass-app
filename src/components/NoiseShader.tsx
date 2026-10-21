// NoiseShader.tsx
// Shared Skia noise texture for NoiseOverlay, GlassCard and ApprovalCard (brand §1.5).
//
// Why Skia instead of <ImageBackground resizeMode="repeat">:
//   A release build loads noise.png through UIKit, which takes the image scale from the
//   filename. With no @Nx suffix that is scale 1, so the 256px tile covered 256pt and each noise
//   pixel became a 3x3 block on a 3x iPhone — visibly coarse grain. Dev builds decode the same
//   file at screen scale, which is why the simulator always looked fine. @2x/@3x copies only fix
//   the embedded bundle: EAS Update stores downloaded assets as <hash>.png, which loads at scale 1.
//   A Skia canvas always renders at device resolution, so scaling the shader by 1/PixelRatio
//   maps one noise pixel to one device pixel on every density, whichever bundle is running.
//
// Usage: call useNoiseImage() before any early return, then draw
//   {noise && <RoundedRect … opacity={0.03}><NoiseShader image={noise} /></RoundedRect>}
// inside an existing Canvas. useImage is async, so the texture appears a frame or two late.

import React from 'react';
import { PixelRatio } from 'react-native';
import {
  ImageShader,
  useImage,
  FilterMode,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia';

// Nearest: at exactly 1:1 a linear filter would only soften the grain.
const NOISE_SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };

export function useNoiseImage(): SkImage | null {
  return useImage(require('../../assets/images/noise.png'));
}

export function NoiseShader({ image }: { image: SkImage }): React.JSX.Element {
  return (
    <ImageShader
      image={image}
      tx="repeat"
      ty="repeat"
      sampling={NOISE_SAMPLING}
      transform={[{ scale: 1 / PixelRatio.get() }]}
    />
  );
}
