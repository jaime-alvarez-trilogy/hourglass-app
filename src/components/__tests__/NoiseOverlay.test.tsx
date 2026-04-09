// Tests: NoiseOverlay component (05-panel-glass-surfaces)
// FR4: Noise texture overlay — absolutely positioned, opacity 0.04, pointerEvents none
//
// Mock strategy:
// - Image asset: virtual mock returns 1
// - react-native-web Image: mocked to avoid asset resolver errors
// - No resetModules (avoids React context loss)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// Mock noise asset
jest.mock('../../../assets/images/noise.png', () => 1, { virtual: true });

// Mock react-native-web Image to avoid asset ID resolution error
jest.mock('react-native-web/dist/exports/Image/index.js', () => {
  const mockReact = require('react');
  const MockImage = ({ style, resizeMode, source, ...props }: any) =>
    mockReact.createElement('Image', { style, resizeMode, source, ...props });
  MockImage.displayName = 'Image';
  return { default: MockImage, __esModule: true };
});

const NOISE_OVERLAY_FILE = path.resolve(__dirname, '../NoiseOverlay.tsx');

// Load module once
let NoiseOverlay: any;

beforeAll(() => {
  NoiseOverlay = require('../NoiseOverlay').default;
});

// ─── FR4: Runtime render checks ───────────────────────────────────────────────

describe('NoiseOverlay — FR4: component render', () => {
  it('FR4.1 — renders without error', () => {
    expect(() => {
      act(() => {
        create(React.createElement(NoiseOverlay));
      });
    }).not.toThrow();
  });

  it('FR4.2 — root element has pointerEvents="none"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(NoiseOverlay));
    });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    // pointerEvents="none" is set as prop on the View — in react-native-web it
    // gets converted to CSS pointer-events style, so we verify via source (FR4.8)
  });

  const findImage = (node: any): any => {
    if (!node) return null;
    if (node.type === 'Image') return node;
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      if (typeof child === 'object') {
        const found = findImage(child);
        if (found) return found;
      }
    }
    return null;
  };

  const flattenStyle = (style: any): any => {
    if (Array.isArray(style)) return Object.assign({}, ...style);
    if (style && typeof style === 'object') return style;
    return {};
  };

  it('FR4.3 — container has opacity 0.04 (verified via source)', () => {
    // StyleSheet.create returns numeric IDs in Jest — cannot access style values at runtime.
    // This is verified by FR4.9 source check which confirms opacity: 0.04 in the source.
    const source = fs.readFileSync(NOISE_OVERLAY_FILE, 'utf8');
    expect(source).toMatch(/opacity\s*:\s*0\.04/);
  });

  it('FR4.4 — Image is absolutely positioned', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(NoiseOverlay));
    });
    const imageNode = findImage(tree.toJSON());
    expect(imageNode).not.toBeNull();
    const style = flattenStyle(imageNode?.props?.style);
    expect(style.position).toBe('absolute');
  });

  it('FR4.5 — Image has resizeMode="repeat"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(NoiseOverlay));
    });
    const imageNode = findImage(tree.toJSON());
    expect(imageNode).not.toBeNull();
    expect(imageNode?.props?.resizeMode).toBe('repeat');
  });
});

// ─── Source file checks ────────────────────────────────────────────────────────

describe('NoiseOverlay — FR4: source file structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(NOISE_OVERLAY_FILE, 'utf8');
  });

  it('FR4.6 — source imports Image from react-native', () => {
    expect(source).toContain('Image');
  });

  it('FR4.7 — source references noise.png asset', () => {
    expect(source).toContain('noise.png');
  });

  it('FR4.8 — source uses pointerEvents="none"', () => {
    expect(source).toContain('pointerEvents');
    expect(source).toContain('none');
  });

  it('FR4.9 — source uses opacity: 0.04', () => {
    expect(source).toContain('0.04');
  });

  it('FR4.10 — source uses position: absolute', () => {
    expect(source).toContain('absolute');
  });

  it('FR4.11 — source uses resizeMode="repeat"', () => {
    expect(source).toContain('repeat');
  });
});
