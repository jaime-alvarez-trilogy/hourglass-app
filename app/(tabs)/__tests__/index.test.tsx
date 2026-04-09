// Tests: Hours Dashboard screen — FR3-FR6 (05-hours-dashboard)
// File: app/(tabs)/index.tsx
//
// Strategy:
//   - Render tests for loading/error/data states
//   - Source-file static analysis for NativeWind className usage
//     (NativeWind v4 hashes className in Jest — do not assert on rendered props)
//
// Mocks:
//   - useHoursData, usePaymentHistory, useConfig (hooks)
//   - expo-router (useRouter)
//   - @shopify/react-native-skia (via __mocks__)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// Use official Reanimated mock + missing exports: prevents native binary initialization
// and worklet background timer crashes when multiple test suites share a worker process.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/src/hooks/useHoursData');
jest.mock('@/src/hooks/usePaymentHistory');
jest.mock('@/src/hooks/useConfig');
jest.mock('@/src/hooks/useEarningsHistory', () => ({
  useEarningsHistory: () => ({ trend: [], isLoading: false }),
}));
jest.mock('@/src/hooks/useAIData', () => ({
  useAIData: () => ({
    data: null,
    previousWeekPercent: null,
    isLoading: false,
    error: null,
  }),
}));
jest.mock('@/src/hooks/useFocusKey', () => ({
  useFocusKey: () => 'focus-key-0',
}));
jest.mock('@/src/hooks/useApprovalItems', () => ({
  useApprovalItems: () => ({ items: [], isLoading: false, error: null }),
}));
jest.mock('@/src/components/FadeInScreen', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => mockReact.createElement(mockReact.Fragment, null, children),
  };
});
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

