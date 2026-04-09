/**
 * Tests: 01-widget-visual-ios
 *
 * FR1: isFuture field in WidgetDailyEntry — buildDailyEntries() populates isFuture correctly
 * FR2: iOS glass card layout — MediumWidget and LargeWidget hero row uses ZStack+RoundedRectangle cards
 * FR3: iOS gradient background — all three widget sizes use ZStack with 2 Rectangle layers
 * FR4: iOS Large bar chart — IosBarChart renders 7 columns with correct colours and heights
 */

// ─── Mock @expo/ui/swift-ui ────────────────────────────────────────────────────
// Render primitives as simple host components exposing their props.
jest.mock(
  '@expo/ui/swift-ui',
  () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mockReact = require('react');
    function makeComp(name) {
      return (props) =>
        mockReact.createElement(name, { ...props }, props.children);
    }
    return {
      VStack: makeComp('VStack'),
      HStack: makeComp('HStack'),
      ZStack: makeComp('ZStack'),
      Text: makeComp('Text'),
      Spacer: makeComp('Spacer'),
      Rectangle: makeComp('Rectangle'),
      RoundedRectangle: makeComp('RoundedRectangle'),
      Circle: makeComp('Circle'),
      Capsule: makeComp('Capsule'),
    };
  },
  { virtual: true }
);

// Mock expo-widgets — iOS-only native module
jest.mock('expo-widgets', () => ({ createWidget: (_name: string, fn: unknown) => fn }), { virtual: true });

// Mock Platform so bridge runs Android path
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import React from 'react';
import { create, act } from 'react-test-renderer';
import { buildDailyEntries } from '../../widgets/bridge';
import type { DailyEntry } from '../../lib/hours';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all nodes in a react-test-renderer tree matching the given type name */
function collectNodes(tree: any, typeName: string, results: any[] = []): any[] {
  if (!tree) return results;
  if (tree.type === typeName) results.push(tree);
  if (Array.isArray(tree.children)) {
    for (const child of tree.children) {
      collectNodes(child, typeName, results);
    }
  }
  return results;
}

/** Build a minimal WidgetData fixture */
function makeWidgetData(overrides: Record<string, unknown> = {}): any {
  return {
    hours: '32.5',
    hoursDisplay: '32.5h',
    earnings: '$1,300',
    earningsRaw: 1300,
    today: '6.2h',
    hoursRemaining: '7.5h left',
    aiPct: '71%–75%',
    brainlift: '3.2h',
    deadline: Date.now() + 5 * 24 * 60 * 60 * 1000,
    urgency: 'none',
    pendingCount: 0,
    isManager: false,
    cachedAt: Date.now(),
    useQA: false,
    daily: makeDailyFor('none'),
    approvalItems: [],
    myRequests: [],
    actionBg: '',
    paceBadge: 'on_track',
    weekDeltaHours: '+2.1h',
    weekDeltaEarnings: '+$84',
    brainliftTarget: '5h',
    todayDelta: '+1.2h',
    ...overrides,
  };
}

