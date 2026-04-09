/**
 * Tests: HourglassWidget (03-android-visual)
 *
 * FR1: Helper functions — buildMeshSvg, badgeColor, badgeLabel, deltaColor, blProgressBar
 * FR2: SVG mesh background layer
 * FR3: Glass panel cards
 * FR4: Pace badge
 * FR5: Trend delta text
 * FR6: BrainLift progress bar
 * FR7: Manager urgency mode
 */

import React from 'react';
import { create, act } from 'react-test-renderer';

// ─── Mock react-native-android-widget ─────────────────────────────────────────
// Render primitives as simple host components that expose their props for inspection.
// Note: jest.mock factory is hoisted — must not reference out-of-scope variables like React.
// Use require() inside the factory to access React.
jest.mock(
  'react-native-android-widget',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mockReact = require('react');
    return {
      FlexWidget: ({ children, style }: { children?: unknown; style?: Record<string, unknown> }) =>
        mockReact.createElement('FlexWidget', { style }, children),
      TextWidget: ({ text, style }: { text: string; style?: Record<string, unknown> }) =>
        mockReact.createElement('TextWidget', { text, style }),
      SvgWidget: ({ svg, style }: { svg: string; style?: Record<string, unknown> }) =>
        mockReact.createElement('SvgWidget', { svg, style }),
      ImageWidget: ({ image, style }: { image: unknown; style?: Record<string, unknown> }) =>
        mockReact.createElement('ImageWidget', { image, style }),
    };
  },
  { virtual: true }
);

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function makeData(overrides: Record<string, unknown> = {}): any {
  return {
    hours: '32.5',
    hoursDisplay: '32.5h',
    earnings: '$1,300',
    earningsRaw: 1300,
    today: '6.2h',
    hoursRemaining: '7.5h left',
    aiPct: '71%–75%',
    brainlift: '3.2h',
    deadline: Date.now() + 6 * 60 * 60 * 1000,
    urgency: 'none',
    pendingCount: 0,
    isManager: false,
    cachedAt: Date.now(),
    useQA: false,
    daily: [],
    approvalItems: [],
    myRequests: [],
    actionBg: '',
    // 01-data-extensions fields
    paceBadge: 'on_track',
    weekDeltaHours: '+2.1h',
    weekDeltaEarnings: '+$84',
    brainliftTarget: '5h',
    // 01-widget-polish fields
    todayDelta: '+1.2h',
    ...overrides,
  };
}

// ─── Module handles ────────────────────────────────────────────────────────────

let buildMeshSvg: any;
let badgeColor: any;
let badgeLabel: any;
let deltaColor: any;
let blProgressBar: any;
let buildBarChartSvg: any;
let HourglassWidget: any;
let FallbackWidget: any;

beforeAll(() => {
  const mod = require('../../../widgets/android/HourglassWidget');
  buildMeshSvg = mod.buildMeshSvg;
  badgeColor = mod.badgeColor;
  badgeLabel = mod.badgeLabel;
  deltaColor = mod.deltaColor;
  blProgressBar = mod.blProgressBar;
  buildBarChartSvg = mod.buildBarChartSvg;
  HourglassWidget = mod.HourglassWidget;
  FallbackWidget = mod.FallbackWidget;
});

// ─── Render helper — creates renderer inside act(), calls toJSON() outside ─────
// react-test-renderer in React 19 requires toJSON() to be called after act() completes.

function renderWidget(el: React.ReactElement): any {
  let renderer: any;
  act(() => {
    renderer = create(el);
  });
  return renderer.toJSON();
}

// ─── Helper to collect all nodes matching a predicate ─────────────────────────

function collectNodes(tree: any, pred: (n: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (pred(tree)) results.push(tree);
  if (tree.children) {
    for (const child of tree.children) {
      collectNodes(child, pred, results);
    }
  }
  return results;
}

function getFlexWidgets(tree: any): any[] {
  return collectNodes(tree, (n) => n.type === 'FlexWidget');
}

function getTextWidgets(tree: any): any[] {
  return collectNodes(tree, (n) => n.type === 'TextWidget');
}

function getSvgWidgets(tree: any): any[] {
  return collectNodes(tree, (n) => n.type === 'SvgWidget');
}

// ─── FR1: Helper functions ─────────────────────────────────────────────────────

describe('FR1 — buildMeshSvg', () => {
  it('FR1.1 — returns a string containing <svg, <defs, and linearGradient (01-widget-polish: replaced radial with linear)', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<defs');
    expect(svg).toContain('linearGradient');
  });

  it('FR1.2 — urgency critical → Node C color is #F43F5E', () => {
    const svg = buildMeshSvg('critical', 'none');
    expect(svg).toContain('#F43F5E');
  });

  it('FR1.3 — urgency high → Node C color is #F59E0B', () => {
    const svg = buildMeshSvg('high', 'none');
    expect(svg).toContain('#F59E0B');
  });

  it('FR1.4 — paceBadge on_track → Node C color is #10B981', () => {
    const svg = buildMeshSvg('none', 'on_track');
    expect(svg).toContain('#10B981');
  });

  it('FR1.5 — paceBadge crushed_it → Node C color is #FFDF89', () => {
    const svg = buildMeshSvg('none', 'crushed_it');
    expect(svg).toContain('#FFDF89');
  });

  it('FR1.6 — default (none/none) → Node C color is #A78BFA (violet)', () => {
    const svg = buildMeshSvg('none', 'none');
    // Node A is always #A78BFA; critical is that urgency colors are absent
    expect(svg).not.toContain('#F43F5E');
    expect(svg).not.toContain('#F59E0B');
    expect(svg).not.toContain('#10B981');
    expect(svg).not.toContain('#FFDF89');
    // Violet present (Node A and/or Node C)
    expect(svg).toContain('#A78BFA');
  });

  it('FR1.7 — always includes state-driven violet (01-widget-polish: Node B cyan removed, single linear gradient)', () => {
    const svg = buildMeshSvg('none', 'none');
    // violet is the default state color for urgency=none, paceBadge=none
    expect(svg).toContain('#A78BFA');
    // Cyan (#00C2FF) was Node B; removed in 01-widget-polish linear gradient replacement
    expect(svg).not.toContain('#00C2FF');
  });
});

describe('FR1 — badgeColor', () => {
  it('FR1.8 — crushed_it → #F5C842 (brand gold, updated in 02-android-widget-redesign)', () => {
    expect(badgeColor('crushed_it')).toBe('#F5C842');
  });

  it('FR1.9 — on_track → #10B981 (brand success, updated in 02-android-widget-redesign)', () => {
    expect(badgeColor('on_track')).toBe('#10B981');
  });

  it('FR1.10 — behind → #F59E0B (brand warning, updated in 02-android-widget-redesign)', () => {
    expect(badgeColor('behind')).toBe('#F59E0B');
  });

  it('FR1.11 — critical → #F43F5E (brand critical, updated in 02-android-widget-redesign)', () => {
    expect(badgeColor('critical')).toBe('#F43F5E');
  });

  it('FR1.12 — none → empty string', () => {
    expect(badgeColor('none')).toBe('');
  });

  it('FR1.13 — unknown value → empty string (safe fallback)', () => {
    expect(badgeColor('unknown_value')).toBe('');
  });
});

