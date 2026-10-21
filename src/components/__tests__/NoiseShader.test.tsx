// Tests: NoiseShader — shared Skia noise texture (brand §1.5)
//
// The shader must map one noise pixel to one device pixel. A release build tiling noise.png
// through ImageBackground loads it at scale 1 (UIKit reads scale from the filename), which drew
// each noise pixel as a 3x3 block on a 3x iPhone; EAS Update assets (<hash>.png) do the same.
// The source guard at the bottom keeps every noise surface on this shader.

import React from 'react';
import { PixelRatio } from 'react-native';
import { create, act } from 'react-test-renderer';
import { useImage } from '@shopify/react-native-skia';
import * as fs from 'fs';
import * as path from 'path';

import { NoiseShader, useNoiseImage } from '../NoiseShader';

const STUB_IMAGE = { width: () => 256, height: () => 256 } as any;

function renderShader(): any {
  let tree: any;
  act(() => {
    tree = create(React.createElement(NoiseShader, { image: STUB_IMAGE }));
  });
  return tree.root.findByType('ImageShader');
}

describe('NoiseShader', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tiles the image in both directions', () => {
    const shader = renderShader();
    expect(shader.props.image).toBe(STUB_IMAGE);
    expect(shader.props.tx).toBe('repeat');
    expect(shader.props.ty).toBe('repeat');
  });

  it.each([1, 2, 3])('scales by 1/PixelRatio so one noise pixel = one device pixel at %ix', (ratio) => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
    expect(renderShader().props.transform).toEqual([{ scale: 1 / ratio }]);
  });

  it('samples nearest-neighbour with no mipmaps (a linear filter would soften the grain)', () => {
    expect(renderShader().props.sampling).toEqual({ filter: 0, mipmap: 0 });
  });

  it('passes no rect, so the transform alone sets the tile size', () => {
    const props = renderShader().props;
    expect(props.rect).toBeUndefined();
    expect(props.fit).toBeUndefined();
  });
});

describe('useNoiseImage', () => {
  it('loads the bundled noise asset through Skia useImage', () => {
    (useImage as jest.Mock).mockClear();
    function Probe(): null {
      useNoiseImage();
      return null;
    }
    act(() => {
      create(React.createElement(Probe));
    });
    expect(useImage).toHaveBeenCalledTimes(1);
    // jest maps *.png to __mocks__/fileMock.js; the call must still be the bundled asset.
    expect(fs.readFileSync(path.resolve(__dirname, '../NoiseShader.tsx'), 'utf8')).toContain(
      "useImage(require('../../assets/images/noise.png'))",
    );
  });
});

// ─── Source guard: every noise surface draws through NoiseShader ────────────────

describe('noise texture source guard', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const SHADER_FILE = path.join(ROOT, 'src/components/NoiseShader.tsx');

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it('only NoiseShader.tsx references noise.png', () => {
    const offenders = [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'app'))]
      .filter((file) => file !== SHADER_FILE)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('noise.png'))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it.each(['NoiseOverlay.tsx', 'GlassCard.tsx', 'ApprovalCard.tsx'])(
    '%s draws its noise with NoiseShader',
    (name) => {
      const source = fs.readFileSync(path.join(ROOT, 'src/components', name), 'utf8');
      expect(source).toContain('useNoiseImage()');
      expect(source).toContain('<NoiseShader image={noise} />');
    },
  );
});