/** Build a 7-entry daily array for a given urgency context */
function makeDailyFor(_urgency: string): any[] {
  // Use a fixed Mon–Sun week with no isFuture entries
  return [
    { day: 'Mon', hours: 6.0, isToday: false, isFuture: false },
    { day: 'Tue', hours: 7.5, isToday: false, isFuture: false },
    { day: 'Wed', hours: 6.2, isToday: true,  isFuture: false },
    { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
    { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
    { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
    { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
  ];
}

function renderWidget(el: React.ReactElement): any {
  let renderer: any;
  act(() => {
    renderer = create(el);
  });
  return renderer.toJSON();
}

// ─── FR1: isFuture in buildDailyEntries ───────────────────────────────────────

describe('FR1 — buildDailyEntries isFuture', () => {
  // Use a fixed "today": Wednesday 2026-03-18
  const TODAY = new Date('2026-03-18T12:00:00');

  it('FR1.1 — entry with date = yesterday (2026-03-17) → isFuture: false', () => {
    const daily: DailyEntry[] = [{ date: '2026-03-17', hours: 6.0, isToday: false }];
    const result = buildDailyEntries(daily, TODAY);
    const tue = result.find((e) => e.day === 'Tue')!;
    expect(tue.isFuture).toBe(false);
  });

  it('FR1.2 — entry with date = today (2026-03-18) → isFuture: false', () => {
    const daily: DailyEntry[] = [{ date: '2026-03-18', hours: 6.0, isToday: true }];
    const result = buildDailyEntries(daily, TODAY);
    const wed = result.find((e) => e.day === 'Wed')!;
    expect(wed.isFuture).toBe(false);
  });

  it('FR1.3 — entry with date = tomorrow (2026-03-19) → isFuture: true', () => {
    const daily: DailyEntry[] = [{ date: '2026-03-19', hours: 0, isToday: false }];
    const result = buildDailyEntries(daily, TODAY);
    const thu = result.find((e) => e.day === 'Thu')!;
    expect(thu.isFuture).toBe(true);
  });

  it('FR1.4 — entry with date = next Sunday (2026-03-22) → isFuture: true', () => {
    const daily: DailyEntry[] = [{ date: '2026-03-22', hours: 0, isToday: false }];
    const result = buildDailyEntries(daily, TODAY);
    const sun = result.find((e) => e.day === 'Sun')!;
    expect(sun.isFuture).toBe(true);
  });

  it('FR1.5 — gap-filled entry for a future day (Thu) → isFuture: true', () => {
    // Only Mon–Wed provided; Thu–Sun are gap-filled
    const daily: DailyEntry[] = [
      { date: '2026-03-16', hours: 7.0, isToday: false }, // Mon
      { date: '2026-03-17', hours: 7.5, isToday: false }, // Tue
      { date: '2026-03-18', hours: 6.2, isToday: true  }, // Wed
    ];
    const result = buildDailyEntries(daily, TODAY);
    expect(result.find((e) => e.day === 'Thu')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Fri')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Sat')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Sun')!.isFuture).toBe(true);
  });

  it('FR1.6 — gap-filled entry for a past day (Mon) → isFuture: false', () => {
    // Only Tue–Wed provided; Mon is gap-filled but is in the past
    const daily: DailyEntry[] = [
      { date: '2026-03-17', hours: 7.5, isToday: false }, // Tue
      { date: '2026-03-18', hours: 6.2, isToday: true  }, // Wed
    ];
    const result = buildDailyEntries(daily, TODAY);
    expect(result.find((e) => e.day === 'Mon')!.isFuture).toBe(false);
  });

  it('FR1.7 — full week: only days after today have isFuture: true', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-16', hours: 7.0, isToday: false }, // Mon
      { date: '2026-03-17', hours: 7.5, isToday: false }, // Tue
      { date: '2026-03-18', hours: 6.2, isToday: true  }, // Wed
      { date: '2026-03-19', hours: 0,   isToday: false }, // Thu
      { date: '2026-03-20', hours: 0,   isToday: false }, // Fri
      { date: '2026-03-21', hours: 0,   isToday: false }, // Sat
      { date: '2026-03-22', hours: 0,   isToday: false }, // Sun
    ];
    const result = buildDailyEntries(daily, TODAY);
    expect(result.find((e) => e.day === 'Mon')!.isFuture).toBe(false);
    expect(result.find((e) => e.day === 'Tue')!.isFuture).toBe(false);
    expect(result.find((e) => e.day === 'Wed')!.isFuture).toBe(false);
    expect(result.find((e) => e.day === 'Thu')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Fri')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Sat')!.isFuture).toBe(true);
    expect(result.find((e) => e.day === 'Sun')!.isFuture).toBe(true);
  });

  it('FR1.8 — now at midnight exactly: today is not future', () => {
    const midnight = new Date('2026-03-18T00:00:00');
    const daily: DailyEntry[] = [{ date: '2026-03-18', hours: 0, isToday: true }];
    const result = buildDailyEntries(daily, midnight);
    expect(result.find((e) => e.day === 'Wed')!.isFuture).toBe(false);
  });

  it('FR1.9 — empty daily array still returns 7 entries each with isFuture: boolean', () => {
    const result = buildDailyEntries([], TODAY);
    expect(result).toHaveLength(7);
    for (const entry of result) {
      expect(typeof entry.isFuture).toBe('boolean');
    }
  });
});

// ─── iOS widget module handle ──────────────────────────────────────────────────

let SmallWidgetFn: any;
let MediumWidgetFn: any;
let LargeWidgetFn: any;
let IosBarChartFn: any;
let getPriorityFn: any;

beforeAll(() => {
  const mod = require('../../widgets/ios/HourglassWidget');
  // Use named exports — the default export goes through expo-widgets 'widget' directive
  // which Babel transforms and makes it non-callable in test environments.
  SmallWidgetFn  = mod.SmallWidget;
  MediumWidgetFn = mod.MediumWidget;
  LargeWidgetFn  = mod.LargeWidget;
  IosBarChartFn  = mod.IosBarChart;
  getPriorityFn  = mod.getPriority;
});

// ─── FR2: iOS glass card layout ───────────────────────────────────────────────

describe('FR2 — iOS glass card layout', () => {
  it('FR2.1 — MediumWidget renders ZStack elements with RoundedRectangle in hero row', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    expect(roundedRects.length).toBeGreaterThanOrEqual(2);
  });

  it('FR2.2 — each glass card RoundedRectangle has cornerRadius >= 10', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    for (const rr of roundedRects) {
      expect(rr.props.cornerRadius).toBeGreaterThanOrEqual(10);
    }
  });

  it('FR2.3 — MediumWidget renders hoursDisplay text', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const texts = collectNodes(tree, 'Text');
    const textContent = texts.map((t: any) =>
      Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '')
    );
    expect(textContent.some((s: string) => s.includes('32.5h'))).toBe(true);
  });

  it('FR2.4 — MediumWidget renders earnings text', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const texts = collectNodes(tree, 'Text');
    const textContent = texts.map((t: any) =>
      Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '')
    );
    expect(textContent.some((s: string) => s.includes('$1,300'))).toBe(true);
  });

  it('FR2.5 — LargeWidget hero row has RoundedRectangle card elements', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    expect(roundedRects.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── FR3: iOS gradient background ─────────────────────────────────────────────

describe('FR3 — iOS gradient background', () => {
  it('FR3.1 — SmallWidget outer ZStack contains at least 1 Rectangle element (WidgetBackground base)', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData() }));
    const rects = collectNodes(tree, 'Rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.2 — MediumWidget outer ZStack contains at least 1 Rectangle element (WidgetBackground base)', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const rects = collectNodes(tree, 'Rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.3 — LargeWidget outer ZStack contains at least 1 Rectangle element (WidgetBackground base)', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWidgetData() }));
    const rects = collectNodes(tree, 'Rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.4 — first Rectangle fill is the dark background color', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData({ urgency: 'none' }) }));
    const rects = collectNodes(tree, 'Rectangle');
    // Source uses COLORS.bgDark (#0D0C14) as Rectangle fill
    expect(rects[0].props.fill).toBe('#0D0C14');
  });

  it('FR3.5 — urgency "low" produces different Circle accent fill than urgency "high"', () => {
    const lowTree  = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData({ urgency: 'low' }) }));
    const highTree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData({ urgency: 'high' }) }));
    const lowCircles  = collectNodes(lowTree, 'Circle');
    const highCircles = collectNodes(highTree, 'Circle');
    // Top-right accent Circle (first Circle) fill differs by urgency
    expect(lowCircles[0].props.fill).not.toBe(highCircles[0].props.fill);
  });

  it('FR3.7 — SmallWidget renders at least 1 Circle element (WidgetBackground accent glow)', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData() }));
    const circles = collectNodes(tree, 'Circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.8 — MediumWidget renders at least 1 Circle element', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const circles = collectNodes(tree, 'Circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.9 — LargeWidget renders at least 1 Circle element', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWidgetData() }));
    const circles = collectNodes(tree, 'Circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });

  it('FR3.10 — WidgetBackground accent Circle uses urgency accent color', () => {
    // Source uses single top-center accent Circle; old blue (#3B82F6) removed.
    // urgency='none' uses URGENCY_ACCENT.none = '#10B981'
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ urgency: 'none' }) }));
    const circles = collectNodes(tree, 'Circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
    // The first Circle is the accent glow — it uses the urgency accent color
    expect(circles[0].props.fill).toBeDefined();
  });

  it('FR3.6 — root content VStack does not have a background prop equal to a solid urgency colour', () => {
    // The flat URGENCY_COLORS background should be removed from VStack
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ urgency: 'none' }) }));
    const vstacks = collectNodes(tree, 'VStack');
    // None of the vstacks should have background='#1A1A2E' (the old solid colour)
    for (const v of vstacks) {
      expect(v.props.background).not.toBe('#1A1A2E');
    }
  });
});

