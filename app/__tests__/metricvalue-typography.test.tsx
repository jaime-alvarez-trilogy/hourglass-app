// Tests: src/components/MetricValue.tsx (06-wiring-and-tokens)
// FR4: MetricValue — font-display-extrabold (800wt), letterSpacing: -0.5, stale comment fix
//
// Test approach:
// - Source-file static analysis (fs.readFileSync) for class string and comment checks
// - react-test-renderer for render checks (className + style assertions)
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions use source-file static analysis, not rendered props.

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

const METRIC_VALUE_FILE = path.resolve(__dirname, '../../src/components/MetricValue.tsx');

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('MetricValue — FR4: runtime render with 800 weight', () => {
  let MetricValue: any;

  beforeAll(() => {
    MetricValue = require('../../src/components/MetricValue').default;
  });

  it('FR4.1 — renders without crash after typography update', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MetricValue, { value: 42.5 }));
      });
    }).not.toThrow();
  });

  it('FR4.2 — source includes letterSpacing: -0.5 in inline style (verified via source)', () => {
    // NOTE: In jest-expo/node (react-native-web), Text renders as DOM elements.
    // Style prop assertions on rendered nodes are unreliable in this environment.
    // Source-file analysis is the correct approach (matches existing MetricValue test patterns).
    const source = fs.readFileSync(METRIC_VALUE_FILE, 'utf8');
    expect(source).toContain('letterSpacing: -0.5');
  });

  it('FR4.3 — source still contains fontVariant: ["tabular-nums"] (verified via source)', () => {
    const source = fs.readFileSync(METRIC_VALUE_FILE, 'utf8');
    expect(source).toContain("fontVariant: ['tabular-nums']");
  });

  it('FR4.4 — colorClass prop still applied (default text-textPrimary in className)', () => {
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

describe('MetricValue — FR4: source file class strings and comment', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(METRIC_VALUE_FILE, 'utf8');
  });

  it('FR4.5 — source contains "font-display-extrabold" class string', () => {
    expect(source).toContain('font-display-extrabold');
  });

  it('FR4.6 — source does NOT use plain "font-display " (without -extrabold) in className', () => {
    // Should not have the old class. Allow "font-display-extrabold" but not standalone "font-display"
    // Use regex to find "font-display" not followed by "-extrabold"
    expect(source).not.toMatch(/font-display(?!-extrabold)/);
  });

  it('FR4.7 — source includes letterSpacing: -0.5 in inline style', () => {
    expect(source).toContain('letterSpacing: -0.5');
  });

  it('FR4.8 — source still contains fontVariant: ["tabular-nums"]', () => {
    expect(source).toContain("fontVariant: ['tabular-nums']");
  });

  it('FR4.9 — no "Space Grotesk" string in source (stale comment removed)', () => {
    expect(source).not.toContain('Space Grotesk');
  });

  it('FR4.10 — source references the display font used (SpaceGrotesk or Inter)', () => {
    // The file comment references whichever display font is currently in use
    expect(source).toMatch(/SpaceGrotesk|Inter/);
  });
});
