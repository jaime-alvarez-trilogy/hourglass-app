// Tests: OverviewStickyBar component — 01-sticky-bar
//
// FR1: Component file, exports (ScrubSnapshot, OverviewStickyBarProps, OverviewStickyBar)
// FR2: Picker state — 4W/12W/24W toggle pills
// FR3: Scrub state — week snapshot metrics with correct brand colors
// FR4: Visibility animation — own SharedValues, withSpring, pointerEvents
// FR5: overview.tsx integration — scroll tracking, floating placement, no panelStyle
//
// Strategy: source-file static analysis + smoke renders, matching the codebase pattern
// (DayPatternChart.test.tsx, WeeklyBarChart.test.tsx).

import React from 'react';
import renderer from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Reanimated mock (required for any file importing react-native-reanimated) ─

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = jest.fn();
  return Reanimated;
});

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const COMPONENT_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'OverviewStickyBar.tsx');
const OVERVIEW_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'overview.tsx');

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FULL_SCRUB_SNAPSHOT = {
  label: 'Week of Apr 14',
  earnings: '$2,340',
  hoursLabel: '38.5h',
  hoursColor: '#10B981',
  aiPct: '91%',
  brainlift: '5.2h',
};

// ─── FR1: Component file and exports ─────────────────────────────────────────

describe('FR1: OverviewStickyBar — file and exports', () => {
  it('SC1.1: file exists at src/components/OverviewStickyBar.tsx', () => {
    expect(fs.existsSync(COMPONENT_FILE)).toBe(true);
  });

  it('SC1.2: exports OverviewStickyBar as named export', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/export\s+function\s+OverviewStickyBar/);
  });

  it('SC1.3: exports ScrubSnapshot interface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/export\s+interface\s+ScrubSnapshot/);
  });

  it('SC1.4: exports OverviewStickyBarProps interface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/export\s+interface\s+OverviewStickyBarProps/);
  });

  it('SC1.5: props include window, onWindowChange, scrubSnapshot, visible', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/window\s*:/);
    expect(src).toMatch(/onWindowChange\s*:/);
    expect(src).toMatch(/scrubSnapshot\s*:/);
    expect(src).toMatch(/visible\s*:/);
  });
});

// ─── FR2: Picker state ────────────────────────────────────────────────────────

describe('FR2: OverviewStickyBar — picker state (4W/12W/24W toggle)', () => {
  it('SC2.1: source renders window options 4, 12, 24', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/\[4,\s*12,\s*24\]/);
  });

  it('SC2.2: active pill text uses colors.violet', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.violet/);
  });

  it('SC2.3: active pill background uses colors.surface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.surface[^E]/); // surface not surfaceElevated
  });

  it('SC2.4: inactive pill text uses colors.textMuted', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.textMuted/);
  });

  it('SC2.5: track uses colors.border as background', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.border/);
  });

  it('SC2.6: smoke — renders without crash (visible=true, scrubSnapshot=null)', () => {
    const { OverviewStickyBar } = require('../OverviewStickyBar');
    expect(() =>
      renderer.create(
        <OverviewStickyBar
          window={4}
          onWindowChange={jest.fn()}
          scrubSnapshot={null}
          visible={true}
        />
      )
    ).not.toThrow();
  });
});

// ─── FR3: Scrub state ─────────────────────────────────────────────────────────

describe('FR3: OverviewStickyBar — scrub state (week snapshot metrics)', () => {
  it('SC3.1: source uses colors.gold for earnings column', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.gold/);
  });

  it('SC3.2: source uses colors.cyan for AI% column', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.cyan/);
  });

  it('SC3.3: source uses colors.violet for BrainLift column', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/colors\.violet/);
  });

  it('SC3.4: source renders scrubSnapshot earnings and hours values', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/scrubSnapshot\.earnings/);
    expect(src).toMatch(/scrubSnapshot\.hoursLabel/);
  });

  it('SC3.5: smoke — renders without crash (visible=true, scrubSnapshot=FULL_SCRUB_SNAPSHOT)', () => {
    const { OverviewStickyBar } = require('../OverviewStickyBar');
    expect(() =>
      renderer.create(
        <OverviewStickyBar
          window={4}
          onWindowChange={jest.fn()}
          scrubSnapshot={FULL_SCRUB_SNAPSHOT}
          visible={true}
        />
      )
    ).not.toThrow();
  });

  it('SC3.6: smoke — renders without crash (visible=false, scrubSnapshot=null)', () => {
    const { OverviewStickyBar } = require('../OverviewStickyBar');
    expect(() =>
      renderer.create(
        <OverviewStickyBar
          window={12}
          onWindowChange={jest.fn()}
          scrubSnapshot={null}
          visible={false}
        />
      )
    ).not.toThrow();
  });
});

// ─── FR4: Visibility animation ────────────────────────────────────────────────

describe('FR4: OverviewStickyBar — visibility animation', () => {
  it('SC4.1: imports springSnappy from @/src/lib/reanimated-presets', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/springSnappy/);
    expect(src).toMatch(/reanimated-presets/);
  });

  it('SC4.2: source uses useSharedValue(0) for initial opacity', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/useSharedValue\s*\(\s*0\s*\)/);
  });

  it('SC4.3: source uses withSpring for animation', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/withSpring/);
  });

  it('SC4.4: source binds pointerEvents to visible prop', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/pointerEvents/);
    expect(src).toMatch(/visible/);
  });
});

// ─── FR5: overview.tsx integration ───────────────────────────────────────────

describe('FR5: overview.tsx — OverviewStickyBar integration', () => {
  it('SC5.1: overview.tsx imports OverviewStickyBar', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/import.*OverviewStickyBar.*from.*['"]@\/src\/components\/OverviewStickyBar['"]/);
  });

  it('SC5.2: overview.tsx adds onScroll to ScrollView (scroll tracking)', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/onScroll\s*=/);
  });

  it('SC5.3: overview.tsx contains heroCardBottomRef for threshold tracking', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/heroCardBottomRef/);
  });

  it('SC5.4: overview.tsx contains stickyBarVisible state', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/stickyBarVisible/);
  });

  it('SC5.5: overview.tsx does NOT contain panelStyle (removed)', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).not.toMatch(/panelStyle/);
  });

  it('SC5.6: overview.tsx renders <OverviewStickyBar', () => {
    const src = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(src).toMatch(/<OverviewStickyBar/);
  });
});