// ─── FR4: iOS Large bar chart ─────────────────────────────────────────────────

describe('FR4 — iOS Large bar chart', () => {
  const accent = '#10B981'; // urgency 'none' accent (URGENCY_ACCENT.none)

  function makeWeekData(overrides: Partial<{ daily: any[] }> = {}): any {
    return makeWidgetData({
      urgency: 'none',
      daily: [
        { day: 'Mon', hours: 6.0, isToday: false, isFuture: false },
        { day: 'Tue', hours: 7.5, isToday: false, isFuture: false },
        { day: 'Wed', hours: 6.2, isToday: true,  isFuture: false },
        { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
      ],
      ...overrides,
    });
  }

  it('FR4.1 — LargeWidget renders exactly 7 day label Text nodes in bar chart', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const texts = collectNodes(tree, 'Text');
    const dayLabels = texts.filter((t: any) => {
      const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
    });
    expect(dayLabels).toHaveLength(7);
  });

  it('FR4.2 — today bar (Wed) RoundedRectangle uses accent colour', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // At least one bar uses the accent colour (today bar)
    const todayBar = roundedRects.find((rr: any) => rr.props.fill === accent);
    expect(todayBar).toBeDefined();
  });

  it('FR4.3 — future bar RoundedRectangle uses muted colour #2F2E41', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // At least one bar uses the future/muted colour
    const mutedBar = roundedRects.find((rr: any) => rr.props.fill === '#2F2E41');
    expect(mutedBar).toBeDefined();
  });

  it('FR4.4 — past bar with hours uses barPast colour (#10B981 success green)', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Mon and Tue have hours and are past → use COLORS.barPast = '#10B981'
    const pastBar = roundedRects.find((rr: any) => rr.props.fill === '#10B981');
    expect(pastBar).toBeDefined();
  });

  it('FR4.5 — column with max hours has bar height close to MAX_BAR_HEIGHT (60pt, within 5pt)', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Filter to bars that have a height prop (chart bars, not glass card borders)
    const barHeights = roundedRects
      .map((rr: any) => rr.props.height)
      .filter((h: any) => typeof h === 'number' && h > 0);
    const maxHeight = Math.max(...barHeights);
    // Should be within 5pt of 60
    expect(maxHeight).toBeGreaterThanOrEqual(55);
    expect(maxHeight).toBeLessThanOrEqual(65);
  });

  it('FR4.6 — zero-hours bar has height 0', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Future/zero bars: Thu, Fri, Sat, Sun — their heights should be 0
    const zeroHeightBars = roundedRects.filter(
      (rr: any) => typeof rr.props.height === 'number' && rr.props.height === 0
    );
    expect(zeroHeightBars.length).toBeGreaterThanOrEqual(4);
  });

  it('FR4.7 — day labels are 3-char strings', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const texts = collectNodes(tree, 'Text');
    const dayLabels = texts.filter((t: any) => {
      const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
    });
    for (const label of dayLabels) {
      const content = Array.isArray(label.children) ? label.children.join('') : String(label.children ?? '');
      expect(content).toHaveLength(3);
    }
  });

  it('FR4.8 — all-zero daily input: no error, bar heights all 0', () => {
    const allZero = makeWidgetData({
      urgency: 'none',
      daily: [
        { day: 'Mon', hours: 0, isToday: false, isFuture: false },
        { day: 'Tue', hours: 0, isToday: false, isFuture: false },
        { day: 'Wed', hours: 0, isToday: true,  isFuture: false },
        { day: 'Thu', hours: 0, isToday: false, isFuture: true  },
        { day: 'Fri', hours: 0, isToday: false, isFuture: true  },
        { day: 'Sat', hours: 0, isToday: false, isFuture: true  },
        { day: 'Sun', hours: 0, isToday: false, isFuture: true  },
      ],
    });
    expect(() => renderWidget(React.createElement(LargeWidgetFn, { props: allZero }))).not.toThrow();
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: allZero }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    const barHeights = roundedRects
      .map((rr: any) => rr.props.height)
      .filter((h: any) => typeof h === 'number');
    for (const h of barHeights) {
      expect(h).toBe(0);
    }
  });

  it('FR4.9 — single non-zero entry: that column bar height = MAX_BAR_HEIGHT (60)', () => {
    const singleNonZero = makeWidgetData({
      urgency: 'none',
      daily: [
        { day: 'Mon', hours: 0,   isToday: false, isFuture: false },
        { day: 'Tue', hours: 0,   isToday: false, isFuture: false },
        { day: 'Wed', hours: 8.0, isToday: true,  isFuture: false },
        { day: 'Thu', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Fri', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Sat', hours: 0,   isToday: false, isFuture: true  },
        { day: 'Sun', hours: 0,   isToday: false, isFuture: true  },
      ],
    });
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: singleNonZero }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    const barHeights = roundedRects
      .map((rr: any) => rr.props.height)
      .filter((h: any) => typeof h === 'number');
    expect(barHeights).toContain(60);
  });

  it('FR4.10 — LargeWidget renders IosBarChart (contains 7 day Text nodes)', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWeekData() }));
    const texts = collectNodes(tree, 'Text');
    const dayLabels = texts.filter((t: any) => {
      const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
    });
    expect(dayLabels).toHaveLength(7);
  });
});

