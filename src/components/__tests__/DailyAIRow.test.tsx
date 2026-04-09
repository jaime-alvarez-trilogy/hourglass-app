// Tests: DailyAIRow component (08-dark-glass-polish FR3)
// FR3: Row elevation — each row wrapped in semi-transparent glass surface
//   SC3.1 — row renders without crash
//   SC3.2 — date label, AI%, BrainLift columns rendered
//   SC3.3 — isToday styling applied (text-success, bg-surface)
//   SC3.4 — source uses glass wrapper: backgroundColor rgba(255,255,255,0.05)
//   SC3.5 — source uses glass border: borderColor rgba(255,255,255,0.10)
//   SC3.6 — source uses Skia Canvas for inner shadow (no BackdropFilter)
//   SC3.7 — Canvas gated on dims.w > 0 (no zero-size Canvas on first render)
//   SC3.8 — source uses onLayout to measure dims
//   SC3.9 — source does NOT use BackdropFilter (would SIGKILL inside GlassCard)
//
// Strategy:
// - Source-level checks for glass wrapper, Canvas, onLayout pattern
// - react-test-renderer for render validation + content checks

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Skia mock — Canvas, RoundedRect, LinearGradient (new deps from FR3)
jest.mock('@shopify/react-native-skia', () => {
  const mockReact = require('react');
  return {
    Canvas: ({ children, style }: any) =>
      mockReact.createElement('Canvas', { style }, children),
    RoundedRect: ({ children }: any) => children ?? null,
    LinearGradient: (_props: any) => null,
    vec: (x: number, y: number) => ({ x, y }),
    BlendMode: { Screen: 'screen' },
  };
});

// ─── File paths ───────────────────────────────────────────────────────────────

const COMPONENT_FILE = path.resolve(__dirname, '../DailyAIRow.tsx');

// ─── Module handles ───────────────────────────────────────────────────────────

let DailyAIRow: any;

beforeAll(() => {
  const mod = require('../DailyAIRow');
  DailyAIRow = mod.DailyAIRow;
});

// ─── Fixture data ─────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<{
  date: string;
  total: number;
  noTags: number;
  aiUsage: number;
  secondBrain: number;
  isToday: boolean;
}> = {}) {
  return {
    date: '2026-03-23',
    total: 30,
    noTags: 5,
    aiUsage: 15,
    secondBrain: 3,
    isToday: false,
    ...overrides,
  };
}

// ─── SC3.1: Render without crash ─────────────────────────────────────────────

describe('DailyAIRow — SC3.1: renders without crash', () => {
  it('SC3.1a — renders without crash with standard item', () => {
    expect(() => {
      act(() => {
        create(React.createElement(DailyAIRow, { item: makeItem() }));
      });
    }).not.toThrow();
  });

  it('SC3.1b — renders without crash for isToday=true', () => {
    expect(() => {
      act(() => {
        create(React.createElement(DailyAIRow, { item: makeItem({ isToday: true }) }));
      });
    }).not.toThrow();
  });

  it('SC3.1c — renders without crash when all slots are untagged (noTags=total)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(DailyAIRow, { item: makeItem({ noTags: 30, aiUsage: 0 }) }));
      });
    }).not.toThrow();
  });

  it('SC3.1d — renders without crash when secondBrain=0', () => {
    expect(() => {
      act(() => {
        create(React.createElement(DailyAIRow, { item: makeItem({ secondBrain: 0 }) }));
      });
    }).not.toThrow();
  });
});

// ─── SC3.2: Content rendered correctly ───────────────────────────────────────