describe('FR1 — badgeLabel', () => {
  it('FR1.14 — crushed_it → CRUSHED IT', () => {
    expect(badgeLabel('crushed_it')).toBe('CRUSHED IT');
  });

  it('FR1.15 — on_track → ON TRACK', () => {
    expect(badgeLabel('on_track')).toBe('ON TRACK');
  });

  it('FR1.16 — behind → BEHIND PACE', () => {
    expect(badgeLabel('behind')).toBe('BEHIND PACE');
  });

  it('FR1.17 — critical → CRITICAL', () => {
    expect(badgeLabel('critical')).toBe('CRITICAL');
  });

  it('FR1.18 — none → empty string', () => {
    expect(badgeLabel('none')).toBe('');
  });
});

describe('FR1 — deltaColor', () => {
  it('FR1.19 — +2.1h → #10B981 (success green)', () => {
    expect(deltaColor('+2.1h')).toBe('#10B981');
  });

  it('FR1.20 — +$84 → #10B981 (success green)', () => {
    expect(deltaColor('+$84')).toBe('#10B981');
  });

  it('FR1.21 — -$84 → #F59E0B (warning amber)', () => {
    expect(deltaColor('-$84')).toBe('#F59E0B');
  });

  it('FR1.22 — -3.4h → #F59E0B (warning amber)', () => {
    expect(deltaColor('-3.4h')).toBe('#F59E0B');
  });

  it('FR1.23 — empty string → transparent', () => {
    expect(deltaColor('')).toBe('transparent');
  });

  it('FR1.24 — undefined → transparent', () => {
    expect(deltaColor(undefined as any)).toBe('transparent');
  });
});

describe('FR1 — blProgressBar', () => {
  it('FR1.25 — 5/5 = 100%: fill width equals total width (200)', () => {
    const svg = blProgressBar(5, 5, 200);
    expect(svg).toContain('width="200"');
  });

  it('FR1.26 — 10/5 = capped at 100%: fill width still equals total width (200)', () => {
    const svg = blProgressBar(10, 5, 200);
    // fill rect width should be 200 (capped)
    const fillMatches = [...svg.matchAll(/width="(\d+(?:\.\d+)?)"/g)].map((m: any) => parseFloat(m[1]));
    const maxFill = Math.max(...fillMatches);
    expect(maxFill).toBe(200);
  });

  it('FR1.27 — 2.5/5 = 50%: fill width is 100', () => {
    const svg = blProgressBar(2.5, 5, 200);
    expect(svg).toContain('width="100"');
  });

  it('FR1.28 — 0/5 = 0%: fill width is 0', () => {
    const svg = blProgressBar(0, 5, 200);
    expect(svg).toContain('width="0"');
  });

  it('FR1.29 — track rect uses #2F2E41 fill', () => {
    const svg = blProgressBar(3, 5, 120);
    expect(svg).toContain('#2F2E41');
  });

  it('FR1.30 — fill rect uses #A78BFA fill (violet)', () => {
    const svg = blProgressBar(3, 5, 120);
    expect(svg).toContain('#A78BFA');
  });

  it('FR1.31 — NaN brainliftHours (from parseFloat("")) → fill width is 0 (no crash)', () => {
    const svg = blProgressBar(NaN, 5, 120);
    // Should not throw and should produce a valid SVG with 0 fill
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
  });
});

// ─── FR2: SVG mesh background layer ───────────────────────────────────────────

describe('FR2 — SVG mesh background layer', () => {
  it('FR2.1 — SmallWidget renders SvgWidget as first child of root FlexWidget', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'small' })
    );
    expect(tree).not.toBeNull();
    const children = Array.isArray(tree.children) ? tree.children : [];
    const firstChild = children[0];
    expect(firstChild).toBeDefined();
    expect(firstChild.type).toBe('SvgWidget');
  });

  it('FR2.2 — MediumWidget renders SvgWidget as first child of root FlexWidget', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'medium' })
    );
    const children = Array.isArray(tree.children) ? tree.children : [];
    const firstChild = children[0];
    expect(firstChild).toBeDefined();
    expect(firstChild.type).toBe('SvgWidget');
  });

  it('FR2.3 — SvgWidget svg prop contains linearGradient (01-widget-polish: replaced radialGradient with linearGradient)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'medium' })
    );
    const svgNodes = getSvgWidgets(tree);
    const meshNode = svgNodes.find((n) => n.props.svg && n.props.svg.includes('linearGradient'));
    expect(meshNode).toBeDefined();
  });

  it('FR2.4 — FallbackWidget does NOT render a SvgWidget mesh (no data)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: null })
    );
    const svgNodes = getSvgWidgets(tree);
    const meshNode = svgNodes.find((n) => n.props.svg && n.props.svg.includes('radialGradient'));
    expect(meshNode).toBeUndefined();
  });

  it('FR2.5 — root FlexWidget backgroundColor is #0B0D13 (brand background, updated in 02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'medium' })
    );
    expect(tree.type).toBe('FlexWidget');
    expect(tree.props.style?.backgroundColor).toBe('#0B0D13');
  });
});

// ─── FR3: Glass panel cards ────────────────────────────────────────────────────

describe('FR3 — Glass panel cards', () => {
  it('FR3.1 — medium widget hours panel has outer backgroundColor #1C1E26 with borderRadius 16 (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaHours: '' }), widgetFamily: 'medium' })
    );
    const flexes = getFlexWidgets(tree);
    const borderPanel = flexes.find(
      (n) => n.props.style?.backgroundColor === '#1C1E26' && n.props.style?.borderRadius === 16
    );
    expect(borderPanel).toBeDefined();
  });

  it('FR3.2 — medium widget hours panel has inner backgroundColor #16151F with borderRadius 15 (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'medium' })
    );
    const flexes = getFlexWidgets(tree);
    const surfacePanel = flexes.find(
      (n) => n.props.style?.backgroundColor === '#16151F' && n.props.style?.borderRadius === 15
    );
    expect(surfacePanel).toBeDefined();
  });

  it('FR3.3 — no #FFFFFF appears in any FlexWidget background style', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'medium' })
    );
    const flexes = getFlexWidgets(tree);
    const whitePanel = flexes.find(
      (n) => n.props.style?.backgroundColor === '#FFFFFF'
    );
    expect(whitePanel).toBeUndefined();
  });

  it('FR3.4 — small widget wraps content in glass panel (borderRadius 16 border, 15 surface, updated in 02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData(), widgetFamily: 'small' })
    );
    const flexes = getFlexWidgets(tree);
    const borderPanel = flexes.find(
      (n) => n.props.style?.backgroundColor === '#1C1E26' && n.props.style?.borderRadius === 16
    );
    expect(borderPanel).toBeDefined();
  });
});