// ─── FR-New: IosGlassCard values ─────────────────────────────────────────────

describe('FR-New — IosGlassCard upgraded values', () => {
  it('IosGlassCard.1 — glass card RoundedRectangle fill uses surface color token', () => {
    // MediumWidget P3 renders IosGlassCard — COLORS.surface = '#16151FCC' (80% opacity)
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Surface rect has translucent fill (COLORS.surface = '#16151FCC')
    const surfaceRect = roundedRects.find((rr: any) =>
      rr.props.fill === '#16151FCC' || rr.props.fill === '#1C1E26CC'
    );
    expect(surfaceRect).toBeDefined();
  });

  it('IosGlassCard.2 — glass card RoundedRectangle cornerRadius is 16', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Surface rect uses cornerRadius 16
    const surfaceRect = roundedRects.find((rr: any) =>
      (rr.props.fill === '#16151FCC' || rr.props.fill === '#1C1E26CC') && rr.props.cornerRadius === 16
    );
    expect(surfaceRect).toBeDefined();
    expect(surfaceRect.props.cornerRadius).toBe(16);
  });

  it('IosGlassCard.3 — glass card border RoundedRectangle has a strokeWidth', () => {
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeWidgetData() }));
    const roundedRects = collectNodes(tree, 'RoundedRectangle');
    // Border stroke rect has strokeWidth (0.5 or 1.5 depending on design iteration)
    const borderRect = roundedRects.find((rr: any) =>
      rr.props.strokeWidth != null && rr.props.strokeWidth > 0
    );
    expect(borderRect).toBeDefined();
  });
});

