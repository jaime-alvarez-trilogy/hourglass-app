// Tests: OverviewStickyBar component — 01-sticky-bar, 03-scope-toggle-ui
//
// FR1: Component file, exports (ScrubSnapshot, OverviewStickyBarProps, OverviewStickyBar)
// FR2: Picker state — 4W/12W/24W toggle pills
// FR3: Scrub state — week snapshot metrics with correct brand colors
// FR4: Visibility animation — own SharedValues, withSpring, pointerEvents
// FR5: overview.tsx integration — scroll tracking, floating placement, no panelStyle
//
// 03-scope-toggle-ui FR1: Display the Personal/Team/Org scope selector for eligible users
// 03-scope-toggle-ui FR2: Personal/Team scope selection + picker/scrub row collapse
// 03-scope-toggle-ui FR3: Org gating (orgTierEnabled) + backward-compatible props
//
// Strategy: source-file static analysis + smoke renders, matching the codebase pattern
// (DayPatternChart.test.tsx, WeeklyBarChart.test.tsx). Scope-row interaction tests use
// react-test-renderer's `act`/`root.findAll` to drive presses, matching
// ApprovalUrgencyCard.test.tsx's convention for invoking onPress handlers directly.

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import * as fs from 'fs';
import * as path from 'path';
import { colors } from '@/src/lib/colors';

// ─── Reanimated mock (required for any file importing react-native-reanimated) ─

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = jest.fn();
  return Reanimated;
});

import { OverviewStickyBar, type OverviewStickyBarProps } from '../OverviewStickyBar';

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

// ─── 03-scope-toggle-ui: shared helpers ──────────────────────────────────────

function renderBar(props: Partial<OverviewStickyBarProps> = {}) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      React.createElement(OverviewStickyBar, {
        window: 4,
        onWindowChange: jest.fn(),
        scrubSnapshot: null,
        visible: true,
        ...props,
      } as OverviewStickyBarProps)
    );
  });
  return tree!;
}