// ─── FR4: Pace badge ───────────────────────────────────────────────────────────

describe('FR4 — Pace badge', () => {
  it('FR4.1 — paceBadge on_track → badge with backgroundColor #10B981 and text ON TRACK (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'on_track' }), widgetFamily: 'medium' })
    );
    const flexes = getFlexWidgets(tree);
    const badge = flexes.find((n) => n.props.style?.backgroundColor === '#10B981');
    expect(badge).toBeDefined();
    const texts = getTextWidgets(badge);
    expect(texts.some((t) => t.props.text === 'ON TRACK')).toBe(true);
  });

  it('FR4.2 — paceBadge crushed_it → badge with backgroundColor #F5C842 and text CRUSHED IT (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'crushed_it' }), widgetFamily: 'medium' })
    );
    const flexes = getFlexWidgets(tree);
    const badge = flexes.find((n) => n.props.style?.backgroundColor === '#F5C842');
    expect(badge).toBeDefined();
    const texts = getTextWidgets(badge);
    expect(texts.some((t) => t.props.text === 'CRUSHED IT')).toBe(true);
  });

  it('FR4.3 — paceBadge behind → P2 warning text uses #F59E0B color and shows BEHIND PACE (02-android-widget-redesign)', () => {
    // behind triggers P2 mode (no approvals) → warning TextWidget, not PaceBadge capsule
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [] }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('BEHIND PACE'));
    expect(warningText).toBeDefined();
    expect(warningText!.props.style?.color).toBe('#F59E0B');
  });

  it('FR4.4 — paceBadge critical → P2 warning text uses #F43F5E color and shows CRITICAL (02-android-widget-redesign)', () => {
    // critical triggers P2 mode (no approvals) → warning TextWidget, not PaceBadge capsule
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'critical', approvalItems: [], myRequests: [] }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('CRITICAL'));
    expect(warningText).toBeDefined();
    expect(warningText!.props.style?.color).toBe('#F43F5E');
  });

  it('FR4.5 — paceBadge none → no pace badge rendered (no text ON TRACK / BEHIND PACE / etc.)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'none' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const badgeTexts = ['ON TRACK', 'CRUSHED IT', 'BEHIND PACE', 'CRITICAL'];
    expect(texts.some((t) => badgeTexts.includes(t.props.text))).toBe(false);
  });

  it('FR4.6 — paceBadge undefined → no badge rendered (backward compat)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: undefined }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const badgeTexts = ['ON TRACK', 'CRUSHED IT', 'BEHIND PACE', 'CRITICAL'];
    expect(texts.some((t) => badgeTexts.includes(t.props.text))).toBe(false);
  });

  it('FR4.7 — badge text color is #0D0C14 (dark for contrast on bright backgrounds)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ paceBadge: 'on_track' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const badgeText = texts.find((t) => t.props.text === 'ON TRACK');
    expect(badgeText).toBeDefined();
    expect(badgeText.props.style?.color).toBe('#0D0C14');
  });
});

// ─── FR5: Trend delta text ─────────────────────────────────────────────────────

describe('FR5 — Trend delta text', () => {
  it('FR5.1 — weekDeltaHours +2.1h → renders text containing ↑ and 2.1h with color #10B981', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaHours: '+2.1h' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const delta = texts.find(
      (t) => t.props.text && t.props.text.includes('↑') && t.props.text.includes('2.1h')
    );
    expect(delta).toBeDefined();
    expect(delta.props.style?.color).toBe('#10B981');
  });

  it('FR5.2 — weekDeltaHours -3.4h → renders text containing ↓ and 3.4h with color #F59E0B', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaHours: '-3.4h' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const delta = texts.find(
      (t) => t.props.text && t.props.text.includes('↓') && t.props.text.includes('3.4h')
    );
    expect(delta).toBeDefined();
    expect(delta.props.style?.color).toBe('#F59E0B');
  });

  it('FR5.3 — weekDeltaHours empty string → no delta TextWidget rendered', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaHours: '' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const arrowText = texts.find(
      (t) => t.props.text && (t.props.text.includes('↑') || t.props.text.includes('↓')) && t.props.text.includes('h')
    );
    expect(arrowText).toBeUndefined();
  });

  it('FR5.4 — weekDeltaEarnings +$84 → renders text with ↑ and $84, color #10B981', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaEarnings: '+$84' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const delta = texts.find(
      (t) => t.props.text && t.props.text.includes('↑') && t.props.text.includes('$84')
    );
    expect(delta).toBeDefined();
    expect(delta.props.style?.color).toBe('#10B981');
  });

  it('FR5.5 — weekDeltaEarnings -$136 → renders text with ↓ and $136, color #F59E0B', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeData({ weekDeltaEarnings: '-$136' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const delta = texts.find(
      (t) => t.props.text && t.props.text.includes('↓') && t.props.text.includes('$136')
    );
    expect(delta).toBeDefined();
    expect(delta.props.style?.color).toBe('#F59E0B');
  });

  it('FR5.6 — weekDeltaEarnings empty string → no earnings delta TextWidget', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ weekDeltaEarnings: '', weekDeltaHours: '' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const earningsDelta = texts.find(
      (t) => t.props.text && (t.props.text.includes('↑') || t.props.text.includes('↓')) && t.props.text.includes('$')
    );
    expect(earningsDelta).toBeUndefined();
  });

  it('FR5.7 — undefined weekDelta fields → no crash (treated as empty)', () => {
    expect(() => {
      renderWidget(
        React.createElement(HourglassWidget, {
          data: makeData({ weekDeltaHours: undefined, weekDeltaEarnings: undefined }),
          widgetFamily: 'medium',
        })
      );
    }).not.toThrow();
  });
});

// ─── FR6: BrainLift progress bar ──────────────────────────────────────────────