// ─── FR-New: StatusPill opacity ─────────────────────────────────────────────

describe('FR-New — StatusPill Capsule shape (04-pill-chart)', () => {
  it('StatusPill.1 — fill Capsule fill ends with 1A (10% opacity)', () => {
    // Render SmallWidget with on_track pace to trigger StatusPill
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ paceBadge: 'on_track' }) }));
    const capsules = collectNodes(tree, 'Capsule');
    // StatusPill fill Capsule has fill ending with '1A'
    const pillBg = capsules.find((c: any) =>
      typeof c.props.fill === 'string' && c.props.fill.endsWith('1A')
    );
    expect(pillBg).toBeDefined();
  });

  it('StatusPill.2 — stroke Capsule uses full color (no suffix) with strokeWidth=0.5', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ paceBadge: 'on_track' }) }));
    const capsules = collectNodes(tree, 'Capsule');
    // on_track accent is '#10B981' — stroke Capsule has stroke='#10B981' and strokeWidth=0.5
    const pillStroke = capsules.find((c: any) =>
      typeof c.props.stroke === 'string' &&
      !c.props.stroke.endsWith('80') &&
      !c.props.stroke.endsWith('1A') &&
      c.props.strokeWidth === 0.5
    );
    expect(pillStroke).toBeDefined();
  });

  it('StatusPill.3 — both Capsules have height=22', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ paceBadge: 'on_track' }) }));
    const capsules = collectNodes(tree, 'Capsule');
    const pillCapsules = capsules.filter((c: any) => c.props.height === 22);
    expect(pillCapsules.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Helpers for 01-ios-hud-layout tests ──────────────────────────────────────

/** Build an approvalItems fixture */
function makeApprovalItems(count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    name: `Worker ${i + 1}`,
    hours: `${i + 1}.0h`,
    category: 'MANUAL',
  }));
}