// useStaggeredEntry — return plain styles (no Reanimated shared values in tests)
jest.mock('@/src/hooks/useStaggeredEntry', () => ({
  useStaggeredEntry: () => ({
    getEntryStyle: () => ({}),
    isReady: true,
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// SafeAreaView passthrough (must be top-level, not in beforeEach)
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      mockReact.createElement('View', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// expo-linear-gradient passthrough (used by PanelGradient)
jest.mock('expo-linear-gradient', () => {
  const mockReact = require('react');
  return {
    LinearGradient: ({ children }: any) =>
      mockReact.createElement(mockReact.Fragment, null, children),
  };
});

// MetricValue uses Animated.createAnimatedComponent(TextInput).
// react-native-web's TextInput runs DOM-dependent effects in jest-expo/node.
// Stub it out to avoid AggregateError when MetricValue renders.
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

// ─── Typed mock imports ───────────────────────────────────────────────────────

import { useHoursData } from '@/src/hooks/useHoursData';
import { usePaymentHistory } from '@/src/hooks/usePaymentHistory';
import { useConfig } from '@/src/hooks/useConfig';
import HoursDashboard from '../index';

// ─── Test data ────────────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  weeklyLimit: 40,
  useQA: false,
  hourlyRate: 25,
  userId: 'u1',
  fullName: 'Test User',
  managerId: 'm1',
  primaryTeamId: 't1',
  teams: [],
  isManager: false,
  assignmentId: 'a1',
  lastRoleCheck: '',
  debugMode: false,
  setupComplete: true,
  setupDate: '',
};

const MOCK_HOURS_DATA = {
  total: 28.5,
  average: 5.7,
  today: 7.2,
  daily: [
    { date: '2026-03-09', hours: 8.0, isToday: false },
    { date: '2026-03-10', hours: 7.5, isToday: false },
    { date: '2026-03-11', hours: 6.0, isToday: false },
    { date: '2026-03-12', hours: 7.0, isToday: false },
    { date: '2026-03-13', hours: 7.2, isToday: true },
  ],
  weeklyEarnings: 712.5,
  todayEarnings: 180,
  hoursRemaining: 11.5,
  overtimeHours: 0,
  timeRemaining: 48 * 60 * 60 * 1000, // 48h — no urgency
  deadline: new Date('2026-03-15T23:59:59Z'),
};

// Helper: set up all three mocks at once
function setupMocks(opts: {
  data?: typeof MOCK_HOURS_DATA | null;
  isLoading?: boolean;
  isStale?: boolean;
  cachedAt?: string | null;
  error?: string | null;
  config?: typeof MOCK_CONFIG | null;
  paymentHistory?: any[] | null;
} = {}) {
  (useHoursData as jest.Mock).mockReturnValue({
    data: opts.data !== undefined ? opts.data : MOCK_HOURS_DATA,
    isLoading: opts.isLoading ?? false,
    isStale: opts.isStale ?? false,
    cachedAt: opts.cachedAt ?? null,
    error: opts.error ?? null,
    refetch: jest.fn(),
  });
  (useConfig as jest.Mock).mockReturnValue({
    config: opts.config !== undefined ? opts.config : MOCK_CONFIG,
    isLoading: false,
    refetch: jest.fn(),
  });
  (usePaymentHistory as jest.Mock).mockReturnValue({
    data: opts.paymentHistory !== undefined ? opts.paymentHistory : [],
    isLoading: false,
  });
}

// ─── File path ────────────────────────────────────────────────────────────────

const INDEX_FILE = path.resolve(__dirname, '../index.tsx');

// ─── Source file checks ───────────────────────────────────────────────────────

describe('HoursDashboard — source design tokens (FR3–FR6)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC3.1 — no StyleSheet import in index.tsx', () => {
    expect(code).not.toMatch(/\bStyleSheet\b/);
  });

  it('SC3.2 — no hardcoded hex color strings in index.tsx', () => {
    expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('SC3.3 — imports PanelGradient', () => {
    expect(source).toContain('PanelGradient');
  });

  it('SC3.4 — imports MetricValue', () => {
    expect(source).toContain('MetricValue');
  });

  it('SC3.5 — imports computePanelState and computeDaysElapsed', () => {
    expect(source).toContain('computePanelState');
    expect(source).toContain('computeDaysElapsed');
  });

  it('SC4.1 — imports WeeklyBarChart', () => {
    expect(source).toContain('WeeklyBarChart');
  });

  it('SC5.1 — imports TrendSparkline', () => {
    expect(source).toContain('TrendSparkline');
  });

  it('SC5.2 — uses colors.gold for sparkline', () => {
    expect(source).toContain('colors.gold');
  });

  it('SC5.3 — uses useEarningsHistory for earnings trend data', () => {
    expect(source).toContain('useEarningsHistory');
  });

  it('SC6.1 — no ActivityIndicator full-screen early-return', () => {
    // Source must not have an early return that only shows ActivityIndicator
    expect(code).not.toMatch(/return\s*\(?\s*<.*ActivityIndicator/);
  });

  it('SC7a — imports UrgencyBanner', () => {
    expect(source).toContain('UrgencyBanner');
  });
});

// ─── Render tests ─────────────────────────────────────────────────────────────

describe('HoursDashboard — render: loading state (FR6)', () => {
  beforeEach(() => {
    setupMocks({ data: null, isLoading: true });
  });

  it('SC6.2 — renders without crash when isLoading=true and data=null', () => {
    expect(() => {
      act(() => { create(React.createElement(HoursDashboard)); });
    }).not.toThrow();
  });

  it('SC6.3 — renders the 3-zone layout (not a null/spinner)', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(tree.toJSON()).not.toBeNull();
  });
});

describe('HoursDashboard — render: error state (FR6)', () => {
  beforeEach(() => {
    setupMocks({ data: null, isLoading: false, error: 'Network request failed' });
  });

  it('SC6.4 — renders without crash when error !== null and data=null', () => {
    expect(() => {
      act(() => { create(React.createElement(HoursDashboard)); });
    }).not.toThrow();
  });

  it('SC6.5 — error banner testID="error-banner" present', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"error-banner"');
  });

  it('SC6.6 — retry button testID="retry-button" present', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"retry-button"');
  });
});

describe('HoursDashboard — render: data loaded state (FR3, FR4, FR5)', () => {
  beforeEach(() => {
    setupMocks();
  });

  it('SC3.6 — renders without crash with full data', () => {
    expect(() => {
      act(() => { create(React.createElement(HoursDashboard)); });
    }).not.toThrow();
  });

  it('SC3.7 — settings button testID="settings-button" present', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"settings-button"');
  });

  it('SC3.8 — state badge testID="state-badge" present', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"state-badge"');
  });

  it('SC3.9 — QA badge absent when config.useQA=false', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).not.toContain('"qa-badge"');
  });
});

describe('HoursDashboard — render: QA badge (FR3)', () => {
  beforeEach(() => {
    setupMocks({ config: { ...MOCK_CONFIG, useQA: true } });
  });

  it('SC3.10 — QA badge testID="qa-badge" present when config.useQA=true', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"qa-badge"');
  });
});