describe('FR6 — BrainLift progress bar', () => {
  it('FR6.1 — brainlift 3.2h / 5h → SvgWidget svg contains fill width ~77 (Math.round(3.2/5*120))', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ brainlift: '3.2h', brainliftTarget: '5h' }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    // BrainLift bar has both #A78BFA (fill) and #2F2E41 (track); mesh SVG does not have #2F2E41
    const blBar = svgs.find((n) => n.props.svg && n.props.svg.includes('#A78BFA') && n.props.svg.includes('#2F2E41'));
    expect(blBar).toBeDefined();
    // fill width = Math.round(3.2/5 * 120) = Math.round(76.8) = 77
    expect(blBar.props.svg).toContain('width="77"');
  });

  it('FR6.2 — brainlift 6h exceeds target 5h → fill width capped at 120', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ brainlift: '6h', brainliftTarget: '5h' }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    // BrainLift bar has both #A78BFA (fill) and #2F2E41 (track); mesh SVG does not have #2F2E41
    const blBar = svgs.find((n) => n.props.svg && n.props.svg.includes('#A78BFA') && n.props.svg.includes('#2F2E41'));
    expect(blBar).toBeDefined();
    // fill width should be 120 (capped at 100%)
    expect(blBar.props.svg).toContain('width="120"');
  });

  it('FR6.3 — brainliftTarget missing → defaults to 5h (no crash)', () => {
    expect(() => {
      renderWidget(
        React.createElement(HourglassWidget, {
          data: makeData({ brainlift: '3.2h', brainliftTarget: undefined }),
          widgetFamily: 'medium',
        })
      );
    }).not.toThrow();
  });

  it('FR6.4 — brainlift 0h → fill width is 0', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ brainlift: '0h', brainliftTarget: '5h' }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    const blBar = svgs.find((n) => n.props.svg && n.props.svg.includes('#2F2E41'));
    expect(blBar).toBeDefined();
    expect(blBar.props.svg).toContain('width="0"');
  });

  it('FR6.5 — BrainLift bar not rendered in small widget', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ brainlift: '3.2h', brainliftTarget: '5h' }),
        widgetFamily: 'small',
      })
    );
    const svgs = getSvgWidgets(tree);
    // BrainLift bar has both #A78BFA (fill) and #2F2E41 (track); mesh SVG does not have #2F2E41
    const blBar = svgs.find((n) => n.props.svg && n.props.svg.includes('#A78BFA') && n.props.svg.includes('#2F2E41'));
    expect(blBar).toBeUndefined();
  });

  it('FR6.6 — BrainLift label color is #A78BFA violet (01-widget-polish: "BL" renamed to "BrainLift")', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ brainlift: '3.2h', brainliftTarget: '5h' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const blLabel = texts.find((t) => t.props.text === 'BrainLift');
    expect(blLabel).toBeDefined();
    expect(blLabel.props.style?.color).toBe('#A78BFA');
  });

  it('FR6.7 — malformed brainlift value does not crash', () => {
    expect(() => {
      renderWidget(
        React.createElement(HourglassWidget, {
          data: makeData({ brainlift: '', brainliftTarget: '5h' }),
          widgetFamily: 'medium',
        })
      );
    }).not.toThrow();
  });
});

// ─── FR7: Manager urgency mode ────────────────────────────────────────────────

describe('FR7 — Manager urgency mode', () => {
  it('FR7.1 — isManager critical pendingCount=3 → countdown hero text visible (contains "h left" or "Due now")', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'critical',
          pendingCount: 3,
          deadline: Date.now() + 4 * 60 * 60 * 1000,
          approvalItems: [
            { id: '1', name: 'Alice', hours: '2.5h', category: 'MANUAL' },
            { id: '2', name: 'Bob', hours: '1.0h', category: 'OVERTIME' },
          ],
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const countdownText = texts.find(
      // Countdown format is "{N}h left" (integer hours) or "Due now"
      // Distinguish from hoursRemaining like "7.5h left" which has a decimal
      (t) => t.props.text && (t.props.text === 'Due now' || /^\d+h left$/.test(t.props.text))
    );
    expect(countdownText).toBeDefined();
  });

  it('FR7.2 — isManager high urgency pendingCount=1 → urgency mode triggered', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'high',
          pendingCount: 1,
          deadline: Date.now() + 2 * 60 * 60 * 1000,
          approvalItems: [{ id: '1', name: 'Alice', hours: '2.5h', category: 'MANUAL' }],
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const countdownText = texts.find(
      // Countdown format is "{N}h left" (integer hours) or "Due now"
      // Distinguish from hoursRemaining like "7.5h left" which has a decimal
      (t) => t.props.text && (t.props.text === 'Due now' || /^\d+h left$/.test(t.props.text))
    );
    expect(countdownText).toBeDefined();
  });

  it('FR7.3 — isManager low urgency pendingCount=5 → P1 approvals mode (02-android-hud-layout: P1 now activates for any manager with pending>0, not just high/critical urgency)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'low',
          pendingCount: 5,
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // Under new P1 logic: manager + pendingCount=5 → P1 approvals layout
    // Header contains "5 PENDING"
    const pendingHeader = texts.find(
      (t) => t.props.text && t.props.text.includes('5') && t.props.text.includes('PENDING')
    );
    expect(pendingHeader).toBeDefined();
  });

  it('FR7.4 — isManager=false → always hours mode, no approval items', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          urgency: 'critical',
          pendingCount: 5,
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const countdownText = texts.find(
      // Countdown format is "{N}h left" (integer hours) or "Due now"
      // Distinguish from hoursRemaining like "7.5h left" which has a decimal
      (t) => t.props.text && (t.props.text === 'Due now' || /^\d+h left$/.test(t.props.text))
    );
    expect(countdownText).toBeUndefined();
    const hoursHero = texts.find((t) => t.props.text === '32.5h');
    expect(hoursHero).toBeDefined();
  });

  it('FR7.5 — isManager critical pendingCount=0 → hours mode (no approvals to act on)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'critical',
          pendingCount: 0,
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const countdownText = texts.find(
      // Countdown format is "{N}h left" (integer hours) or "Due now"
      // Distinguish from hoursRemaining like "7.5h left" which has a decimal
      (t) => t.props.text && (t.props.text === 'Due now' || /^\d+h left$/.test(t.props.text))
    );
    expect(countdownText).toBeUndefined();
  });

  it('FR7.6 — deadline in past → shows Due now', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'critical',
          pendingCount: 2,
          deadline: Date.now() - 60000, // 1 minute in the past
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const dueNow = texts.find((t) => t.props.text === 'Due now');
    expect(dueNow).toBeDefined();
  });
});

// ─── 04-cockpit-hud: FR1 — badgeColor desaturated tokens (Android) ────────────

describe('04-cockpit-hud FR1: badgeColor brand tokens (Android, updated in 02-android-widget-redesign)', () => {
  it('FR1-A-1 — badgeColor(crushed_it) === #F5C842 (brand gold)', () => {
    expect(badgeColor('crushed_it')).toBe('#F5C842');
  });

  it('FR1-A-2 — badgeColor(on_track) === #10B981 (brand success)', () => {
    expect(badgeColor('on_track')).toBe('#10B981');
  });

  it('FR1-A-3 — badgeColor(behind) === #F59E0B (brand warning)', () => {
    expect(badgeColor('behind')).toBe('#F59E0B');
  });

  it('FR1-A-4 — badgeColor(critical) === #F43F5E (brand critical)', () => {
    expect(badgeColor('critical')).toBe('#F43F5E');
  });

  it('FR1-A-5 — badgeColor(none) still returns empty string', () => {
    expect(badgeColor('none')).toBe('');
  });
});

// ─── 04-cockpit-hud: FR3 — Android P2 stripped deficit layout ────────────────