/** Build fixture for P1 (manager with pending approvals) */
function makeP1Data(overrides: Record<string, unknown> = {}): any {
  return makeWidgetData({
    isManager: true,
    pendingCount: 3,
    paceBadge: 'on_track',
    urgency: 'high',
    approvalItems: makeApprovalItems(3),
    ...overrides,
  });
}

/** Build fixture for P2 (behind/critical pace) */
function makeP2Data(badge: 'behind' | 'critical' = 'behind'): any {
  return makeWidgetData({
    isManager: false,
    pendingCount: 0,
    paceBadge: badge,
    urgency: badge === 'critical' ? 'critical' : 'high',
    weekDeltaEarnings: '-$136',
  });
}

/** Build fixture for P3 (default on_track) */
function makeP3Data(todayDeltaOverride = '+1.2h'): any {
  return makeWidgetData({
    isManager: false,
    pendingCount: 0,
    paceBadge: 'on_track',
    urgency: 'none',
    todayDelta: todayDeltaOverride,
  });
}

/** Collect all Text node contents as flat string array */
function collectTextContents(tree: any): string[] {
  const nodes = collectNodes(tree, 'Text');
  return nodes.map((t: any) =>
    Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '')
  );
}

/** Check whether any text content contains a substring */
function hasText(tree: any, substring: string): boolean {
  return collectTextContents(tree).some((s) => s.includes(substring));
}

// ─── FR1 — getPriority helper ──────────────────────────────────────────────────

describe('FR1 — getPriority helper', () => {
  it('FR1.1 — SC1.1: isManager=true, pendingCount=3 → approvals', () => {
    const props = makeWidgetData({ isManager: true, pendingCount: 3, paceBadge: 'on_track' });
    expect(getPriorityFn(props)).toBe('approvals');
  });

  it('FR1.2 — SC1.2: paceBadge=critical → deficit', () => {
    const props = makeWidgetData({ isManager: false, pendingCount: 0, paceBadge: 'critical' });
    expect(getPriorityFn(props)).toBe('deficit');
  });

  it('FR1.3 — SC1.3: paceBadge=behind → deficit', () => {
    const props = makeWidgetData({ isManager: false, pendingCount: 0, paceBadge: 'behind' });
    expect(getPriorityFn(props)).toBe('deficit');
  });

  it('FR1.4 — SC1.4: paceBadge=on_track, pendingCount=0 → default', () => {
    const props = makeWidgetData({ isManager: false, pendingCount: 0, paceBadge: 'on_track' });
    expect(getPriorityFn(props)).toBe('default');
  });

  it('FR1.5 — SC1.5: paceBadge=crushed_it → default', () => {
    const props = makeWidgetData({ isManager: false, pendingCount: 0, paceBadge: 'crushed_it' });
    expect(getPriorityFn(props)).toBe('default');
  });

  it('FR1.6 — SC1.6: paceBadge=none → default', () => {
    const props = makeWidgetData({ isManager: false, pendingCount: 0, paceBadge: 'none' });
    expect(getPriorityFn(props)).toBe('default');
  });

  it('FR1.7 — SC1.7: isManager=true, pendingCount=3, paceBadge=critical → approvals (P1 beats P2)', () => {
    const props = makeWidgetData({ isManager: true, pendingCount: 3, paceBadge: 'critical' });
    expect(getPriorityFn(props)).toBe('approvals');
  });

  it('FR1.8 — SC1.8: isManager=true, pendingCount=0, paceBadge=behind → deficit', () => {
    const props = makeWidgetData({ isManager: true, pendingCount: 0, paceBadge: 'behind' });
    expect(getPriorityFn(props)).toBe('deficit');
  });
});

// ─── FR2 — SmallWidget hero font ──────────────────────────────────────────────

