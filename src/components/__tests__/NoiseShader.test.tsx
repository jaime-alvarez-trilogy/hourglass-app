// Tests: NoiseShader — shared Skia noise texture (brand §1.5)
//
// The shader must map one noise pixel to one device pixel. A release build tiling noise.png
// through ImageBackground loads it at scale 1 (UIKit reads scale from the filename), which drew
// each noise pixel as a 3x3 block on a 3x iPhone; EAS Update assets (<hash>.png) do the same.
// The source guard at the bottom keeps every noise surface on this shader.

import React from 'react';
import { PixelRatio } from 'react-native';
import { create, act } from 'react-test-renderer';
import { loadData } from '@shopify/react-native-skia';
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
  function makeProbe(hook: () => unknown, seen: unknown[]) {
    return function Probe(): null {
      seen.push(hook());
      return null;
    };
  }

  // Runs first in this file, so the module-level cache starts empty.
  it('decodes once for every consumer and serves later mounts on their first render', async () => {
    (loadData as jest.Mock).mockClear();
    // Three cards mounting together before the first load resolves (the Home tab case).
    const first: unknown[] = [];
    await act(async () => {
      for (let i = 0; i < 3; i++) create(React.createElement(makeProbe(useNoiseImage, first)));
    });
    expect(first.slice(0, 3)).toEqual([null, null, null]); // not loaded on first render
    expect(first.at(-1)).not.toBeNull(); // then the decoded image arrives
    expect(loadData).toHaveBeenCalledTimes(1);

    const later: unknown[] = [];
    act(() => {
      create(React.createElement(makeProbe(useNoiseImage, later)));
      create(React.createElement(makeProbe(useNoiseImage, later)));
    });
    expect(later).toHaveLength(2);
    expect(later.every((image) => image === first.at(-1))).toBe(true);
    expect(loadData).toHaveBeenCalledTimes(1);
  });

  it('loads the bundled noise asset', () => {
    expect(fs.readFileSync(path.resolve(__dirname, '../NoiseShader.tsx'), 'utf8')).toContain(
      "loadData(require('../../assets/images/noise.png')",
    );
  });

  it('retries on the next mount after a failed read', async () => {
    await jest.isolateModulesAsync(async () => {
      // Fresh registry: React, the renderer and the Skia mock must come from it too.
      /* eslint-disable @typescript-eslint/no-require-imports -- needs the isolated registry */
      const R = require('react');
      const renderer = require('react-test-renderer');
      const skia = require('@shopify/react-native-skia');
      const { useNoiseImage: freshHook } = require('../NoiseShader');
      /* eslint-enable @typescript-eslint/no-require-imports */
      skia.loadData.mockImplementationOnce(() => Promise.reject(new Error('read failed')));

      const seen: unknown[] = [];
      await renderer.act(async () => {
        renderer.create(R.createElement(makeProbe(freshHook, seen)));
      });
      expect(seen.at(-1)).toBeNull();

      await renderer.act(async () => {
        renderer.create(R.createElement(makeProbe(freshHook, seen)));
      });
      expect(seen.at(-1)).not.toBeNull();
      expect(skia.loadData).toHaveBeenCalledTimes(2);
    });
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
