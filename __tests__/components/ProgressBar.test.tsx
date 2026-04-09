// Tests: src/components/ProgressBar.tsx (FR5 — animated NativeWind progress bar)
//
// Strategy: static source-file analysis for implementation constraints,
// runtime render assertions for crash-free behavior.
// ProgressBar is NativeWind-only (no Skia), so no Skia mock needed here.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const PROGRESS_BAR_FILE = path.resolve(__dirname, '../../src/components/ProgressBar.tsx');

// ---------------------------------------------------------------------------
// FR5 SC: Source-level assertions
// ---------------------------------------------------------------------------

describe('ProgressBar — FR5: source constraints', () => {
  it('FR5: src/components/ProgressBar.tsx exists', () => {
    expect(fs.existsSync(PROGRESS_BAR_FILE)).toBe(true);
  });

  it('FR5: source does NOT import from @shopify/react-native-skia (NativeWind only)', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).not.toContain('@shopify/react-native-skia');
  });

  it('FR5: source does NOT use StyleSheet.create()', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).not.toContain('StyleSheet.create(');
  });

  it('FR5: source imports timingChartFill from reanimated-presets', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('timingChartFill');
  });

  it('FR5: source uses withTiming (not withSpring) for animation', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('withTiming');
    expect(source).not.toContain('withSpring');
  });

  it('FR5: source uses useSharedValue for animation', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('useSharedValue');
  });

  it('FR5: source uses useAnimatedStyle for animated width', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('useAnimatedStyle');
  });

  it("FR5: colorClass defaults to 'bg-success'", () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('bg-success');
  });

  it('FR5: outer container uses bg-border track (source contains bg-border)', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('bg-border');
  });

  it('FR5: outer container uses rounded-full', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).toContain('rounded-full');
  });

  it('FR5: source does not contain hardcoded hex colors', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });

  it('FR5: height defaults to 4', () => {
    const source = fs.readFileSync(PROGRESS_BAR_FILE, 'utf8');
    // Default height = 4 should appear in the source
    expect(source).toMatch(/height.*=.*4|=\s*4[,\s)]/);
  });
});

// ---------------------------------------------------------------------------
// FR5 SC: Runtime render assertions
// ---------------------------------------------------------------------------

describe('ProgressBar — FR5: runtime render', () => {
  let ProgressBar: any;

  beforeAll(() => {
    ProgressBar = require('../../src/components/ProgressBar').default;
  });

  it('FR5: module exports a default function', () => {
    expect(ProgressBar).toBeDefined();
    expect(typeof ProgressBar).toBe('function');
  });

  it('FR5: renders without crashing with progress=0.5', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 0.5 }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with progress=0 (empty bar)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 0 }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with progress=1 (full bar)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 1 }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with explicit colorClass', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 0.7, colorClass: 'bg-warning' }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with explicit height', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 0.5, height: 8 }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with progress > 1 (clamp case)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: 1.5 }));
      });
    }).not.toThrow();
  });

  it('FR5: renders without crashing with progress < 0 (clamp case)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ProgressBar, { progress: -0.5 }));
      });
    }).not.toThrow();
  });
});