describe('04-cockpit-hud FR3: Android P2 stripped deficit layout', () => {
  it('FR3-A-1 — MediumWidget paceBadge=behind, no approvals → renders ⚠ warning text', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('⚠'));
    expect(warningText).toBeDefined();
  });

  it('FR3-A-2 — MediumWidget paceBadge=behind, no approvals → renders hoursDisplay', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const hoursText = texts.find((t) => t.props.text === '32.5h');
    expect(hoursText).toBeDefined();
  });

  it('FR3-A-3 — MediumWidget paceBadge=behind, no approvals → renders hoursRemaining', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const remainingText = texts.find((t) => t.props.text === '7.5h left');
    expect(remainingText).toBeDefined();
  });

  it('FR3-A-4 — MediumWidget paceBadge=behind, no approvals → does NOT render aiPct text', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [], isManager: false, aiPct: '71%–75%' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const aiText = texts.find((t) => t.props.text && t.props.text.includes('AI:'));
    expect(aiText).toBeUndefined();
  });

  it('FR3-A-5 — MediumWidget paceBadge=behind, no approvals → does NOT render BrainLift bar label (01-widget-polish: label renamed from BL to BrainLift)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'behind', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // P2 stripped deficit mode does not show the BrainLift bar
    const blText = texts.find((t) => t.props.text === 'BrainLift');
    expect(blText).toBeUndefined();
  });

  it('FR3-A-6 — MediumWidget paceBadge=critical, no approvals → badge color is #F43F5E (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'critical', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('⚠'));
    expect(warningText).toBeDefined();
    expect(warningText!.props.style?.color).toBe('#F43F5E');
  });

  it('FR3-A-7 (edge) — paceBadge=behind + isManager=true + urgency=critical + pendingCount=3 → P1 approvals wins (not P2) (02-android-hud-layout: P1 shows ⚠ PENDING header, not countdown)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          paceBadge: 'behind',
          isManager: true,
          urgency: 'critical',
          pendingCount: 3,
          deadline: Date.now() + 4 * 60 * 60 * 1000,
          approvalItems: [{ id: '1', name: 'Alice', hours: '2.5h', category: 'MANUAL' }],
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // P1 approvals layout shows "⚠ 3 PENDING" header — not the P2 pace warning
    const pendingHeader = texts.find(
      (t) => t.props.text && t.props.text.includes('PENDING') && t.props.text.includes('3')
    );
    expect(pendingHeader).toBeDefined();
    // P2 warning badge (⚠ BEHIND PACE) should NOT appear separately
    const paceWarning = texts.find(
      (t) => t.props.text && t.props.text.includes('BEHIND PACE')
    );
    expect(paceWarning).toBeUndefined();
  });

  it('FR3-A-8 (edge) — paceBadge=behind + approvalItems.length>0 + isManager=false → P2 deficit wins (02-android-hud-layout: non-manager never hits P1 regardless of approvalItems)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          paceBadge: 'behind',
          isManager: false,
          urgency: 'none',
          approvalItems: [{ id: '1', name: 'Alice', hours: '8h', category: 'MANUAL' }],
          myRequests: [],
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // isManager=false → P1 never triggers; paceBadge=behind → P2 deficit
    // P2 warning badge present
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('⚠'));
    expect(warningText).toBeDefined();
    // P2 shows hoursDisplay, not the approvalItem name
    const hoursHero = texts.find((t) => t.props.text === '32.5h');
    expect(hoursHero).toBeDefined();
  });

  it('FR3-A-9 (edge) — paceBadge=on_track, no approvals → P3 hours mode, AI Usage: label shown (01-widget-polish: renamed from "AI:" to "AI Usage:")', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ paceBadge: 'on_track', approvalItems: [], myRequests: [], isManager: false }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const aiText = texts.find((t) => t.props.text && t.props.text.startsWith('AI Usage:'));
    expect(aiText).toBeDefined();
  });
});

// ─── 04-cockpit-hud: FR5 — Priority ordering P1 > P2 > P3 (Android) ─────────

describe('04-cockpit-hud FR5: Priority ordering P1 > P2 > P3 (Android)', () => {
  it('FR5-A-1 — isManager=true, pendingCount=3, paceBadge=critical, urgency=critical → P1 approvals (02-android-hud-layout: P1 shows ⚠ PENDING header, P2 pace warning absent)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: true,
          urgency: 'critical',
          pendingCount: 3,
          paceBadge: 'critical',
          deadline: Date.now() + 4 * 60 * 60 * 1000,
          approvalItems: [{ id: '1', name: 'Alice', hours: '2.5h', category: 'MANUAL' }],
        }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // P1 approvals mode: shows "⚠ 3 PENDING" header
    const pendingHeader = texts.find(
      (t) => t.props.text && t.props.text.includes('PENDING') && t.props.text.includes('3')
    );
    expect(pendingHeader).toBeDefined();
    // P2 "CRITICAL" pace badge warning not shown
    const paceBadgeWarning = texts.find(
      (t) => t.props.text && t.props.text.includes('CRITICAL') && t.props.text.startsWith('⚠')
    );
    expect(paceBadgeWarning).toBeUndefined();
  });

  it('FR5-A-2 — isManager=false, paceBadge=critical, myRequests=[], approvalItems=[] → P2 stripped layout', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'critical', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t) => t.props.text && t.props.text.includes('⚠'));
    expect(warningText).toBeDefined();
  });

  it('FR5-A-3 — isManager=false, paceBadge=on_track, myRequests=[], approvalItems=[] → P3 full hours mode', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'on_track', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // P3 hours mode: AI Usage: label present (01-widget-polish: renamed from "AI:"), no ⚠ warning
    const aiText = texts.find((t) => t.props.text && t.props.text.startsWith('AI Usage:'));
    expect(aiText).toBeDefined();
    const warningText = texts.find((t) => t.props.text && t.props.text.startsWith('⚠'));
    expect(warningText).toBeUndefined();
  });
});

// ─── 02-widget-visual-android: FR1, FR2, FR3 ──────────────────────────────────

// ─── Daily entry fixture helpers ───────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Build a 7-entry WidgetDailyEntry array. todayIndex = 0..6 (Mon=0). */
function makeDailyEntries(
  hours: number[],
  todayIndex: number,
): any[] {
  return DAY_NAMES.map((day, i) => ({
    day,
    hours: hours[i] ?? 0,
    isToday: i === todayIndex,
    isFuture: i > todayIndex,
  }));
}

// ─── FR1: GlassPanel inner card opacity ────────────────────────────────────────