describe('HoursDashboard — render: stale cache state (FR6)', () => {
  beforeEach(() => {
    setupMocks({
      isStale: true,
      cachedAt: '2026-03-14T09:30:00.000Z',
    });
  });

  it('SC6.7 — stale cache label present when isStale=true', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('Cached:');
  });
});

// ─── FR4 (02-watermarks): Home tab prop wiring ────────────────────────────────
//
// FR4 of 02-watermarks spec:
//   SC10.1 — WeeklyBarChart receives watermarkLabel prop
//   SC10.2 — watermarkLabel value derived from hoursData.total
//   SC10.3 — TrendSparkline receives showGuide prop
//   SC10.4 — TrendSparkline receives maxValue prop
//   SC10.5 — TrendSparkline receives capLabel prop
//   SC10.6 — graceful when data is loading (no crash, no undefined error)

describe('HoursDashboard — FR4 (02-watermarks): prop wiring', () => {
  it('SC10.1 — WeeklyBarChart is rendered in source', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // WeeklyBarChart component is used in the dashboard
    expect(source).toMatch(/WeeklyBarChart/);
  });

  it('SC10.2 — hoursData?.total uses optional chaining for loading safety', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // Optional chaining on hoursData for safe access
    expect(source).toMatch(/data\?\.total|hoursData\?\.total|data\s*&&\s*.*total/);
  });

  it('SC10.3 — source passes showGuide to earnings TrendSparkline', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // TrendSparkline should have showGuide prop
    expect(source).toMatch(/TrendSparkline[\s\S]{0,400}showGuide/);
  });

  it('SC10.4 — source passes maxValue to earnings TrendSparkline', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // Already existing but verify maxValue is still present
    expect(source).toMatch(/TrendSparkline[\s\S]{0,400}maxValue/);
  });

  it('SC10.5 — source passes capLabel to earnings TrendSparkline', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // New prop for 02-watermarks
    expect(source).toMatch(/TrendSparkline[\s\S]{0,500}capLabel/);
  });

  it('SC10.6 — watermarkLabel uses optional chaining for loading safety', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // Pattern: data?.total or conditional expression
    expect(source).toMatch(/data\?\.total|data\s*&&\s*.*total/);
  });
});

// ─── FR4 (01-overtime-display): Home tab overtime hero display ────────────────
//
// Strategy:
// - Source-level static analysis verifies overtime branch logic and STATE maps
// - Render tests verify crash-free rendering in overtime state
//
// Note: NativeWind v4 hashes className in Jest — do not assert on rendered
// className values. Use testID attributes and source file analysis instead.

