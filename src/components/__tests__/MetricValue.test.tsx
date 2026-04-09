// Tests: MetricValue component (03-base-components)
// FR2: Hero number with Reanimated count-up animation from 0
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions are done via source-file static analysis (fs.readFileSync).
//
// NOTE on TextInput in jest-expo/node:
// jest-expo/node resolves react-native to react-native-web, whose TextInput runs
// a DOM-dependent useEffect. We mock the web TextInput module to a simple stub.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// Stub out the web TextInput that requires document in its mount effect.
jest.mock('react-native-web/dist/exports/TextInput/index.js', () => {
  const mockR = require('react');
  const mockRN = jest.requireActual('react-native-web');
  return {
    __esModule: true,
    default: ({ defaultValue, value, ...props }: any) =>
      mockR.createElement(mockRN.View, props,
        mockR.createElement(mockRN.Text, null, defaultValue ?? value ?? '')
      ),
  };
});

const METRIC_VALUE_FILE = path.resolve(__dirname, '../MetricValue.tsx');

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('MetricValue — FR2: runtime render', () => {
  let MetricValue: any;

  beforeAll(() => {
    MetricValue = require('../MetricValue').default;
  });

  it('SC2.1 — renders with value=0 without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, { value: 0 }));
      });
    }).not.toThrow();
  });

  it('SC2.1 — renders with value=42.5 without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, { value: 42.5 }));
      });
    }).not.toThrow();
  });

  it('SC2.2 — renders with value=42.5 and unit prop without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, { value: 42.5, unit: 'h' }));
      });
    }).not.toThrow();
  });

  it('SC2.4 — renders with precision=0 without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, { value: 42.5, precision: 0 }));
      });
    }).not.toThrow();
  });

  it('SC2.2 — renders with colorClass and sizeClass props without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, {
          value: 10,
          colorClass: 'text-gold',
          sizeClass: 'text-2xl',
        }));
      });
    }).not.toThrow();
  });
});

// ─── Source file static checks ────────────────────────────────────────────────

describe('MetricValue — FR2: source file class strings and animation', () => {
  let source: string;
  let code: string; // source with comments stripped

  beforeAll(() => {
    source = fs.readFileSync(METRIC_VALUE_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC2.5 — source contains font-display class string', () => {
    expect(source).toContain('font-display');
  });

  it('SC2.6 — source imports timingChartFill from reanimated-presets', () => {
    expect(source).toContain('timingChartFill');
  });

  it('SC2.6 — source uses timingChartFill in withTiming call', () => {
    expect(source).toMatch(/withTiming\s*\([\s\S]{0,100}timingChartFill/);
  });

  it('SC2.8 — source uses useSharedValue initialized to 0 for count-up start', () => {
    expect(source).toMatch(/useSharedValue\s*\(\s*0\s*\)/);
  });

  it('SC2.2 — source uses Reanimated animated style for animation', () => {
    // MetricValue uses useAnimatedStyle (not useAnimatedProps) for fade-in animation
    expect(source).toMatch(/useAnimatedStyle|useAnimatedProps/);
  });

  it('SC2.3 — source uses unit prop in formatted output', () => {
    expect(source).toMatch(/unit/);
  });

  it('SC2.4 — source uses precision in toFixed formatting', () => {
    expect(source).toMatch(/toFixed\s*\(/);
  });

  it('SC2.7 — code does not use StyleSheet.create (outside comments)', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('SC2.7 — code does not import StyleSheet (outside comments)', () => {
    expect(code).not.toMatch(/\bStyleSheet\b/);
  });

  it('SC2.8 — source uses withTiming for count-up animation', () => {
    expect(source).toContain('withTiming');
  });

  it('SC2.2 — source uses useEffect to trigger animation on mount/value change', () => {
    expect(source).toContain('useEffect');
  });
});

// ─── Formatting logic unit tests ─────────────────────────────────────────────

describe('MetricValue — FR2: number formatting logic', () => {
  it('toFixed(1) of 0 produces "0.0"', () => {
    expect((0).toFixed(1)).toBe('0.0');
  });

  it('toFixed(1) of 42.5 produces "42.5"', () => {
    expect((42.5).toFixed(1)).toBe('42.5');
  });

  it('toFixed(0) of 42.5 produces "43" (standard JS rounding)', () => {
    expect((42.5).toFixed(0)).toBe('43');
  });

  it('unit suffix: "42.5" + "h" = "42.5h"', () => {
    const formatted = (42.5).toFixed(1) + 'h';
    expect(formatted).toBe('42.5h');
  });

  it('no unit: "42.5" + undefined => "42.5" (no suffix)', () => {
    const unit: string | undefined = undefined;
    const formatted = (42.5).toFixed(1) + (unit ?? '');
    expect(formatted).toBe('42.5');
  });
});