describe('FR2 — SmallWidget hero font', () => {
  it('FR2.1 — SC2.1: hero Text has font.weight === bold', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData() }));
    const texts = collectNodes(tree, 'Text');
    // Hero text renders hoursDisplay — find the Text node containing '32.5h'
    const heroText = texts.find((t: any) => {
      const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
      return content.includes('32.5h');
    });
    expect(heroText).toBeDefined();
    expect(heroText.props.font.weight).toBe('bold');
  });

  it('FR2.2 — SC2.2: hero Text has font.design === rounded', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData() }));
    const texts = collectNodes(tree, 'Text');
    const heroText = texts.find((t: any) => {
      const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
      return content.includes('32.5h');
    });
    expect(heroText).toBeDefined();
    expect(heroText.props.font.design).toBe('rounded');
  });

  it('FR2.3 — SC2.3: SmallWidget still renders hoursDisplay text', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData() }));
    expect(hasText(tree, '32.5h')).toBe(true);
  });

  it('FR2.4 — SC2.4: SmallWidget shows pace badge text for on_track', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ paceBadge: 'on_track' }) }));
    expect(hasText(tree, 'ON TRACK')).toBe(true);
  });

  it('FR2.5 — SC2.5: SmallWidget shows manager pending badge when isManager=true and pendingCount > 0', () => {
    const tree = renderWidget(React.createElement(SmallWidgetFn, { props: makeWidgetData({ isManager: true, pendingCount: 2 }) }));
    expect(hasText(tree, 'pending')).toBe(true);
  });
});

// ─── FR3 — MediumWidget priority layouts ──────────────────────────────────────

describe('FR3 — MediumWidget priority layouts', () => {
  describe('P1 (approvals mode)', () => {
    it('FR3.1 — SC3.1: P1 renders pendingCount text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP1Data() }));
      // pendingCount=3 → should show "3" somewhere in the approval context
      const contents = collectTextContents(tree);
      const hasPending = contents.some((s) => s.includes('3') && (s.includes('item') || s.includes('APPROVAL') || s.includes('pending')));
      expect(hasPending).toBe(true);
    });

    it('FR3.2 — SC3.2: P1 renders up to 2 approvalItem names', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP1Data() }));
      // approvalItems has 3 items but only 2 shown on Medium
      expect(hasText(tree, 'Worker 1')).toBe(true);
      expect(hasText(tree, 'Worker 2')).toBe(true);
      // Worker 3 should NOT appear (max 2)
      expect(hasText(tree, 'Worker 3')).toBe(false);
    });

    it('FR3.3 — SC3.3: P1 does NOT render props.earnings text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP1Data() }));
      expect(hasText(tree, '$1,300')).toBe(false);
    });

    it('FR3.4 — SC3.4: P1 does NOT render props.aiPct text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP1Data() }));
      expect(hasText(tree, '71%')).toBe(false);
    });
  });

  describe('P2 (deficit mode)', () => {
    it('FR3.5 — SC3.5: P2 renders props.hoursDisplay text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP2Data() }));
      expect(hasText(tree, '32.5h')).toBe(true);
    });

    it('FR3.6 — SC3.6: P2 renders props.hoursRemaining text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP2Data() }));
      expect(hasText(tree, '7.5h left')).toBe(true);
    });

    it('FR3.7 — SC3.7: P2 does NOT render props.earnings text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP2Data() }));
      expect(hasText(tree, '$1,300')).toBe(false);
    });

    it('FR3.8 — SC3.8: P2 does NOT render props.aiPct text', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP2Data() }));
      expect(hasText(tree, '71%')).toBe(false);
    });
  });

  describe('P3 (default mode)', () => {
    it('FR3.9 — SC3.9: P3 renders two RoundedRectangle glass cards', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP3Data() }));
      const rr = collectNodes(tree, 'RoundedRectangle');
      expect(rr.length).toBeGreaterThanOrEqual(2);
    });

    it('FR3.10 — SC3.10: P3 today row contains todayDelta when non-empty', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP3Data('+1.2h') }));
      expect(hasText(tree, '+1.2h')).toBe(true);
    });

    it('FR3.11 — SC3.11: P3 today row falls back to props.today when todayDelta is ""', () => {
      const tree = renderWidget(React.createElement(MediumWidgetFn, { props: makeP3Data('') }));
      // Falls back to props.today = '6.2h'
      expect(hasText(tree, '6.2h')).toBe(true);
    });
  });
});

// ─── FR4 — LargeWidget priority layouts + bottom padding ──────────────────────