describe('DailyAIRow — SC3.2: content rendered', () => {
  it('SC3.2a — renders a date label for the given date', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ date: '2026-03-23' }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    // "Sun 3/23" or similar format
    expect(json).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  });

  it('SC3.2b — renders AI% when tagged slots > 0 (not "—")', () => {
    let tree: any;
    act(() => {
      // total=30, noTags=5 → tagged=25, aiUsage=15 → 60%
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ total: 30, noTags: 5, aiUsage: 15 }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('60%');
  });

  it('SC3.2c — renders "—" for AI% when no tagged slots', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ total: 10, noTags: 10, aiUsage: 0 }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('—');
  });

  it('SC3.2d — renders BrainLift slots when secondBrain > 0', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ secondBrain: 3 }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('3 slots');
  });

  it('SC3.2e — renders "—" for BrainLift when secondBrain=0', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ secondBrain: 0 }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    // Find the second "—" (first for AI% would be if untagged, but here we have tagged slots)
    // With noTags=5, total=30: tagged=25, aiUsage=15 → "60%" for AI, "—" for BrainLift
    expect(json).toContain('—');
  });
});

// ─── SC3.3: isToday styling ───────────────────────────────────────────────────

describe('DailyAIRow — SC3.3: isToday conditional', () => {
  it('SC3.3a — "(today)" label appears when isToday=true', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ isToday: true }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('(today)');
  });

  it('SC3.3b — "(today)" label absent when isToday=false', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, { item: makeItem({ isToday: false }) }));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).not.toContain('(today)');
  });
});

// ─── SC3.4–SC3.9: Source-level glass wrapper checks ──────────────────────────

describe('DailyAIRow — SC3.4–SC3.9: glass wrapper (source checks)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC3.4 — source uses glass surface background: rgba(255,255,255,0.05)', () => {
    expect(source).toContain('rgba(255,255,255,0.05)');
  });

  it('SC3.5 — source uses glass border color: rgba(255,255,255,0.10)', () => {
    expect(source).toContain('rgba(255,255,255,0.10)');
  });

  it('SC3.6 — source uses Skia Canvas for inner shadow', () => {
    expect(source).toContain('Canvas');
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('SC3.7 — Canvas is gated on dims.w > 0 (prevents zero-size Canvas on first render)', () => {
    // Should have a condition like: dims.w > 0 && <Canvas...>
    expect(source).toMatch(/dims\.w\s*>\s*0/);
  });

  it('SC3.8 — source uses onLayout to capture row dimensions for Canvas', () => {
    expect(source).toContain('onLayout');
    expect(source).toMatch(/setDims|dims/);
  });

  it('SC3.9 — source does NOT import or use BackdropFilter (would SIGKILL when nested in GlassCard)', () => {
    // Remove comment lines before checking — BackdropFilter may appear in explanatory comments
    const codeOnly = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly).not.toContain('BackdropFilter');
    expect(codeOnly).not.toContain('BlurView');
  });

  it('SC3.10 — source uses RoundedRect for Skia inner shadow shape', () => {
    expect(source).toContain('RoundedRect');
  });

  it('SC3.11 — source imports StyleSheet from react-native (for absoluteFill)', () => {
    expect(source).toContain('StyleSheet');
    expect(source).toContain('absoluteFill');
  });

  it('SC3.12 — inner shadow top color uses rgba(0,0,0,0.40)', () => {
    expect(source).toContain('rgba(0,0,0,0.40)');
  });

  it('SC3.13 — wrapper has 8px border radius (ROW_RADIUS = 8)', () => {
    expect(source).toMatch(/ROW_RADIUS\s*=\s*8|borderRadius.*8|8.*borderRadius/);
  });

  it('SC3.14 — source imports LinearGradient from @shopify/react-native-skia', () => {
    expect(source).toContain('LinearGradient');
  });
});

// ─── FR (09-chart-visual-fixes FR4): DailyAIRow horizontal padding fix ───────
//
// SC-09FR4.1 — inner content View className contains px-4 (not px-1)
// SC-09FR4.2 — source does NOT contain px-1 on the inner content View

describe('DailyAIRow — 09FR4: horizontal padding px-4', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC-09FR4.1 — inner content View className contains px-4', () => {
    // The inner row content View must use px-4 (16px per side)
    expect(source).toMatch(/flex-row items-center[\s\S]{0,30}px-4/);
  });

  it('SC-09FR4.2 — source does NOT contain px-1 on the inner content flex-row View', () => {
    // px-1 was the old broken value (4px per side) — must be replaced
    expect(source).not.toMatch(/flex-row items-center[\s\S]{0,30}px-1[^0-9]/);
  });
});