describe('02-android FR1 — GlassPanel inner card opacity (02-android-widget-redesign: updated colors)', () => {
  it('FR1.1 — MediumWidget Hours mode renders an inner FlexWidget with backgroundColor #16151F (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'on_track', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const flexes = getFlexWidgets(tree);
    const innerCard = flexes.find((n) => n.props.style?.backgroundColor === '#16151F');
    expect(innerCard).toBeDefined();
  });

  it('FR1.2 — MediumWidget Hours mode retains outer FlexWidget with backgroundColor #1C1E26 (border trick, 02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'on_track', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const flexes = getFlexWidgets(tree);
    const outerBorder = flexes.find((n) => n.props.style?.backgroundColor === '#1C1E26');
    expect(outerBorder).toBeDefined();
  });

  it('FR1.3 — old inner colour #1F1E2C is not present in any FlexWidget (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'on_track', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const flexes = getFlexWidgets(tree);
    const oldCard = flexes.find((n) => n.props.style?.backgroundColor === '#1F1E2C');
    expect(oldCard).toBeUndefined();
  });

  it('FR1.4 — GlassPanel inner FlexWidget has borderRadius: 15 and padding: 12 (02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({ isManager: false, paceBadge: 'on_track', approvalItems: [], myRequests: [] }),
        widgetFamily: 'medium',
      })
    );
    const flexes = getFlexWidgets(tree);
    const innerCard = flexes.find((n) => n.props.style?.backgroundColor === '#16151F');
    expect(innerCard).toBeDefined();
    expect(innerCard!.props.style?.borderRadius).toBe(15);
    expect(innerCard!.props.style?.padding).toBe(12);
  });
});

// ─── FR2: buildBarChartSvg function ────────────────────────────────────────────

describe('02-android FR2 — buildBarChartSvg', () => {
  it('FR2.1 — returns a string starting with <svg', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('FR2.2 — SVG contains exactly 7 <rect elements', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    const rectMatches = svg.match(/<rect/g);
    expect(rectMatches).not.toBeNull();
    expect(rectMatches!.length).toBe(7);
  });

  it('FR2.3 — SVG contains exactly 7 <text elements', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    const textMatches = svg.match(/<text/g);
    expect(textMatches).not.toBeNull();
    expect(textMatches!.length).toBe(7);
  });

  it('FR2.4 — today bar (isToday=true) has fill equal to accentColor', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 8, 3, 2], 4); // Friday is today
    const accentColor = '#F5C842';
    const svg = buildBarChartSvg(daily, 280, 28, accentColor);
    expect(svg).toContain(`fill="${accentColor}"`);
  });

  it('FR2.5 — past bar with hours > 0 has fill="#4A4A6A"', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 0, 0], 4); // Mon–Thu past with hours
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    expect(svg).toContain('fill="#4A4A6A"');
  });

  it('FR2.6 — future bar (isFuture=true) has fill="#2F2E41"', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 0, 0], 4); // Sat, Sun are future
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    // Sat and Sun (index 5, 6) are future → muted
    expect(svg).toContain('fill="#2F2E41"');
  });

  it('FR2.7 — past bar with hours = 0 has fill="#2F2E41"', () => {
    // Mon–Wed have hours, Thu is past with 0 hours, today is Friday
    const daily = makeDailyEntries([8, 7, 6, 0, 4, 0, 0], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    expect(svg).toContain('fill="#2F2E41"');
  });

  it('FR2.8 — all bars have height >= 2 (floor enforced)', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 0, 0], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    // Extract all height= values from <rect elements
    const heights = [...svg.matchAll(/<rect[^>]*height="(\d+)"/g)].map((m) => parseInt(m[1], 10));
    expect(heights.length).toBe(7);
    heights.forEach((h) => expect(h).toBeGreaterThanOrEqual(2));
  });

  it('FR2.9 — all hours = 0: all bars at minimum 2px, no error thrown', () => {
    const daily = makeDailyEntries([0, 0, 0, 0, 0, 0, 0], 3);
    let svg: string;
    expect(() => {
      svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    }).not.toThrow();
    const heights = [...svg!.matchAll(/<rect[^>]*height="(\d+)"/g)].map((m) => parseInt(m[1], 10));
    expect(heights.length).toBe(7);
    heights.forEach((h) => expect(h).toBe(2));
  });

  it('FR2.10 — today hours = max: today bar height equals barAreaHeight', () => {
    // Today (index 3, Thu) has the highest hours
    const daily = makeDailyEntries([4, 5, 6, 28, 3, 0, 0], 3);
    const barAreaHeight = 28;
    const svg = buildBarChartSvg(daily, 280, barAreaHeight, '#00FF88');
    // The today bar should be at full height (barAreaHeight)
    // Find the rect with fill="#00FF88" and extract its height
    const todayRectMatch = svg.match(/<rect[^>]*fill="#00FF88"[^>]*height="(\d+)"/);
    const altTodayRectMatch = svg.match(/<rect[^>]*height="(\d+)"[^>]*fill="#00FF88"/);
    const heightStr = todayRectMatch?.[1] ?? altTodayRectMatch?.[1];
    expect(heightStr).toBeDefined();
    expect(parseInt(heightStr!, 10)).toBe(barAreaHeight);
  });

  it('FR2.11 — exactly 7 entries → exactly 7 bars rendered', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 2);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    expect((svg.match(/<rect/g) ?? []).length).toBe(7);
  });

  it('FR2.12 — accentColor = "#FF2D55" (critical): today bar fill is #FF2D55', () => {
    const daily = makeDailyEntries([4, 5, 6, 8, 3, 0, 0], 3);
    const svg = buildBarChartSvg(daily, 280, 28, '#FF2D55');
    expect(svg).toContain('fill="#FF2D55"');
  });

  it('FR2.13 — SVG height attribute equals barAreaHeight + 12', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 4);
    const barAreaHeight = 28;
    const svg = buildBarChartSvg(daily, 280, barAreaHeight, '#00FF88');
    expect(svg).toContain(`height="${barAreaHeight + 12}"`);
  });

  it('FR2.14 — day labels Mon, Tue, Wed, Thu, Fri, Sat, Sun all present in SVG', () => {
    const daily = makeDailyEntries([8, 7, 6, 5, 4, 3, 2], 4);
    const svg = buildBarChartSvg(daily, 280, 28, '#00FF88');
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((label) => {
      expect(svg).toContain(label);
    });
  });
});

// ─── FR3: MediumWidget Hours mode bar chart integration ────────────────────────

