// Tests: NoiseOverlay component (05-panel-glass-surfaces)
// FR4: Noise texture overlay — absolutely positioned, opacity 0.04, pointerEvents none
//
// The overlay is a Skia Canvas drawing NoiseShader (see NoiseShader.tsx for why it is no
// longer an ImageBackground). The Skia mock renders Fill and ImageShader as host elements
// and resolves useImage synchronously, so the loaded branch is visible to react-test-renderer.
//
// Mock strategy:
// - Skia: __mocks__/@shopify/react-native-skia.ts (useImage is a jest.fn)
// - No resetModules (avoids React context loss)

import React from 'react';
import { create, act } from 'react-test-renderer';
import { useImage } from '@shopify/react-native-skia';
import * as fs from 'fs';
import * as path from 'path';

const NOISE_OVERLAY_FILE = path.resolve(__dirname, '../NoiseOverlay.tsx');

// Load module once
let NoiseOverlay: any;

beforeAll(() => {
  NoiseOverlay = require('../NoiseOverlay').default;
});

function render(): any {
  let tree: any;
  act(() => {
    tree = create(React.createElement(NoiseOverlay));
  });
  return tree;
}

// ─── FR4: Runtime render checks ───────────────────────────────────────────────

describe('NoiseOverlay — FR4: component render', () => {
  it('FR4.1 — renders without error', () => {
    expect(() => render()).not.toThrow();
  });

  it('FR4.2 — draws one full-screen Fill at opacity 0.04 inside a Canvas', () => {
    const root = render().root;
    expect(root.findAllByType('Canvas')).toHaveLength(1);
    const fills = root.findAllByType('Fill');
    expect(fills).toHaveLength(1);
    expect(fills[0].props.opacity).toBe(0.04);
  });

  it('FR4.3 — the Fill is shaded by the repeating noise shader', () => {
    const fill = render().root.findByType('Fill');
    const shader = fill.findByType('ImageShader');
    expect(shader.props.tx).toBe('repeat');
    expect(shader.props.ty).toBe('repeat');
    expect(shader.props.image).not.toBeNull();
  });

  it('FR4.4 — draws nothing while the noise image is still loading', () => {
    (useImage as jest.Mock).mockReturnValueOnce(null);
    const root = render().root;
    expect(root.findAllByType('Canvas')).toHaveLength(1);
    expect(root.findAllByType('Fill')).toHaveLength(0);
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
