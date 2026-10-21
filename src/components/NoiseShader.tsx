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
// inside an existing Canvas. The first load is async, so the very first texture appears a frame
// or two late; every later mount gets the cached image on its first render.

import React, { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import {
  ImageShader,
  Skia,
  loadData,
  FilterMode,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia';

// Nearest: at exactly 1:1 a linear filter would only soften the grain.
const NOISE_SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None };

// One decode for the whole app. Skia's useImage would decode noise.png again (and hold another
// GPU texture) for every GlassCard and every ApprovalCard row. loadData is the loader useImage
// itself uses: it resolves the asset through Image.resolveAssetSource, so a running EAS Update
// still serves its own copy via expo-asset.
let noiseImage: SkImage | null = null;
let noiseLoad: Promise<SkImage | null> | null = null;

function loadNoiseImage(): Promise<SkImage | null> {
  if (!noiseLoad) {
    noiseLoad = loadData(require('../../assets/images/noise.png'), (data) =>
      Skia.Image.MakeImageFromEncoded(data),
    ).then(
      (image) => {
        noiseImage = image;
        if (!image) noiseLoad = null; // decode failed: let the next mount retry
        return image;
      },
      () => {
        noiseLoad = null; // read failed: let the next mount retry
        return null;
      },
    );
  }
  return noiseLoad;
}

export function useNoiseImage(): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(noiseImage);
  useEffect(() => {
    if (image) return;
    let mounted = true;
    loadNoiseImage().then((loaded) => {
      if (mounted && loaded) setImage(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [image]);
  return image;
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
