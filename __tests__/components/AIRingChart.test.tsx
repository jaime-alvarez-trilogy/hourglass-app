// Tests: src/components/AIRingChart.tsx (FR4 — animated Skia concentric ring chart)
//
// Strategy: static source-file analysis for design constraints,
// runtime render assertions for crash-free behavior and edge cases.
// @shopify/react-native-skia is mocked via __mocks__/@shopify/react-native-skia.ts

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const AI_RING_FILE = path.resolve(__dirname, '../../src/components/AIRingChart.tsx');

// ---------------------------------------------------------------------------
// FR4 SC: Source-level assertions
// ---------------------------------------------------------------------------

describe('AIRingChart — FR4: source constraints', () => {
  it('FR4: src/components/AIRingChart.tsx exists', () => {
    expect(fs.existsSync(AI_RING_FILE)).toBe(true);
  });

  it('FR4: source imports from @/src/lib/colors', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toMatch(/from ['"]@\/src\/lib\/colors['"]/);
  });

  it('FR4: source imports timingChartFill', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('timingChartFill');
  });

  it('FR4: source uses withTiming (not withSpring)', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('withTiming');
    expect(source).not.toContain('withSpring');
  });

  it('FR4: source uses @shopify/react-native-skia Canvas', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
  });

  it('FR4: source uses Path for arc rendering', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('Path');
  });

  it('FR4: source uses colors.cyan for AI ring', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('cyan');
  });

  it('FR4: source uses colors.violet for BrainLift ring', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('violet');
  });

  it('FR4: source uses colors.border for track ring', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toContain('border');
  });

  it('FR4: source does NOT contain hardcoded hex colors', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });

  it('FR4: source does NOT use StyleSheet.create()', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).not.toContain('StyleSheet.create(');
  });

  it('FR4: strokeWidth defaults to 12', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toMatch(/strokeWidth.*=.*12|=\s*12[,\s)]/);
  });

  it('FR4: aiPercent is clamped (source contains Math.min/Math.max or clamp logic)', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toMatch(/Math\.min|Math\.max|clamp/);
  });

  it('FR4: component uses position relative wrapper (source has position.*relative)', () => {
    const source = fs.readFileSync(AI_RING_FILE, 'utf8');
    expect(source).toMatch(/relative/);
  });
});

// ---------------------------------------------------------------------------
// FR4 SC: Runtime render assertions
// ---------------------------------------------------------------------------

describe('AIRingChart — FR4: runtime render', () => {
  let AIRingChart: any;

  beforeAll(() => {
    AIRingChart = require('../../src/components/AIRingChart').default;
  });

  it('FR4: module exports a default function', () => {
    expect(AIRingChart).toBeDefined();
    expect(typeof AIRingChart).toBe('function');
  });

  it('FR4: renders without crashing — aiPercent=75, size=120', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, { aiPercent: 75, size: 120 }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing — aiPercent=0 (empty ring)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, { aiPercent: 0, size: 120 }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing — aiPercent=100 (full ring)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, { aiPercent: 100, size: 120 }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing — aiPercent > 100 (clamp case)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, { aiPercent: 150, size: 120 }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing with brainliftPercent provided (2 rings)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, {
          aiPercent: 75,
          brainliftPercent: 60,
          size: 120,
        }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing with brainliftPercent omitted (1 ring only)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, { aiPercent: 75, size: 120 }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing with explicit strokeWidth', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, {
          aiPercent: 75,
          size: 120,
          strokeWidth: 16,
        }));
      });
    }).not.toThrow();
  });

  it('FR4: renders without crashing — aiPercent=0, brainliftPercent=0', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AIRingChart, {
          aiPercent: 0,
          brainliftPercent: 0,
          size: 120,
        }));
      });
    }).not.toThrow();
  });
});
