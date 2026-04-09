// Tests: SkeletonLoader component (03-base-components)
// FR5: Pulsing shimmer placeholder with timingSmooth loop
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions are done via source-file static analysis (fs.readFileSync).

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const SKELETON_LOADER_FILE = path.resolve(__dirname, '../SkeletonLoader.tsx');

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('SkeletonLoader — FR5: runtime render', () => {
  let SkeletonLoader: any;

  beforeAll(() => {
    SkeletonLoader = require('../SkeletonLoader').default;
  });

  it('SC5.1 — renders with default dimensions without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(SkeletonLoader, null));
      });
    }).not.toThrow();
  });

  it('SC5.1 — renders with explicit width and height without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(SkeletonLoader, { width: 120, height: 40 }));
      });
    }).not.toThrow();
  });

  it('SC5.4 — renders with rounded=true without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(SkeletonLoader, { rounded: true }));
      });
    }).not.toThrow();
  });

  it('SC5.6 — custom width and height are passed to style prop', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(SkeletonLoader, { width: 120, height: 40 }));
    });
    const json = tree.toJSON() as any;
    expect(json).toBeDefined();
    // Check somewhere in the tree the dimensions are applied
    const styleStr = JSON.stringify(json?.props?.style ?? {});
    expect(styleStr).toContain('120');
    expect(styleStr).toContain('40');
  });
});

// ─── Source file static checks ────────────────────────────────────────────────

describe('SkeletonLoader — FR5: source file class strings and animation', () => {
  let source: string;
  let code: string; // source with comments stripped

  beforeAll(() => {
    source = fs.readFileSync(SKELETON_LOADER_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC5.2 — source imports timingSmooth from reanimated-presets', () => {
    expect(source).toContain('timingSmooth');
  });

  it('SC5.2 — source uses timingSmooth in withTiming call', () => {
    expect(source).toMatch(/withTiming\s*\([^)]*timingSmooth[^)]*\)/);
  });

  it('SC5.3 — source uses withRepeat for looping animation', () => {
    expect(source).toContain('withRepeat');
  });

  it('SC5.3 — withRepeat uses reverse=true for ping-pong effect', () => {
    // withRepeat(withTiming(...), -1, true) — third arg is reverse
    expect(source).toMatch(/withRepeat\s*\([\s\S]{0,200}true\s*\)/);
  });

  it('SC5.4 — source contains rounded-full class string (for rounded=true)', () => {
    expect(source).toContain('rounded-full');
  });

  it('SC5.5 — source contains rounded-lg class string (default, rounded=false)', () => {
    expect(source).toContain('rounded-lg');
  });

  it('SC5.7 — source initializes useSharedValue with 0.5 for opacity', () => {
    expect(source).toMatch(/useSharedValue\s*\(\s*0\.5\s*\)/);
  });

  it('SC5.8 — code does not use StyleSheet.create (outside comments)', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('SC5.8 — code does not import StyleSheet (outside comments)', () => {
    expect(code).not.toMatch(/\bStyleSheet\b/);
  });

  it('SC5.2 — source uses useAnimatedStyle for opacity animation', () => {
    expect(source).toContain('useAnimatedStyle');
  });

  it('SC5.1 — source contains bg-border class string', () => {
    expect(source).toContain('bg-border');
  });
});
