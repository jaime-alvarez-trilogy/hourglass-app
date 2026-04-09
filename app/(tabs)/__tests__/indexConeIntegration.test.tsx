// Tests: Hours Dashboard screen — 03-ai-tab-integration
// FR2: Compact AI Trajectory card wired into app/(tabs)/index.tsx
//
// Strategy:
// - Source-file static analysis for import/structure checks
// - Mock useAIData (new addition), useHoursData, useEarningsHistory, useConfig, useFocusKey
// - Mock AIConeChart to a testable element to verify props
// - Mock computeAICone to return known ConeData
// - Render tests via react-test-renderer for structural and ordering behavior

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

// ─── File path ────────────────────────────────────────────────────────────────

// __dirname = hourglassws/app/(tabs)/__tests__
// ../../.. = hourglassws
const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const INDEX_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'index.tsx');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/src/hooks/useHoursData');
jest.mock('@/src/hooks/useEarningsHistory');
jest.mock('@/src/hooks/useConfig');
jest.mock('@/src/hooks/useApprovalItems', () => ({
  useApprovalItems: () => ({ items: [], isLoading: false, error: null, refetch: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (cb: () => void) => { cb(); },
}));

// useFocusKey uses useIsFocused which requires NavigationContainer.
// Mock @react-navigation/native so useFocusKey works in jest-expo/node.
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      R.createElement('View', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-linear-gradient', () => {
  const R = require('react');
  return {
    LinearGradient: ({ children }: any) =>
      R.createElement(R.Fragment, null, children),
  };
});

jest.mock('react-native-web/dist/exports/TextInput/index.js', () => {
  const R = require('react');
  const mockRN = jest.requireActual('react-native-web');
  return {
    __esModule: true,
    default: ({ defaultValue, value, ...props }: any) =>
      R.createElement(mockRN.View, props,
        R.createElement(mockRN.Text, null, defaultValue ?? value ?? '')
      ),
  };
});

// FadeInScreen — stub (uses useIsFocused from react-navigation)
jest.mock('@/src/components/FadeInScreen', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) =>
      R.createElement('View', props, children),
  };
});

// AnimatedMeshBackground — stub
jest.mock('@/src/components/AnimatedMeshBackground', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: ({ panelState, ...props }: any) =>
      R.createElement('View', { testID: 'animated-mesh-bg', ...props }),
  };
});

// AIConeChart — mock to a testable element to verify props without Skia
jest.mock('@/src/components/AIConeChart', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: ({ data, width, height, size, ...props }: any) =>
      R.createElement('AIConeChart', { data, width, height, size, ...props }),
    AIConeChart: ({ data, width, height, size, ...props }: any) =>
      R.createElement('AIConeChart', { data, width, height, size, ...props }),
  };
});

// computeAICone — mock to return known ConeData
const MOCK_CONE_DATA = {
  actualPoints: [{ hoursX: 0, pctY: 0 }, { hoursX: 15, pctY: 80 }],
  upperBound: [{ hoursX: 15, pctY: 80 }, { hoursX: 40, pctY: 97 }],
  lowerBound: [{ hoursX: 15, pctY: 80 }, { hoursX: 40, pctY: 60 }],
  currentHours: 15,
  currentAIPct: 80,
  weeklyLimit: 40,
  targetPct: 75,
  isTargetAchievable: true,
};

const mockComputeAICone = jest.fn(() => MOCK_CONE_DATA);
jest.mock('@/src/lib/aiCone', () => ({
  computeAICone: (...args: any[]) => mockComputeAICone(...args),
}));

// useAIData — mock for the new hook call in index.tsx (FR2)
const mockUseAIData = jest.fn();
jest.mock('@/src/hooks/useAIData', () => ({
  useAIData: (...args: any[]) => mockUseAIData(...args),
}));

// ─── Typed mock imports ───────────────────────────────────────────────────────

import { useHoursData } from '@/src/hooks/useHoursData';
import { useEarningsHistory } from '@/src/hooks/useEarningsHistory';
import { useConfig } from '@/src/hooks/useConfig';
import HoursDashboard from '../index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
  timeRemaining: 48 * 60 * 60 * 1000,
  deadline: new Date('2026-03-15T23:59:59Z'),
};

const MOCK_AI_DATA = {
  aiPctLow: 73,
  aiPctHigh: 77,
  brainliftHours: 3.5,
  totalSlots: 180,
  taggedSlots: 160,
  workdaysElapsed: 4,
  dailyBreakdown: [
    { date: '2026-03-09', total: 45, aiUsage: 38, secondBrain: 12, noTags: 4, isToday: false },
    { date: '2026-03-10', total: 43, aiUsage: 35, secondBrain: 9,  noTags: 3, isToday: false },
    { date: '2026-03-11', total: 46, aiUsage: 39, secondBrain: 0,  noTags: 2, isToday: true  },
  ],
};

