// Tests: ProgressBar component — 09-chart-visual-fixes FR6
//
// FR6: ProgressBar flex fill — verify flex two-child approach
//   SC6.1 — container has flexDirection: 'row' in source
//   SC6.2 — fill child uses animated flex value (fillFlex)
//   SC6.3 — spacer child uses complementary animated flex value (spaceFlex)
//   SC6.4 — fill child has violet color (bg-violet or inline colors.violet)
//   SC6.5 — fillFlex + spaceFlex = 1.0 invariant documented in source
//   SC6.6 — renders without crash with progress=0.72
//   SC6.7 — renders without crash with progress=0 (empty bar)
//   SC6.8 — renders without crash with progress=1 (full bar)
//   SC6.9 — renders without crash with progress > 1 (clamped)
//   SC6.10 — source uses clamp (Math.min/Math.max) for fillFraction
//
// Strategy:
// - Source-level static analysis for flex approach, color, clamping
// - react-test-renderer for crash safety

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── File path ────────────────────────────────────────────────────────────────

const COMPONENT_FILE = path.resolve(__dirname, '../ProgressBar.tsx');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderProgressBar(props: {
  progress: number;
  colorClass?: string;
  height?: number;
}) {
  const ProgressBar = require('@/src/components/ProgressBar').default;
  let tree: any;
  act(() => {
    tree = create(React.createElement(ProgressBar, props));
  });
  return tree;
}

// ─── Source-level checks ──────────────────────────────────────────────────────

describe('ProgressBar — 09FR6: flex two-child approach (source checks)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC6.1 — container has flexDirection: row', () => {
    expect(source).toMatch(/flexDirection\s*:\s*['"]row['"]/);
  });

  it('SC6.2 — fill child uses animated flex value (fillFlex)', () => {
    expect(source).toContain('fillFlex');
    expect(source).toMatch(/flex\s*:\s*fillFlex\.value|flex\s*:\s*fillFlex/);
  });

  it('SC6.3 — spacer child uses complementary animated flex value (spaceFlex)', () => {
    expect(source).toContain('spaceFlex');
    expect(source).toMatch(/flex\s*:\s*spaceFlex\.value|flex\s*:\s*spaceFlex/);
  });

  it('SC6.4 — fill child applies colorClass as NativeWind className', () => {
    // ProgressBar renders fill color via the colorClass prop applied as className.
    // Callers pass e.g. colorClass="bg-violet" — the component itself does not hardcode colors.
    expect(source).toMatch(/className=.*colorClass/);
  });

  it('SC6.5 — source uses Math.min and Math.max for clamping progress (0–1)', () => {
    expect(source).toMatch(/Math\.min[\s\S]{0,50}Math\.max|Math\.max[\s\S]{0,50}Math\.min/);
  });

  it('SC6.6 — source uses withTiming for animated fill transition', () => {
    expect(source).toContain('withTiming');
  });

  it('SC6.7 — spaceFlex is derived as 1 - fillFlex (complement)', () => {
    expect(source).toMatch(/1\s*-\s*clamped|withTiming\s*\(\s*1\s*-\s*clamped/);
  });
});

// ─── Render crash safety ──────────────────────────────────────────────────────

describe('ProgressBar — 09FR6: render crash safety', () => {
  it('SC6.8 — renders without crash for progress=0.72', () => {
    expect(() => renderProgressBar({ progress: 0.72 })).not.toThrow();
  });

  it('SC6.9 — renders without crash for progress=0', () => {
    expect(() => renderProgressBar({ progress: 0 })).not.toThrow();
  });

  it('SC6.10 — renders without crash for progress=1 (full bar)', () => {
    expect(() => renderProgressBar({ progress: 1 })).not.toThrow();
  });

  it('SC6.11 — renders without crash for progress > 1 (clamped to 1)', () => {
    expect(() => renderProgressBar({ progress: 1.5 })).not.toThrow();
  });

  it('SC6.12 — renders without crash for progress < 0 (clamped to 0)', () => {
    expect(() => renderProgressBar({ progress: -0.5 })).not.toThrow();
  });

  it('SC6.13 — renders without crash with colorClass="bg-violet"', () => {
    expect(() =>
      renderProgressBar({ progress: 0.5, colorClass: 'bg-violet' }),
    ).not.toThrow();
  });

  it('SC6.14 — renders without crash with custom height=5', () => {
    expect(() =>
      renderProgressBar({ progress: 0.5, height: 5 }),
    ).not.toThrow();
  });
});