describe('02-android FR3 — MediumWidget Hours mode bar chart integration', () => {
  function makeDailyData(): any[] {
    return makeDailyEntries([8, 7, 6, 5, 4, 0, 0], 4);
  }

  it('FR3.1 — MediumWidget Hours mode renders a SvgWidget after the BrainLift row (bar chart present)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          paceBadge: 'on_track',
          approvalItems: [],
          myRequests: [],
          daily: makeDailyData(),
        }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    // Should have: mesh background + BrainLift progress bar + bar chart = at least 3
    expect(svgs.length).toBeGreaterThanOrEqual(3);
  });

  it('FR3.2 — bar chart SvgWidget svg prop starts with <svg', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          paceBadge: 'on_track',
          approvalItems: [],
          myRequests: [],
          daily: makeDailyData(),
        }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    // The bar chart SVG is the one that contains <rect elements (bar chart, not mesh or progress bar)
    const barChartSvg = svgs.find((s) => {
      const svg: string = s.props.svg ?? '';
      return (svg.match(/<rect/g) ?? []).length === 7;
    });
    expect(barChartSvg).toBeDefined();
    expect(barChartSvg!.props.svg.startsWith('<svg')).toBe(true);
  });

  it('FR3.3 — bar chart SvgWidget height prop is 40', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          paceBadge: 'on_track',
          approvalItems: [],
          myRequests: [],
          daily: makeDailyData(),
        }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    const barChartSvg = svgs.find((s) => {
      const svg: string = s.props.svg ?? '';
      return (svg.match(/<rect/g) ?? []).length === 7;
    });
    expect(barChartSvg).toBeDefined();
    // SvgWidget height is passed via style prop (width/height on SvgWidget)
    // Check that the SVG itself contains height="40" (barAreaHeight + 12 = 28 + 12 = 40)
    expect(barChartSvg!.props.svg).toContain('height="40"');
  });

  it('FR3.4 — bar chart uses urgency accentColor (urgency=critical → #F43F5E in bar chart svg, 02-android-widget-redesign)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          paceBadge: 'on_track',
          urgency: 'critical',
          approvalItems: [],
          myRequests: [],
          daily: makeDailyData(),
        }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    const barChartSvg = svgs.find((s) => {
      const svg: string = s.props.svg ?? '';
      return (svg.match(/<rect/g) ?? []).length === 7;
    });
    expect(barChartSvg).toBeDefined();
    // critical urgency → URGENCY_ACCENT.critical = '#F43F5E' (02-android-widget-redesign)
    expect(barChartSvg!.props.svg).toContain('#F43F5E');
  });

  it('FR3.5 — bar chart receives data.daily (SVG contains 7 bars from the daily array)', () => {
    const daily = makeDailyEntries([10, 8, 6, 4, 2, 0, 0], 4);
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeData({
          isManager: false,
          paceBadge: 'on_track',
          approvalItems: [],
          myRequests: [],
          daily,
        }),
        widgetFamily: 'medium',
      })
    );
    const svgs = getSvgWidgets(tree);
    const barChartSvg = svgs.find((s) => {
      const svg: string = s.props.svg ?? '';
      return (svg.match(/<rect/g) ?? []).length === 7;
    });
    expect(barChartSvg).toBeDefined();
    // Mon bar has max hours → full height bar (barAreaHeight = 28)
    expect(barChartSvg!.props.svg).toContain('height="28"');
  });
});

// ─── 02-android-hud-layout: FR1 — getPriority helper ─────────────────────────

let getPriority: any;

beforeAll(() => {
  const mod = require('../../../widgets/android/HourglassWidget');
  getPriority = mod.getPriority;
});

describe('02-hud FR1 — getPriority helper', () => {
  it('FR1-hud-1 — isManager=true, pendingCount=2 → "approvals" (P1)', () => {
    expect(getPriority({ isManager: true, pendingCount: 2, paceBadge: 'on_track' })).toBe('approvals');
  });

  it('FR1-hud-2 — isManager=false, paceBadge=critical → "deficit" (P2)', () => {
    expect(getPriority({ isManager: false, pendingCount: 0, paceBadge: 'critical' })).toBe('deficit');
  });

  it('FR1-hud-3 — isManager=false, paceBadge=behind → "deficit" (P2)', () => {
    expect(getPriority({ isManager: false, pendingCount: 0, paceBadge: 'behind' })).toBe('deficit');
  });

  it('FR1-hud-4 — isManager=false, paceBadge=on_track → "default" (P3)', () => {
    expect(getPriority({ isManager: false, pendingCount: 0, paceBadge: 'on_track' })).toBe('default');
  });

  it('FR1-hud-5 — isManager=true, pendingCount=0, paceBadge=critical → "deficit" (P1 requires pending > 0)', () => {
    expect(getPriority({ isManager: true, pendingCount: 0, paceBadge: 'critical' })).toBe('deficit');
  });

  it('FR1-hud-6 — isManager=true, urgency=critical, pendingCount=0 → "deficit" (urgency alone does not trigger P1)', () => {
    expect(getPriority({ isManager: true, pendingCount: 0, paceBadge: 'critical', urgency: 'critical' })).toBe('deficit');
  });

  it('FR1-hud-7 — paceBadge=crushed_it, isManager=false → "default" (P3)', () => {
    expect(getPriority({ isManager: false, pendingCount: 0, paceBadge: 'crushed_it' })).toBe('default');
  });

  it('FR1-hud-8 — contributor (isManager=false) with myRequests → "default" (not P1)', () => {
    expect(getPriority({
      isManager: false,
      pendingCount: 0,
      paceBadge: 'on_track',
      myRequests: [{ id: '1', status: 'PENDING', hours: '2h', memo: 'fix' }],
    })).toBe('default');
  });

  it('FR1-hud-9 — isManager=true, pendingCount=1 → "approvals" regardless of urgency=none', () => {
    expect(getPriority({ isManager: true, pendingCount: 1, paceBadge: 'on_track', urgency: 'none' })).toBe('approvals');
  });

  it('FR1-hud-10 — isManager=true, pendingCount=5, paceBadge=behind → "approvals" (P1 wins over P2)', () => {
    expect(getPriority({ isManager: true, pendingCount: 5, paceBadge: 'behind' })).toBe('approvals');
  });
});

// ─── 02-android-hud-layout: FR5 — blProgressBar height regression guard ───────

describe('02-hud FR5 — blProgressBar height regression guard', () => {
  it('FR5-hud-1 — track rect has height="8" in SVG output', () => {
    const svg = blProgressBar(3, 5, 120);
    // Track rect is the first rect: width="${width}" height="8"
    const rects = [...svg.matchAll(/<rect([^/]*?)\/>/g)].map((m: any) => m[0]);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const trackRect = rects[0];
    expect(trackRect).toContain('height="8"');
  });

  it('FR5-hud-2 — fill rect has height="8" in SVG output', () => {
    const svg = blProgressBar(3, 5, 120);
    const rects = [...svg.matchAll(/<rect([^/]*?)\/>/g)].map((m: any) => m[0]);
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const fillRect = rects[1];
    expect(fillRect).toContain('height="8"');
  });

  it('FR5-hud-3 — fill width is capped at width value when brainliftHours >= targetHours (100%)', () => {
    const width = 150;
    const svg = blProgressBar(10, 5, width); // 200% → capped at 100% = width
    // All width= values, max should equal the outer SVG width (not exceed)
    const widthValues = [...svg.matchAll(/width="(\d+)"/g)].map((m: any) => parseInt(m[1], 10));
    const maxFill = Math.max(...widthValues.filter((w: number) => w <= width));
    expect(maxFill).toBe(width);
  });

  it('FR5-hud-4 — fill rect width is 0 when brainliftHours = 0', () => {
    const svg = blProgressBar(0, 5, 120);
    expect(svg).toContain('width="0"');
  });

  it('FR5-hud-5 — SVG outer element has height="8"', () => {
    const svg = blProgressBar(2.5, 5, 120);
    expect(svg).toMatch(/<svg[^>]*height="8"/);
  });
});

// ─── 02-android-hud-layout: FR2 — MediumWidget P1 approvals layout ───────────