function jsonOf(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

/** Flattens a React Native `style` prop (object, array, or nested array/falsy mix) into one plain object. */
function flattenStyle(style: unknown): Record<string, any> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

/** Depth-first list of testID values in render order, for relative-position assertions. */
function testIdOrder(tree: renderer.ReactTestRenderer): string[] {
  const ids: string[] = [];
  const nodes = tree.root.findAll((node: any) => typeof node.props?.testID === 'string');
  for (const node of nodes) {
    ids.push(node.props.testID);
  }
  return ids;
}

// ─── 03-scope-toggle-ui FR1: Display the scope selector for eligible users ──

describe('03-scope-toggle-ui FR1: scope selector visibility and styling', () => {
  it('SC1: scope=undefined renders none of Personal/Team/Org', () => {
    const tree = renderBar();
    const json = jsonOf(tree);
    expect(json).not.toContain('Personal');
    expect(json).not.toContain('Team');
    expect(json).not.toContain('Org');
  });

  it('SC2: scope="personal" renders all three labels with Personal active', () => {
    const tree = renderBar({ scope: 'personal' });
    const json = jsonOf(tree);
    expect(json).toContain('Personal');
    expect(json).toContain('Team');
    expect(json).toContain('Org');

    const personalSegment = tree.root.findByProps({ testID: 'scope-segment-personal' });
    const personalText = personalSegment.findByType(Text);
    const personalTextStyle = flattenStyle(personalText.props.style);
    expect(personalTextStyle.color).toBe(colors.violet);

    const teamSegment = tree.root.findByProps({ testID: 'scope-segment-team' });
    const teamText = teamSegment.findByType(Text);
    const teamTextStyle = flattenStyle(teamText.props.style);
    expect(teamTextStyle.color).toBe(colors.textMuted);
  });

  it('SC3: scope="team" renders all three labels with Team active', () => {
    const tree = renderBar({ scope: 'team' });
    const json = jsonOf(tree);
    expect(json).toContain('Personal');
    expect(json).toContain('Team');
    expect(json).toContain('Org');

    const teamSegment = tree.root.findByProps({ testID: 'scope-segment-team' });
    const teamText = teamSegment.findByType(Text);
    const teamTextStyle = flattenStyle(teamText.props.style);
    expect(teamTextStyle.color).toBe(colors.violet);

    const personalSegment = tree.root.findByProps({ testID: 'scope-segment-personal' });
    const personalText = personalSegment.findByType(Text);
    const personalTextStyle = flattenStyle(personalText.props.style);
    expect(personalTextStyle.color).toBe(colors.textMuted);
  });

  it('SC4: scope row renders above (before) the picker/scrub row in render order', () => {
    const tree = renderBar({ scope: 'personal' });
    const order = testIdOrder(tree);
    const scopeIdx = order.indexOf('scope-row');
    const pickerIdx = order.indexOf('picker-scrub-row');
    expect(scopeIdx).toBeGreaterThanOrEqual(0);
    expect(pickerIdx).toBeGreaterThanOrEqual(0);
    expect(scopeIdx).toBeLessThan(pickerIdx);
  });

  it('SC5: active segment reuses the window-picker active-background token (colors.surfaceElevated)', () => {
    const tree = renderBar({ scope: 'personal' });
    const personalSegment = tree.root.findByProps({ testID: 'scope-segment-personal' });
    const flatStyle = flattenStyle(personalSegment.props.style);
    expect(flatStyle.backgroundColor).toBe(colors.surfaceElevated);
  });

  it('SC6: scope row track reuses colors.border for its background, and track/segment padding and radius match the window picker', () => {
    const tree = renderBar({ scope: 'personal' });
    const track = tree.root.findByProps({ testID: 'scope-track' });
    const trackStyle = flattenStyle(track.props.style);
    expect(trackStyle.backgroundColor).toBe(colors.border);
    // Window-picker track: borderRadius: 10, padding: 2 (OverviewStickyBar.tsx picker track).
    expect(trackStyle.borderRadius).toBe(10);
    expect(trackStyle.padding).toBe(2);

    const personalSegment = tree.root.findByProps({ testID: 'scope-segment-personal' });
    const segmentStyle = flattenStyle(personalSegment.props.style);
    // Window-picker active pill: borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4.
    expect(segmentStyle.borderRadius).toBe(8);
    expect(segmentStyle.paddingHorizontal).toBe(12);
    expect(segmentStyle.paddingVertical).toBe(4);
  });
});

// ─── 03-scope-toggle-ui FR2: Personal/Team selection + picker/scrub collapse ─

describe('03-scope-toggle-ui FR2: Personal/Team scope selection', () => {
  it('SC1: tapping Personal invokes onScopeChange("personal") exactly once', () => {
    const onScopeChange = jest.fn();
    const tree = renderBar({ scope: 'team', onScopeChange });
    const personalSegment = tree.root.findByProps({ testID: 'scope-segment-personal' });
    act(() => {
      personalSegment.props.onPress();
    });
    expect(onScopeChange).toHaveBeenCalledTimes(1);
    expect(onScopeChange).toHaveBeenCalledWith('personal');
  });

  it('SC2: tapping Team invokes onScopeChange("team") exactly once', () => {
    const onScopeChange = jest.fn();
    const tree = renderBar({ scope: 'personal', onScopeChange });
    const teamSegment = tree.root.findByProps({ testID: 'scope-segment-team' });
    act(() => {
      teamSegment.props.onPress();
    });
    expect(onScopeChange).toHaveBeenCalledTimes(1);
    expect(onScopeChange).toHaveBeenCalledWith('team');
  });

  it('SC3: scope="personal" keeps the picker/scrub row visible and interactive (pointerEvents="auto", full opacity)', () => {
    const tree = renderBar({ scope: 'personal' });
    const pickerRow = tree.root.findByProps({ testID: 'picker-scrub-row' });
    expect(pickerRow.props.pointerEvents).toBe('auto');
    const style = flattenStyle(pickerRow.props.style);
    expect(style.opacity === undefined || style.opacity === 1).toBe(true);
    // Height must not be collapsed: either unset (natural layout) or a positive value.
    expect(style.height === undefined || style.height > 0).toBe(true);
  });

  it('SC4: scope="team" collapses the picker/scrub row from both interaction (pointerEvents="none") and view (opacity 0, zero height)', () => {
    const tree = renderBar({ scope: 'team' });
    const pickerRow = tree.root.findByProps({ testID: 'picker-scrub-row' });
    expect(pickerRow.props.pointerEvents).toBe('none');
    const style = flattenStyle(pickerRow.props.style);
    expect(style.opacity).toBe(0);
    expect(style.height).toBe(0);
  });

  it('SC5: scope="org" also collapses the picker/scrub row from both interaction (pointerEvents="none") and view (opacity 0, zero height)', () => {
    const tree = renderBar({ scope: 'org', orgTierEnabled: true });
    const pickerRow = tree.root.findByProps({ testID: 'picker-scrub-row' });
    expect(pickerRow.props.pointerEvents).toBe('none');
    const style = flattenStyle(pickerRow.props.style);
    expect(style.opacity).toBe(0);
    expect(style.height).toBe(0);
  });

  it('SC6: window-picker 4W/12W/24W callback is unchanged regardless of scope', () => {
    const onWindowChange = jest.fn();
    const tree = renderBar({ scope: 'personal', window: 4, onWindowChange });
    const allTouchables = tree.root.findAll(
      (node: any) => node.type === TouchableOpacity,
      { deep: true }
    );
    const twelveWPill = allTouchables.find((n: any) => {
      const text = JSON.stringify(n.findAllByType(Text).map((t: any) => t.props.children));
      return text.includes('12W');
    });
    expect(twelveWPill).toBeDefined();
    act(() => {
      twelveWPill!.props.onPress();
    });
    expect(onWindowChange).toHaveBeenCalledTimes(1);
    expect(onWindowChange).toHaveBeenCalledWith(12);
  });
});

// ─── 03-scope-toggle-ui FR3: Org gating + backward compatibility ────────────

describe('03-scope-toggle-ui FR3: Org gating and backward compatibility', () => {
  it('SC1: existing OverviewStickyBar call sites compile/render without any new props', () => {
    expect(() => renderBar()).not.toThrow();
  });

  it('SC2: orgTierEnabled omitted renders Org dimmed and does not invoke onScopeChange on press', () => {
    const onScopeChange = jest.fn();
    const tree = renderBar({ scope: 'personal', onScopeChange });
    const orgSegment = tree.root.findByProps({ testID: 'scope-segment-org' });
    expect(orgSegment.props.disabled).toBe(true);
    const flatStyle = flattenStyle(orgSegment.props.style);
    expect(flatStyle.opacity).toBeLessThan(1);
    expect(() => orgSegment.props.onPress?.()).not.toThrow();
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it('SC3: orgTierEnabled=false renders Org dimmed and does not invoke onScopeChange on press', () => {
    const onScopeChange = jest.fn();
    const tree = renderBar({ scope: 'personal', orgTierEnabled: false, onScopeChange });
    const orgSegment = tree.root.findByProps({ testID: 'scope-segment-org' });
    expect(orgSegment.props.disabled).toBe(true);
    const flatStyle = flattenStyle(orgSegment.props.style);
    expect(flatStyle.opacity).toBeLessThan(1);
    expect(() => orgSegment.props.onPress?.()).not.toThrow();
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it('SC4: orgTierEnabled=true renders Org undimmed but still does not invoke onScopeChange', () => {
    const onScopeChange = jest.fn();
    const tree = renderBar({ scope: 'personal', orgTierEnabled: true, onScopeChange });
    const orgSegment = tree.root.findByProps({ testID: 'scope-segment-org' });
    // orgTierEnabled controls only the dimmed preview — Org stays disabled even when enabled.
    expect(orgSegment.props.disabled).toBe(true);
    const flatStyle = flattenStyle(orgSegment.props.style);
    expect(flatStyle.opacity === undefined || flatStyle.opacity === 1).toBe(true);
    expect(() => orgSegment.props.onPress?.()).not.toThrow();
    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it('SC5: Org segment never wires a functional onPress at the prop level, in any orgTierEnabled state', () => {
    const tree = renderBar({ scope: 'personal', orgTierEnabled: true });
    const orgSegment = tree.root.findByProps({ testID: 'scope-segment-org' });
    // The Org segment's onPress must be undefined/no-op at the prop level —
    // not merely gated by a runtime `disabled` flag — so even a direct,
    // RN-internals-bypassing invocation (as done here) cannot reach onScopeChange.
    expect(orgSegment.props.onPress).toBeUndefined();
  });

  it('SC6: existing window-picker and scrub cross-fade smoke tests pass unchanged with no scope props', () => {
    expect(() =>
      renderBar({ window: 12, scrubSnapshot: FULL_SCRUB_SNAPSHOT, visible: true })
    ).not.toThrow();
    const tree = renderBar({ window: 12, scrubSnapshot: null, visible: true });
    expect(jsonOf(tree)).not.toContain('Personal');
  });

  it('SC7 (type-level): onScopeChange signature rejects "org" — accepts only "personal" | "team"', () => {
    const onScopeChange: OverviewStickyBarProps['onScopeChange'] = jest.fn();
    // @ts-expect-error — 'org' is not assignable to the onScopeChange scope union ('personal' | 'team')
    onScopeChange?.('org');
    expect(onScopeChange).toHaveBeenCalled();
  });
});