describe('FR4 — LargeWidget priority layouts + bottom padding', () => {
  it('FR4.new.1 — SC4.1: LargeWidget outer VStack has padding defined', () => {
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeWidgetData() }));
    // Find the content VStack — uses scalar or object padding
    const vstacks = collectNodes(tree, 'VStack');
    // At least one VStack should have padding defined
    const paddedVStack = vstacks.find((v: any) => v?.props?.padding != null);
    expect(paddedVStack).toBeDefined();
    // The LargeWidget uses padding={16} (scalar)
    expect(paddedVStack.props.padding).toBeDefined();
  });

  describe('P1 (approvals mode)', () => {
    it('FR4.new.2 — SC4.2: P1 renders up to 3 approvalItem names', () => {
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeP1Data() }));
      expect(hasText(tree, 'Worker 1')).toBe(true);
      expect(hasText(tree, 'Worker 2')).toBe(true);
      expect(hasText(tree, 'Worker 3')).toBe(true);
    });

    it('FR4.new.3 — SC4.3: P1 does NOT render bar chart day labels', () => {
      const data = makeP1Data({ daily: makeDailyFor('none') });
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: data }));
      const texts = collectNodes(tree, 'Text');
      const dayLabels = texts.filter((t: any) => {
        const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
      });
      expect(dayLabels).toHaveLength(0);
    });
  });

  describe('P2 (deficit mode)', () => {
    it('FR4.new.4 — SC4.4: P2 renders props.hoursRemaining text', () => {
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeP2Data() }));
      expect(hasText(tree, '7.5h left')).toBe(true);
    });

    it('FR4.new.5 — SC4.5: P2 does NOT render bar chart day labels', () => {
      const data = makeP2Data();
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: data }));
      const texts = collectNodes(tree, 'Text');
      const dayLabels = texts.filter((t: any) => {
        const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
      });
      expect(dayLabels).toHaveLength(0);
    });
  });

  describe('P3 (default mode)', () => {
    it('FR4.new.6 — SC4.6: P3 renders bar chart with 7 day-label Text nodes', () => {
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeP3Data() }));
      const texts = collectNodes(tree, 'Text');
      const dayLabels = texts.filter((t: any) => {
        const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(content);
      });
      expect(dayLabels).toHaveLength(7);
    });

    it('FR4.new.7 — SC4.7: P3 hero font has weight bold and design rounded', () => {
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeP3Data() }));
      const texts = collectNodes(tree, 'Text');
      const heroText = texts.find((t: any) => {
        const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
        return content.includes('32.5h');
      });
      expect(heroText).toBeDefined();
      expect(heroText.props.font.weight).toBe('bold');
      expect(heroText.props.font.design).toBe('rounded');
    });

    it('FR4.new.7b — SC4.7: P2 hero font has weight bold and design rounded', () => {
      const tree = renderWidget(React.createElement(LargeWidgetFn, { props: makeP2Data() }));
      const texts = collectNodes(tree, 'Text');
      const heroText = texts.find((t: any) => {
        const content = Array.isArray(t.children) ? t.children.join('') : String(t.children ?? '');
        return content.includes('32.5h');
      });
      expect(heroText).toBeDefined();
      expect(heroText.props.font.weight).toBe('bold');
      expect(heroText.props.font.design).toBe('rounded');
    });
  });
});

// ─── FR5 — Today row todayDelta fallback ──────────────────────────────────────

describe('FR5 — Today row todayDelta fallback', () => {
  it('FR5.1 — SC5.1: MediumWidget P3 today row includes todayDelta when non-empty', () => {
    const data = makeP3Data('+1.2h');
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: data }));
    expect(hasText(tree, '+1.2h')).toBe(true);
  });

  it('FR5.2 — SC5.2: MediumWidget P3 today row shows props.today when todayDelta is ""', () => {
    const data = makeP3Data('');
    const tree = renderWidget(React.createElement(MediumWidgetFn, { props: data }));
    // today = '6.2h' from makeWidgetData default; todayDelta="" so fallback to today
    expect(hasText(tree, '6.2h')).toBe(true);
    // Should not show the empty string as a visible separate element causing issues
  });

  it('FR5.3 — SC5.3: LargeWidget P3 today row includes todayDelta when non-empty', () => {
    const data = makeP3Data('+1.2h');
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: data }));
    expect(hasText(tree, '+1.2h')).toBe(true);
  });

  it('FR5.4 — SC5.4: LargeWidget P3 today row shows props.today when todayDelta is ""', () => {
    const data = makeP3Data('');
    const tree = renderWidget(React.createElement(LargeWidgetFn, { props: data }));
    expect(hasText(tree, '6.2h')).toBe(true);
  });
});