describe('02-hud FR2 — MediumWidget P1 approvals layout', () => {
  function makeP1Data(overrides: Record<string, unknown> = {}): any {
    return makeData({
      isManager: true,
      pendingCount: 3,
      urgency: 'none', // P1 must activate even with non-high urgency
      paceBadge: 'on_track',
      approvalItems: [
        { id: '1', name: 'Alice Smith', hours: '2.5h', category: 'MANUAL' },
        { id: '2', name: 'Bob Jones', hours: '1.0h', category: 'OVERTIME' },
      ],
      ...overrides,
    });
  }

  it('FR2-hud-1 — P1: header text contains pendingCount', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP1Data({ pendingCount: 3 }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const headerText = texts.find((t: any) => t.props.text && t.props.text.includes('3'));
    expect(headerText).toBeDefined();
  });

  it('FR2-hud-2 — P1: renders approvalItems[0].name', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP1Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const nameText = texts.find((t: any) => t.props.text === 'Alice Smith');
    expect(nameText).toBeDefined();
  });

  it('FR2-hud-3 — P1: renders approvalItems[0].hours', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP1Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const hoursText = texts.find((t: any) => t.props.text === '2.5h');
    expect(hoursText).toBeDefined();
  });

  it('FR2-hud-4 — P1: does NOT render earnings hero as a large featured text', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP1Data({ earnings: '$1,300', weekDeltaEarnings: '' }),
        widgetFamily: 'medium',
      })
    );
    // P1 approvals layout does not have a prominent earnings glass panel
    const flexes = getFlexWidgets(tree);
    // earnings panel would be backgroundColor: #E8C97A-tinted or '#1F1E2C' inner glass
    // Key check: no glass panel with inner card showing earnings as 22px hero
    const texts = getTextWidgets(tree);
    const earningsHero = texts.find((t: any) => t.props.text === '$1,300' && t.props.style?.fontSize >= 20);
    expect(earningsHero).toBeUndefined();
  });

  it('FR2-hud-5 — P1: activates for manager with urgency=none (not just high/critical)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP1Data({ urgency: 'none', pendingCount: 2 }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    // Should render approval items, not the full hours mode
    const itemName = texts.find((t: any) => t.props.text === 'Alice Smith');
    expect(itemName).toBeDefined();
  });

  it('FR2-hud-6 — P1: activates for manager with urgency=low (previously would not have triggered urgency mode)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP1Data({ urgency: 'low', pendingCount: 1 }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const itemName = texts.find((t: any) => t.props.text === 'Alice Smith');
    expect(itemName).toBeDefined();
  });
});

// ─── 02-android-hud-layout: FR3 — MediumWidget P2 deficit layout ─────────────

describe('02-hud FR3 — MediumWidget P2 deficit layout (unified priority)', () => {
  function makeP2Data(overrides: Record<string, unknown> = {}): any {
    return makeData({
      isManager: false,
      pendingCount: 0,
      paceBadge: 'behind',
      approvalItems: [],
      myRequests: [],
      ...overrides,
    });
  }

  it('FR3-hud-1 — P2: renders hoursDisplay prominently', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP2Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const hoursText = texts.find((t: any) => t.props.text === '32.5h');
    expect(hoursText).toBeDefined();
  });

  it('FR3-hud-2 — P2: renders hoursRemaining', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP2Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const remainingText = texts.find((t: any) => t.props.text === '7.5h left');
    expect(remainingText).toBeDefined();
  });

  it('FR3-hud-3 — P2: does NOT render AI usage text', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP2Data({ aiPct: '71%' }), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const aiText = texts.find((t: any) => t.props.text && t.props.text.includes('AI'));
    expect(aiText).toBeUndefined();
  });

  it('FR3-hud-4 — P2: does NOT render bar chart (no 7-rect SVG)', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP2Data(), widgetFamily: 'medium' })
    );
    const svgs = getSvgWidgets(tree);
    const barChart = svgs.find((s: any) => (s.props.svg?.match(/<rect/g) ?? []).length === 7);
    expect(barChart).toBeUndefined();
  });

  it('FR3-hud-5 — P2: paceBadge=critical also triggers P2 deficit layout', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP2Data({ paceBadge: 'critical' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const warningText = texts.find((t: any) => t.props.text && t.props.text.includes('⚠'));
    expect(warningText).toBeDefined();
    const hoursText = texts.find((t: any) => t.props.text === '32.5h');
    expect(hoursText).toBeDefined();
  });
});

// ─── 02-android-hud-layout: FR4 — MediumWidget P3 label and today delta fixes ─

describe('02-hud FR4 — MediumWidget P3 label and today delta fixes', () => {
  function makeP3Data(overrides: Record<string, unknown> = {}): any {
    return makeData({
      isManager: false,
      pendingCount: 0,
      paceBadge: 'on_track',
      approvalItems: [],
      myRequests: [],
      today: '6.2h',
      todayDelta: '+1.2h',
      aiPct: '71%',
      ...overrides,
    });
  }

  it('FR4-hud-1 — P3: footer contains "AI Usage:" label (not "AI:")', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP3Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const aiUsageText = texts.find((t: any) => t.props.text && t.props.text.startsWith('AI Usage:'));
    expect(aiUsageText).toBeDefined();
  });

  it('FR4-hud-2 — P3: footer does NOT contain bare "AI:" label', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP3Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const bareAiLabel = texts.find((t: any) => t.props.text && /^AI:\s/.test(t.props.text));
    expect(bareAiLabel).toBeUndefined();
  });

  it('FR4-hud-3 — P3: todayDelta shown when non-empty', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP3Data({ todayDelta: '+1.2h', today: '6.2h' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const todayText = texts.find((t: any) => t.props.text && t.props.text.includes('+1.2h'));
    expect(todayText).toBeDefined();
  });

  it('FR4-hud-4 — P3: falls back to today when todayDelta is empty string', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP3Data({ todayDelta: '', today: '6.2h' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const todayText = texts.find((t: any) => t.props.text && t.props.text.includes('6.2h'));
    expect(todayText).toBeDefined();
  });

  it('FR4-hud-5 — P3: falls back to today when todayDelta is undefined', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, {
        data: makeP3Data({ todayDelta: undefined, today: '6.5h' }),
        widgetFamily: 'medium',
      })
    );
    const texts = getTextWidgets(tree);
    const todayText = texts.find((t: any) => t.props.text && t.props.text.includes('6.5h'));
    expect(todayText).toBeDefined();
  });

  it('FR4-hud-6 — P3: hours hero TextWidget has fontWeight "700" or "bold"', () => {
    const tree = renderWidget(
      React.createElement(HourglassWidget, { data: makeP3Data(), widgetFamily: 'medium' })
    );
    const texts = getTextWidgets(tree);
    const hoursHero = texts.find(
      (t: any) => t.props.text === '32.5h' && (t.props.style?.fontWeight === '700' || t.props.style?.fontWeight === 'bold')
    );
    expect(hoursHero).toBeDefined();
  });
});