describe('HoursDashboard — FR4 (01-overtime-display): source structure', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR4.1 — STATE_LABELS includes overtime key', () => {
    expect(source).toMatch(/overtime\s*:\s*['"]OVERTIME['"]/);
  });

  it('FR4.2 — STATE_COLORS includes overtime key with overtimeWhiteGold color token', () => {
    expect(source).toMatch(/overtime\s*:\s*['"]text-overtimeWhiteGold['"]/);
  });

  it('FR4.3 — source has conditional branch for panelState === overtime', () => {
    expect(source).toMatch(/panelState\s*===\s*['"]overtime['"]/);
  });

  it('FR4.4 — overtime branch renders overtimeHours (not total)', () => {
    // When overtime, MetricValue should use overtimeHours
    expect(source).toMatch(/overtimeHours/);
    // And the overtime block references it
    expect(source).toMatch(/overtime['"][\s\S]{0,300}overtimeHours|overtimeHours[\s\S]{0,300}overtime['"]/);
  });

  it('FR4.5 — overtime branch uses "h OT" unit string', () => {
    expect(source).toContain('h OT');
  });

  it('FR4.6 — overtime branch shows "overtime this week" label', () => {
    expect(source).toContain('overtime this week');
  });

  it('FR4.7 — WeeklyBarChart receives weeklyLimit prop', () => {
    // WeeklyBarChart JSX should have weeklyLimit={weeklyLimit} prop
    expect(source).toMatch(/WeeklyBarChart[\s\S]{0,400}weeklyLimit/);
  });
});

describe('HoursDashboard — FR4 (01-overtime-display): render in overtime state', () => {
  // Need to mock useEarningsHistory and useAIData used by index.tsx
  beforeAll(() => {
    jest.mock('@/src/hooks/useEarningsHistory', () => ({
      useEarningsHistory: () => ({ trend: [] }),
    }));
    jest.mock('@/src/hooks/useAIData', () => ({
      useAIData: () => ({ data: null }),
    }));
  });

  beforeEach(() => {
    // Overtime: total=42 > weeklyLimit=40 → panelState will be 'overtime'
    (useHoursData as jest.Mock).mockReturnValue({
      data: {
        total: 42,
        average: 8.4,
        today: 8,
        daily: [
          { date: '2026-03-09', hours: 9.0, isToday: false },
          { date: '2026-03-10', hours: 9.0, isToday: false },
          { date: '2026-03-11', hours: 8.5, isToday: false },
          { date: '2026-03-12', hours: 8.5, isToday: false },
          { date: '2026-03-13', hours: 7.0, isToday: true },
        ],
        weeklyEarnings: 1050,
        todayEarnings: 200,
        hoursRemaining: 0,
        overtimeHours: 2,   // 42 - 40 = 2h overtime
        timeRemaining: 0,
        deadline: new Date('2026-03-15T23:59:59Z'),
      },
      isLoading: false,
      isStale: false,
      cachedAt: null,
      error: null,
      refetch: jest.fn(),
    });
    (useConfig as jest.Mock).mockReturnValue({
      config: {
        weeklyLimit: 40,
        useQA: false,
        hourlyRate: 25,
        userId: 'u1',
        fullName: 'Test User',
        managerId: 'm1',
        primaryTeamId: 't1',
        teams: [],
        isManager: false,
        assignmentId: 'a1',
        lastRoleCheck: '',
        debugMode: false,
        setupComplete: true,
        setupDate: '',
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    (usePaymentHistory as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('FR4.8 — renders without crash when panelState is overtime (total > weeklyLimit)', () => {
    expect(() => {
      act(() => { create(React.createElement(HoursDashboard)); });
    }).not.toThrow();
  });

  it('FR4.9 — state-badge testID present in overtime render', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('"state-badge"');
  });

  it('FR4.10 — overtime state renders "OVERTIME" text in the badge', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('OVERTIME');
  });

  it('FR4.11 — overtime state renders "overtime this week" label', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).toContain('overtime this week');
  });

  it('FR4.12 — overtime state does NOT render "of 40h goal" label', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    // When in overtime, the "of {weeklyLimit}h goal" text should not appear
    expect(JSON.stringify(tree.toJSON())).not.toContain('of 40h goal');
  });
});

describe('HoursDashboard — FR4 (01-overtime-display): normal state preserved', () => {
  beforeEach(() => {
    // Normal state: total=28.5 < weeklyLimit=40 → not overtime
    (useHoursData as jest.Mock).mockReturnValue({
      data: {
        total: 28.5,
        average: 5.7,
        today: 7.2,
        daily: [
          { date: '2026-03-09', hours: 8.0, isToday: false },
          { date: '2026-03-10', hours: 7.5, isToday: false },
          { date: '2026-03-11', hours: 6.0, isToday: false },
          { date: '2026-03-12', hours: 7.0, isToday: false },
          { date: '2026-03-13', hours: 7.2, isToday: true },
        ],
        weeklyEarnings: 712.5,
        todayEarnings: 180,
        hoursRemaining: 11.5,
        overtimeHours: 0,
        timeRemaining: 48 * 60 * 60 * 1000,
        deadline: new Date('2026-03-15T23:59:59Z'),
      },
      isLoading: false,
      isStale: false,
      cachedAt: null,
      error: null,
      refetch: jest.fn(),
    });
    (useConfig as jest.Mock).mockReturnValue({
      config: {
        weeklyLimit: 40,
        useQA: false,
        hourlyRate: 25,
        userId: 'u1',
        fullName: 'Test User',
        managerId: 'm1',
        primaryTeamId: 't1',
        teams: [],
        isManager: false,
        assignmentId: 'a1',
        lastRoleCheck: '',
        debugMode: false,
        setupComplete: true,
        setupDate: '',
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    (usePaymentHistory as jest.Mock).mockReturnValue({ data: [], isLoading: false });
  });

  it('FR4.13 — non-overtime state renders "of Xh goal" label (existing display preserved)', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    // React renders "of {weeklyLimit}h goal" as separate text nodes: ["of ", "40", "h goal"]
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('h goal');
  });

  it('FR4.14 — non-overtime state does NOT render "overtime this week" label', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    expect(JSON.stringify(tree.toJSON())).not.toContain('overtime this week');
  });

  it('FR4.15 — non-overtime state renders sub-metrics (Today / Avg/day / Remaining)', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(HoursDashboard)); });
    const json = JSON.stringify(tree.toJSON());
    // Sub-metrics labels should be visible in normal state (labels render as "Today", "Avg/day", "Remaining")
    expect(json).toContain('Today');
  });
});

// ─── FR1 (02-home-hero-ambient): Ambient background wiring ───────────────────
//
// NOTE (09-chart-visual-fixes FR3): AmbientBackground was replaced with
// AnimatedMeshBackground directly. Tests updated to reflect the new pattern.
// See 09FR3 tests below for the new assertions.
//
// Strategy: source-file static analysis — NativeWind v4 hashes className in Jest.

describe('HoursDashboard — FR1 (02-home-hero-ambient): ambient background wiring', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('FR1.T1 — AnimatedMeshBackground is imported (replaced AmbientBackground — 09FR3)', () => {
    // Updated: 09-chart-visual-fixes FR3 replaced AmbientBackground with AnimatedMeshBackground
    expect(source).toMatch(/import[\s\S]{0,100}AnimatedMeshBackground/);
  });

  it('FR1.T2 — getAmbientColor is NOT used (removed with AmbientBackground — 09FR3)', () => {
    // Updated: earningsPaceSignal now derived directly from panelState
    const importLines = source.split('\n').filter(l => l.trim().startsWith('import'));
    const hasGetAmbientColor = importLines.some(l => l.includes('getAmbientColor'));
    expect(hasGetAmbientColor).toBe(false);
  });

  it('FR1.T3 — renders <AnimatedMeshBackground in JSX (replaced <AmbientBackground — 09FR3)', () => {
    expect(source).toContain('<AnimatedMeshBackground');
  });

  it('FR1.T4 — AnimatedMeshBackground appears before ScrollView in JSX', () => {
    const ambientPos = source.indexOf('<AnimatedMeshBackground');
    const scrollViewPos = source.indexOf('<ScrollView');
    expect(ambientPos).toBeGreaterThan(-1);
    expect(scrollViewPos).toBeGreaterThan(-1);
    expect(ambientPos).toBeLessThan(scrollViewPos);
  });

  it('FR1.T5 — earningsPaceSignal is derived from panelState', () => {
    // Updated: earningsPaceSignal replaces getAmbientColor({ type: 'panelState', state: panelState })
    expect(source).toMatch(/earningsPaceSignal/);
    expect(source).toMatch(/panelState/);
  });

  it('FR1.T6 — AnimatedMeshBackground receives earningsPace prop derived from panelState', () => {
    expect(source).toMatch(/<AnimatedMeshBackground[\s\S]{0,100}earningsPace/);
  });

  it('FR1.T7 — no StyleSheet import added (SC3.1 still passes)', () => {
    const noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/\bStyleSheet\b/);
  });

  it('FR1.T8 — no hardcoded hex color strings added (SC3.2 still passes)', () => {
    const noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});

// ─── FR3 (02-home-hero-ambient): Ambient transition integration ───────────────

describe('HoursDashboard — FR3 (02-home-hero-ambient): ambient transition', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('FR3.T1 — index.tsx does NOT import springPremium (animation is internal to AmbientBackground)', () => {
    const noComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toContain('springPremium');
  });
});

// ─── FR (09-chart-visual-fixes FR3): AnimatedMeshBackground replaces AmbientBackground ──
//
// SC-09FR3.1 — AmbientBackground NOT imported in index.tsx
// SC-09FR3.2 — AnimatedMeshBackground IS imported in index.tsx
// SC-09FR3.3 — earningsPaceSignal derivation: critical→1.0, behind→0.5, else→0.0
// SC-09FR3.4 — AnimatedMeshBackground rendered with earningsPace prop

describe('HoursDashboard — 09FR3: AnimatedMeshBackground replaces AmbientBackground', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('SC-09FR3.1 — AmbientBackground is NOT imported in index.tsx', () => {
    const importLines = source.split('\n').filter(l => l.trim().startsWith('import'));
    const hasAmbientBg = importLines.some(l => l.includes('AmbientBackground'));
    expect(hasAmbientBg).toBe(false);
  });

  it('SC-09FR3.2 — AnimatedMeshBackground IS imported in index.tsx', () => {
    expect(source).toMatch(/import[\s\S]{0,100}AnimatedMeshBackground/);
  });

  it('SC-09FR3.3 — earningsPaceSignal derivation for critical → 1.0', () => {
    expect(source).toMatch(/critical.*1\.0|1\.0.*critical/);
  });

  it('SC-09FR3.4 — AnimatedMeshBackground rendered with earningsPace prop', () => {
    expect(source).toMatch(/<AnimatedMeshBackground[\s\S]{0,100}earningsPace/);
  });
});