function setupMocks(opts: {
  hoursData?: typeof MOCK_HOURS_DATA | null;
  isHoursLoading?: boolean;
  isStale?: boolean;
  cachedAt?: string | null;
  hoursError?: string | null;
  config?: typeof MOCK_CONFIG | null;
  aiData?: typeof MOCK_AI_DATA | null;
} = {}) {
  (useHoursData as jest.Mock).mockReturnValue({
    data: opts.hoursData !== undefined ? opts.hoursData : MOCK_HOURS_DATA,
    isLoading: opts.isHoursLoading ?? false,
    isStale: opts.isStale ?? false,
    cachedAt: opts.cachedAt ?? null,
    error: opts.hoursError ?? null,
    refetch: jest.fn(),
  });
  (useConfig as jest.Mock).mockReturnValue({
    config: opts.config !== undefined ? opts.config : MOCK_CONFIG,
    isLoading: false,
    refetch: jest.fn(),
  });
  (useEarningsHistory as jest.Mock).mockReturnValue({
    trend: [600, 650, 700, 712],
    isLoading: false,
  });
  mockUseAIData.mockReturnValue({
    data: opts.aiData !== undefined ? opts.aiData : MOCK_AI_DATA,
    isLoading: false,
    lastFetchedAt: null,
    error: null,
    refetch: jest.fn(),
    previousWeekPercent: undefined,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderDashboard(): any {
  let tree: any;
  act(() => { tree = create(React.createElement(HoursDashboard)); });
  return tree;
}

function findByType(node: any, type: string): any {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (node.type === type) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findByType(child, type);
      if (found) return found;
    }
  }
  return null;
}

function allText(tree: any): string {
  const collected: string[] = [];
  collectText(tree.toJSON(), collected);
  return collected.join(' ');
}

function collectText(node: any, collected: string[]): void {
  if (!node) return;
  if (typeof node === 'string') { collected.push(node); return; }
  if (Array.isArray(node)) { for (const c of node) collectText(c, collected); return; }
  if (node.children) { for (const c of node.children) collectText(c, collected); }
}

// ─── FR2: Compact Cone Card — Source Structure ────────────────────────────────

describe('HoursDashboard FR2 — source: imports and structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
  });

  it('SC2.1 — imports useAIData from @/src/hooks/useAIData', () => {
    expect(source).toContain('useAIData');
    expect(source).toMatch(/from\s+['"]@\/src\/hooks\/useAIData['"]/);
  });

  it('SC2.2 — imports AIConeChart from @/src/components/AIConeChart', () => {
    expect(source).toContain('AIConeChart');
    expect(source).toMatch(/from\s+['"]@\/src\/components\/AIConeChart['"]/);
  });

  it('SC2.3 — imports computeAICone from @/src/lib/aiCone', () => {
    expect(source).toContain('computeAICone');
    expect(source).toMatch(/from\s+['"]@\/src\/lib\/aiCone['"]/);
  });

  it('SC2.4 — renders AI TRAJECTORY section label text', () => {
    expect(source).toContain('AI TRAJECTORY');
  });

  it('SC2.5 — renders AIConeChart with size="compact"', () => {
    expect(source).toMatch(/size\s*=\s*['"]compact['"]/);
  });

  it('SC2.6 — compact cone chart uses height={100}', () => {
    // The compact card View wrapper uses height: 100 and chart gets height={100}
    expect(source).toMatch(/height\s*[=:]\s*\{?\s*100\s*\}?/);
  });

  it('SC2.7 — compact card uses conditional render (coneData &&)', () => {
    // Card only rendered when coneData is available
    expect(source).toMatch(/\bconePct\b|coneData\s*&&|\{coneData/);
  });

  it('SC2.8 — compact card has NO TouchableOpacity wrapper (view-only)', () => {
    // Extract just the AI TRAJECTORY card section to verify no onPress
    // We can't do this precisely with regex alone, but we check that
    // the source does NOT have onPress near AIConeChart
    const coneSection = source.match(/AI TRAJECTORY[\s\S]{0,400}/);
    if (coneSection) {
      expect(coneSection[0]).not.toContain('onPress');
    } else {
      // If we can't isolate it, assert globally on compact card: no onPress on cone view
      // The index has onPress only on settings button, not near the compact cone
      expect(source).not.toMatch(/AI TRAJECTORY[\s\S]{0,300}onPress/);
    }
  });

  it('SC2.9 — passes key={chartKey} to compact AIConeChart', () => {
    expect(source).toMatch(/AIConeChart[\s\S]{0,300}key\s*=\s*\{chartKey\}/);
  });
});

// ─── FR2: Compact Cone Card — Render: happy path ─────────────────────────────

describe('HoursDashboard FR2 — render: compact card with AI data', () => {
  beforeEach(() => {
    mockComputeAICone.mockReturnValue(MOCK_CONE_DATA);
    setupMocks();
  });

  it('SC2.10 — renders without crash when aiData is available', () => {
    expect(() => { renderDashboard(); }).not.toThrow();
  });

  it('SC2.11 — renders AI TRAJECTORY text in output', () => {
    const tree = renderDashboard();
    const text = allText(tree);
    expect(text).toContain('AI TRAJECTORY');
  });

  it('SC2.12 — renders AIConeChart component when aiData is available', () => {
    const tree = renderDashboard();
    const coneChart = findByType(tree.toJSON(), 'AIConeChart');
    expect(coneChart).not.toBeNull();
  });

  it('SC2.13 — AIConeChart receives size="compact"', () => {
    const tree = renderDashboard();
    const coneChart = findByType(tree.toJSON(), 'AIConeChart');
    expect(coneChart).not.toBeNull();
    expect(coneChart.props.size).toBe('compact');
  });

  it('SC2.14 — AIConeChart receives height={100}', () => {
    const tree = renderDashboard();
    const coneChart = findByType(tree.toJSON(), 'AIConeChart');
    expect(coneChart).not.toBeNull();
    expect(coneChart.props.height).toBe(100);
  });

  it('SC2.15 — AIConeChart receives the ConeData from computeAICone', () => {
    const tree = renderDashboard();
    const coneChart = findByType(tree.toJSON(), 'AIConeChart');
    expect(coneChart).not.toBeNull();
    expect(coneChart.props.data).toBe(MOCK_CONE_DATA);
  });

  it('SC2.16 — computeAICone called with dailyBreakdown, weeklyLimit=40, and previousWeekPercent', () => {
    renderDashboard();
    expect(mockComputeAICone).toHaveBeenCalledWith(
      MOCK_AI_DATA.dailyBreakdown,
      40,
      undefined, // previousWeekPercent from mock (no history)
    );
  });
});

// ─── FR2: Compact Cone Card — Render: null guard when aiData=null ─────────────

describe('HoursDashboard FR2 — render: compact card absent when aiData=null', () => {
  beforeEach(() => {
    mockComputeAICone.mockReturnValue(MOCK_CONE_DATA);
    setupMocks({ aiData: null });
  });

  it('SC2.17 — renders without crash when aiData=null', () => {
    expect(() => { renderDashboard(); }).not.toThrow();
  });

  it('SC2.18 — does NOT render AIConeChart when aiData=null', () => {
    const tree = renderDashboard();
    const coneChart = findByType(tree.toJSON(), 'AIConeChart');
    expect(coneChart).toBeNull();
  });

  it('SC2.19 — does NOT render AI TRAJECTORY text when aiData=null', () => {
    const tree = renderDashboard();
    const text = allText(tree);
    expect(text).not.toContain('AI TRAJECTORY');
  });
});

// ─── FR2: Compact Cone Card — render order (between Zone 2 and Zone 3) ────────

describe('HoursDashboard FR2 — render order: compact card between THIS WEEK and EARNINGS', () => {
  beforeEach(() => {
    mockComputeAICone.mockReturnValue(MOCK_CONE_DATA);
    setupMocks();
  });

  it('SC2.20 — THIS WEEK text appears before AI TRAJECTORY in render output', () => {
    const tree = renderDashboard();
    const text = allText(tree);
    const thisWeekIdx = text.indexOf('THIS WEEK');
    const aiTrajIdx = text.indexOf('AI TRAJECTORY');
    expect(thisWeekIdx).toBeGreaterThanOrEqual(0);
    expect(aiTrajIdx).toBeGreaterThanOrEqual(0);
    expect(thisWeekIdx).toBeLessThan(aiTrajIdx);
  });

  it('SC2.21 — AI TRAJECTORY text appears before EARNINGS in render output', () => {
    const tree = renderDashboard();
    const text = allText(tree);
    const aiTrajIdx = text.indexOf('AI TRAJECTORY');
    const earningsIdx = text.indexOf('EARNINGS');
    expect(aiTrajIdx).toBeGreaterThanOrEqual(0);
    expect(earningsIdx).toBeGreaterThanOrEqual(0);
    expect(aiTrajIdx).toBeLessThan(earningsIdx);
  });
});

// ─── FR2: No tap handler on compact card ─────────────────────────────────────

describe('HoursDashboard FR2 — compact card is view-only (no tap handler)', () => {
  beforeEach(() => {
    mockComputeAICone.mockReturnValue(MOCK_CONE_DATA);
    setupMocks();
  });

  it('SC2.22 — AI TRAJECTORY card section label has no onPress in source', () => {
    const source = fs.readFileSync(INDEX_FILE, 'utf8');
    // The AI TRAJECTORY block must not have an onPress handler
    // We check the source region from "AI TRAJECTORY" forward for 400 chars
    const match = source.match(/AI TRAJECTORY[\s\S]{0,400}/);
    if (match) {
      expect(match[0]).not.toContain('onPress');
    }
    // Passes if no match (AI TRAJECTORY not yet added — will fail SC2.4 first)
  });
});

// ─── FR2: weeklyLimit from existing useConfig ─────────────────────────────────

describe('HoursDashboard FR2 — weeklyLimit reuses config.weeklyLimit from useConfig', () => {
  it('SC2.23 — computeAICone called with weeklyLimit=30 when config.weeklyLimit=30', () => {
    mockComputeAICone.mockReturnValue(MOCK_CONE_DATA);
    setupMocks({ config: { ...MOCK_CONFIG, weeklyLimit: 30 } });

    renderDashboard();

    expect(mockComputeAICone).toHaveBeenCalledWith(
      expect.anything(),
      30,
      undefined, // previousWeekPercent from mock (no history)
    );
  });
});
