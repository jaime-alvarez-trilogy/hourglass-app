// Tests: NoiseOverlay component (05-panel-glass-surfaces)
// FR4: Noise texture overlay — absolutely positioned, opacity 0.04, pointerEvents none
//
// The overlay is a Skia Canvas drawing NoiseShader (see NoiseShader.tsx for why it is no
// longer an ImageBackground). The Skia mock renders Fill and ImageShader as host elements and
// resolves loadData on the next microtask, so renders are awaited to reach the loaded branch.
//
// Mock strategy:
// - Skia: __mocks__/@shopify/react-native-skia.ts
// - No resetModules (avoids React context loss); the loading test isolates its own registry

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const NOISE_OVERLAY_FILE = path.resolve(__dirname, '../NoiseOverlay.tsx');

// Load module once
let NoiseOverlay: any;

beforeAll(() => {
  NoiseOverlay = require('../NoiseOverlay').default;
});

async function render(): Promise<any> {
  let tree: any;
  await act(async () => {
    tree = create(React.createElement(NoiseOverlay));
  });
  return tree;
}

// ─── FR4: Runtime render checks ───────────────────────────────────────────────

describe('NoiseOverlay — FR4: component render', () => {
  it('FR4.1 — renders without error', async () => {
    await expect(render()).resolves.toBeTruthy();
  });

  it('FR4.2 — draws one full-screen Fill at opacity 0.04 inside a Canvas', async () => {
    const root = (await render()).root;
    expect(root.findAllByType('Canvas')).toHaveLength(1);
    const fills = root.findAllByType('Fill');
    expect(fills).toHaveLength(1);
    expect(fills[0].props.opacity).toBe(0.04);
  });

  it('FR4.3 — the Fill is shaded by the repeating noise shader', async () => {
    const fill = (await render()).root.findByType('Fill');
    const shader = fill.findByType('ImageShader');
    expect(shader.props.tx).toBe('repeat');
    expect(shader.props.ty).toBe('repeat');
    expect(shader.props.image).not.toBeNull();
  });

  it('FR4.4 — draws nothing until the noise image has loaded', async () => {
    await jest.isolateModulesAsync(async () => {
      // Fresh registry so the shared noise image cache starts empty.
      /* eslint-disable @typescript-eslint/no-require-imports -- needs the isolated registry */
      const R = require('react');
      const renderer = require('react-test-renderer');
      const skia = require('@shopify/react-native-skia');
      const Overlay = require('../NoiseOverlay').default;
      /* eslint-enable @typescript-eslint/no-require-imports */
      let finishLoad: () => void = () => {};
      skia.loadData.mockImplementationOnce(
        (_source: unknown, factory: (data: unknown) => unknown) =>
          new Promise((resolve) => {
            finishLoad = () => resolve(factory({}));
          }),
      );

      let tree: any;
      await renderer.act(async () => {
        tree = renderer.create(R.createElement(Overlay));
      });
      expect(tree.root.findAllByType('Canvas')).toHaveLength(1);
      expect(tree.root.findAllByType('Fill')).toHaveLength(0);

      await renderer.act(async () => finishLoad());
      expect(tree.root.findAllByType('Fill')).toHaveLength(1);
    });
  });
});

// ─── Source file checks ────────────────────────────────────────────────────────

describe('NoiseOverlay — FR4: source file structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(NOISE_OVERLAY_FILE, 'utf8');
  });

  it('FR4.5 — draws through the shared NoiseShader', () => {
    expect(source).toContain("from './NoiseShader'");
    expect(source).toContain('useNoiseImage()');
  });

  it('FR4.6 — no longer tiles an ImageBackground (coarse 1pt grain in release builds)', () => {
    expect(source).not.toMatch(/<ImageBackground|<Image\b/);
  });

  it('FR4.7 — opacity is a paint prop, not a Canvas style (Skia style.opacity glitches)', () => {
    expect(source).toMatch(/NOISE_OPACITY\s*=\s*0\.04/);
    expect(source).toContain('opacity={NOISE_OPACITY}');
    const code = source.replace(/\/\/.*$/gm, ''); // the header comment quotes "opacity: 0.04"
    expect(code).not.toMatch(/opacity\s*:/);
  });

  it('FR4.8 — source uses pointerEvents="none"', () => {
    expect(source).toContain('pointerEvents="none"');
  });

  it('FR4.9 — fills the screen (StyleSheet.absoluteFill)', () => {
    expect(source).toContain('StyleSheet.absoluteFill');
  });
});
