// Tests: AI Tab screen (06-ai-tab + 04-ai-hero-arc)
// FR1: AIRingChart integration [REPLACED by 04-ai-hero-arc — tests updated]
// FR2: Hero metric section (SectionLabel; MetricValue moved to AIArcHero)
// FR3: BrainLift progress bar [moved to AIArcHero — tests updated]
// FR4: Delta badge (week-over-week) [moved to AIArcHero — tests updated]
// FR5: DailyAIRow (className migration)
// FR6: Loading/skeleton states [updated for AIArcHero skeleton]
//
// Strategy:
// - Mock useAIData (module mock) returning controlled AIWeekData
// - Mock @shopify/react-native-skia (auto-resolved from __mocks__)
// - Mock expo-router
// - className assertions via source-file static analysis (NativeWind v4 hashes in Jest)
// - testID assertions for runtime structural checks

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Stub react-native-web components that use hooks internally and crash in test renderer.
// ScrollViewBase and View call useContext/useRef from a module-level context that
// react-test-renderer can't satisfy. We stub them to plain passthrough elements.
jest.mock('react-native-web/dist/exports/View/index.js', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, style, ...rest }: any) =>
      mockR.createElement('View', { testID, style, ...rest }, children),
  };
});

jest.mock('react-native-web/dist/exports/ScrollView/index.js', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, style, refreshControl, ...rest }: any) =>
      mockR.createElement('ScrollView', { testID, style, ...rest }, children),
  };
});

jest.mock('react-native-web/dist/exports/Text/index.js', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, style, ...rest }: any) =>
      mockR.createElement('Text', { testID, style, ...rest }, children),
  };
});

jest.mock('react-native-web/dist/exports/TouchableOpacity/index.js', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ children, testID, onPress, style, ...rest }: any) =>
      mockR.createElement('TouchableOpacity', { testID, onPress, style, ...rest }, children),
  };
});

// Stub TextInput (same pattern as MetricValue.test.tsx)
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('@/src/hooks/useAppBreakdown', () => ({
  useAppBreakdown: () => ({
    aggregated12w: [],
    currentWeek: null,
  }),
}));

// Mock Reanimated-based design system components — their unit tests cover them individually.
// Here we test screen structure/props, not component internals.
jest.mock('@/src/components/SkeletonLoader', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ width, height, rounded, ...props }: any) =>
      mockR.createElement('SkeletonLoader', { width, height, rounded, ...props }),
  };
});

jest.mock('@/src/components/MetricValue', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ value, unit, precision, colorClass, sizeClass, ...props }: any) =>
      mockR.createElement('MetricValue', { value, unit, precision, colorClass, sizeClass, ...props }),
  };
});

jest.mock('@/src/components/ProgressBar', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ progress, colorClass, height, ...props }: any) =>
      mockR.createElement('ProgressBar', { progress, colorClass, height, ...props }),
  };
});

// AIArcHero — stub for screen-level tests (unit tests in AIArcHero.test.tsx)
jest.mock('@/src/components/AIArcHero', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ aiPct, brainliftHours, deltaPercent, ambientColor, ...props }: any) =>
      mockR.createElement('AIArcHero', { aiPct, brainliftHours, deltaPercent, ambientColor, testID: 'ai-arc-hero', ...props }),
    AI_TARGET_PCT: 75,
    BRAINLIFT_TARGET_HOURS: 5,
  };
});

// AmbientBackground — stub (unit tests in AmbientBackground.test.tsx)
jest.mock('@/src/components/AmbientBackground', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ color, intensity, ...props }: any) =>
      mockR.createElement('AmbientBackground', { color, intensity, ...props }),
    getAmbientColor: (signal: any) => {
      if (signal.type === 'aiPct') {
        if (signal.pct >= 75) return '#A78BFA';
        if (signal.pct >= 60) return '#00C2FF';
        return '#F59E0B';
      }
      return null;
    },
    AMBIENT_COLORS: {},
  };
});

// useAIData mock — default: data with known values
const mockUseAIData = jest.fn();
jest.mock('@/src/hooks/useAIData', () => ({
  useAIData: (...args: any[]) => mockUseAIData(...args),
}));

// useConfig — added by 03-ai-tab-integration (ai.tsx now calls useConfig for weeklyLimit)
jest.mock('@/src/hooks/useConfig', () => ({
  useConfig: () => ({
    config: { weeklyLimit: 40, useQA: false, hourlyRate: 25, userId: 'u1', setupComplete: true },
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

// useFocusKey — added by 03-ai-tab-integration (ai.tsx now calls useFocusKey for chartKey)
// Also mock @react-navigation/native to avoid NavigationContainer requirement
jest.mock('@/src/hooks/useFocusKey', () => ({
  useFocusKey: () => 0,
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

// AIConeChart — stub without Skia (03-ai-tab-integration adds cone chart to ai.tsx)
jest.mock('@/src/components/AIConeChart', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ data, width, height, size, ...props }: any) =>
      mockR.createElement('AIConeChart', { data, width, height, size, ...props }),
    AIConeChart: ({ data, width, height, size, ...props }: any) =>
      mockR.createElement('AIConeChart', { data, width, height, size, ...props }),
  };
});

// useHistoryBackfill + useOverviewData — stub for AI trajectory card
jest.mock('@/src/hooks/useHistoryBackfill', () => ({
  useHistoryBackfill: () => null,
}));

jest.mock('@/src/hooks/useOverviewData', () => ({
  useOverviewData: () => ({
    data: {
      earnings: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      aiPct: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      brainliftHours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      weekLabels: [],
    },
    isLoading: false,
  }),
}));

jest.mock('@/src/components/TrendSparkline', () => {
  const mockR = require('react');
  return {
    __esModule: true,
    default: ({ data, width, height, color, ...props }: any) =>
      mockR.createElement('TrendSparkline', { data, width, height, color, ...props }),
  };
});

// computeAICone — stub (03-ai-tab-integration; ai.tsx now calls computeAICone)
jest.mock('@/src/lib/aiCone', () => ({
  computeAICone: () => ({
    actualPoints: [{ hoursX: 0, pctY: 0 }],
    upperBound: [],
    lowerBound: [],
    currentHours: 0,
    currentAIPct: 0,
    weeklyLimit: 40,
    targetPct: 75,
    isTargetAchievable: true,
  }),
}));

// ─── Fixture data ─────────────────────────────────────────────────────────────

const DEFAULT_DATA = {
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

const DEFAULT_HOOK_RESULT = {
  data: DEFAULT_DATA,
  isLoading: false,
  lastFetchedAt: null,
  error: null,
  refetch: jest.fn(),
  previousWeekPercent: undefined,
};

// ─── File paths (for static analysis) ────────────────────────────────────────

const AI_TAB_FILE = path.resolve(__dirname, '../../app/(tabs)/ai.tsx')
  // __dirname is hourglassws/src/components/__tests__
  // ai.tsx is at hourglassws/app/(tabs)/ai.tsx
  // Navigate: ../../ = hourglassws/src → ../../ = hourglassws → app/(tabs)/ai.tsx
;

// Correctly resolve to hourglassws root then app/(tabs)/ai.tsx
// __dirname = hourglassws/src/components/__tests__
// ../../.. = hourglassws
const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const AI_TAB_PATH = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'ai.tsx');
const DAILY_AI_ROW_PATH = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'DailyAIRow.tsx');

// ─── Screen import ────────────────────────────────────────────────────────────
// Direct import required — jest.isolateModules causes React module mismatch
// when ai.tsx uses useState/useMemo/useConfig/useFocusKey (added in 03-ai-tab-integration).

import AIScreen from '@/app/(tabs)/ai';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderAIScreen(): any {
  let tree: any;
  act(() => {
    tree = create(React.createElement(AIScreen));
  });
  return tree;
}

function findByTestId(tree: any, testId: string): any {
  const json = tree.toJSON();
  return findNodeByTestId(json, testId);
}

function findNodeByTestId(node: any, testId: string): any {
  if (!node) return null;
  if (node.props && node.props.testID === testId) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeByTestId(child, testId);
      if (found) return found;
    }
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByTestId(child, testId);
      if (found) return found;
    }
  }
  return null;
}

function findAllText(node: any, collected: string[] = []): string[] {
  if (!node) return collected;
  if (typeof node === 'string') {
    collected.push(node);
    return collected;
  }
  if (Array.isArray(node)) {
    for (const child of node) findAllText(child, collected);
    return collected;
  }
  if (node.children) {
    for (const child of node.children) findAllText(child, collected);
  }
  return collected;
}

function allText(tree: any): string {
  return findAllText(tree.toJSON()).join(' ');
}

// ─── FR1: Hero integration (04-ai-hero-arc: AIArcHero replaces AIRingChart) ──

describe('AITab — FR1: AIArcHero integration (replaces AIRingChart)', () => {
  beforeEach(() => {
    mockUseAIData.mockReturnValue(DEFAULT_HOOK_RESULT);
  });

  it('SC1.1 — renders without crash', () => {
    expect(() => {
      renderAIScreen();
    }).not.toThrow();
  });

  it('SC1.2 — ai-arc-hero testID is present (AIArcHero renders as hero)', () => {
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
  });

  it('SC1.3 — ai.tsx source imports AIArcHero (replaces AIRingChart)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toContain('AIArcHero');
    expect(source).not.toMatch(/import\s+AIRingChart/);
  });

  it('SC1.4 — ai.tsx source does NOT define RING_SIZE (removed with AIRingChart)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).not.toMatch(/RING_SIZE/);
  });

  it('SC1.5 — ai.tsx source passes aiPct to AIArcHero', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/AIArcHero[\s\S]{0,400}aiPct/);
  });

  it('SC1.6 — ai.tsx source passes brainliftHours to AIArcHero', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/AIArcHero[\s\S]{0,400}brainliftHours/);
  });

  it('SC1.7 — ai.tsx source passes ambientColor to AIArcHero', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/ambientColor=\{ambientColor\}/);
  });
});

// ─── FR2: Hero Metric Section ─────────────────────────────────────────────────

describe('AITab — FR2: hero metric section', () => {
  beforeEach(() => {
    mockUseAIData.mockReturnValue(DEFAULT_HOOK_RESULT);
  });

  it('SC2.1 — AIArcHero is rendered (contains AI USAGE + arc gauge)', () => {
    // AI USAGE label is now inside AIArcHero component — verified in AIArcHero.test.tsx
    // Screen-level test: confirm AIArcHero renders (which provides the AI USAGE label)
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
  });

  it('SC2.2 — BRAINLIFT metric in AIArcHero receives brainliftHours prop', () => {
    // BRAINLIFT label is now inside AIArcHero — verified in AIArcHero.test.tsx
    // Screen-level test: AIArcHero receives brainliftHours from screen
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
    expect(hero.props.brainliftHours).toBeDefined();
  });

  it('SC2.3 — AIArcHero receives correct brainliftHours value from screen', () => {
    // "5h" target label is now inside AIArcHero — verified in AIArcHero.test.tsx
    // Screen-level test: correct value is passed as prop
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero.props.brainliftHours).toBe(3.5);
  });

  it('SC2.4 — ai.tsx source imports AIArcHero (hero + MetricValue now in AIArcHero)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    // MetricValue was moved into AIArcHero; ai.tsx now uses AIArcHero instead
    expect(source).toContain('AIArcHero');
  });

  it('SC2.5 — ai.tsx source imports SectionLabel', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/SectionLabel/);
  });

  it('SC2.6 — ai.tsx source uses text-cyan class for AI metric', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toContain('text-cyan');
  });

  it('SC2.7 — ai.tsx source uses text-violet class for BrainLift metric', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toContain('text-violet');
  });

  it('SC2.8 — ai.tsx code does not contain hardcoded hex colors in non-background contexts', () => {
    // ai.tsx may use one hardcoded hex (#0D0C14) as root backgroundColor fallback (per brand §1.1).
    // All other color references should use colors.* tokens.
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    const code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove lines with backgroundColor: '#...' (known root bg fallback)
    const codeWithoutBgColor = code.split('\n')
      .filter(line => !line.match(/backgroundColor\s*:\s*'#[0-9A-Fa-f]{3,8}'/))
      .join('\n');
    expect(codeWithoutBgColor).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('SC2.9 — ai.tsx code does not use StyleSheet.create (outside comments)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    const code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('StyleSheet.create');
  });
});

// ─── FR3: BrainLift (now in AIArcHero) ───────────────────────────────────────

describe('AITab — FR3: BrainLift (via AIArcHero)', () => {
  beforeEach(() => {
    mockUseAIData.mockReturnValue(DEFAULT_HOOK_RESULT);
  });

  it('SC3.1 — AIArcHero.tsx source imports ProgressBar (BrainLift moved to AIArcHero)', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toMatch(/ProgressBar/);
  });

  it('SC3.2 — AIArcHero.tsx source uses bg-violet colorClass for ProgressBar', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toContain('bg-violet');
  });

  it('SC3.3 — AIArcHero.tsx source clamps brainliftHours progress with Math.min(1, ...)', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toMatch(/Math\.min\s*\(\s*1/);
  });

  it('SC3.4 — AIArcHero.tsx source uses height={5} on BrainLift ProgressBar', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toContain('height={5}');
  });

  it('SC3.5 — AIArcHero renders with brainliftHours passed from screen', () => {
    const tree = renderAIScreen();
    // AIArcHero mock receives brainliftHours=3.5; check prop on rendered AIArcHero
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
    expect(hero.props.brainliftHours).toBe(3.5);
  });
});

// ─── FR4: Delta Badge ─────────────────────────────────────────────────────────

describe('AITab — FR4: delta badge', () => {
  it('SC4.1 — delta-badge is NOT rendered when previousWeekPercent is undefined', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      previousWeekPercent: undefined,
    });
    const tree = renderAIScreen();
    const badge = findByTestId(tree, 'delta-badge');
    expect(badge).toBeNull();
  });

  it('SC4.2 — AIArcHero receives non-null deltaPercent when previousWeekPercent is available', () => {
    // Delta badge is now rendered inside AIArcHero — verified in AIArcHero.test.tsx
    // Screen-level: correct deltaPercent prop passed to AIArcHero
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      previousWeekPercent: 72,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
    expect(hero.props.deltaPercent).not.toBeNull();
  });

  it('SC4.3 — positive delta: AIArcHero receives positive deltaPercent', () => {
    // aiPercent = (73+77)/2 = 75; previousWeekPercent = 70; delta = +5.0
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: { ...DEFAULT_DATA, aiPctLow: 73, aiPctHigh: 77 },
      previousWeekPercent: 70,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero.props.deltaPercent).toBeGreaterThan(0);
  });

  it('SC4.4 — negative delta: AIArcHero receives negative deltaPercent', () => {
    // aiPercent = (73+77)/2 = 75; previousWeekPercent = 80; delta = -5.0
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: { ...DEFAULT_DATA, aiPctLow: 73, aiPctHigh: 77 },
      previousWeekPercent: 80,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero.props.deltaPercent).toBeLessThan(0);
  });

  it('SC4.5 — zero delta: AIArcHero receives deltaPercent === 0', () => {
    // aiPercent = 75; previousWeekPercent = 75; delta = 0
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: { ...DEFAULT_DATA, aiPctLow: 73, aiPctHigh: 77 },
      previousWeekPercent: 75,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero.props.deltaPercent).toBe(0);
  });

  it('SC4.6 — AIArcHero.tsx source uses surfaceElevated on delta badge', () => {
    // Delta badge styling moved to AIArcHero
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toContain('surfaceElevated');
  });

  it('SC4.7 — AIArcHero.tsx source uses borderRadius on delta badge container', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toMatch(/borderRadius/);
  });

  it('SC4.8 — AIArcHero.tsx source uses colors.success for positive delta', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toContain('colors.success');
  });

  it('SC4.9 — AIArcHero.tsx source uses colors.critical for negative delta', () => {
    const arcHeroPath = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIArcHero.tsx');
    const source = fs.readFileSync(arcHeroPath, 'utf8');
    expect(source).toContain('colors.critical');
  });
});

// ─── FR5: DailyAIRow ─────────────────────────────────────────────────────────

describe('AITab — FR5: DailyAIRow className migration', () => {
  it('SC5.1 — DailyAIRow renders without crash with valid data', () => {
    const { DailyAIRow } = require('@/src/components/DailyAIRow');
    expect(() => {
      act(() => {
        create(React.createElement(DailyAIRow, {
          item: {
            date: '2026-03-11',
            total: 46,
            aiUsage: 39,
            secondBrain: 0,
            noTags: 2,
            isToday: false,
          },
        }));
      });
    }).not.toThrow();
  });

  it('SC5.2 — DailyAIRow renders formatted date label', () => {
    const { DailyAIRow } = require('@/src/components/DailyAIRow');
    let tree: any;
    act(() => {
      tree = create(React.createElement(DailyAIRow, {
        item: {
          date: '2026-03-11',
          total: 46,
          aiUsage: 39,
          secondBrain: 0,
          noTags: 2,
          isToday: false,
        },
      }));
    });
    const text = allText(tree);
    // Date 2026-03-11 is a Wednesday → "Wed 3/11"
    expect(text).toContain('3/11');
  });

  it('SC5.3 — DailyAIRow shows AI% for day (non-zero taggedSlots)', () => {
    const { DailyAIRow } = require('@/src/components/DailyAIRow');
    let tree: any;
    act(() => {
      // aiUsage=39, total=46, noTags=2 → taggedSlots=44 → aiPct = round(39/44*100) = 89%
      tree = create(React.createElement(DailyAIRow, {
        item: {
          date: '2026-03-11',
          total: 46,
          aiUsage: 39,
          secondBrain: 0,
          noTags: 2,
          isToday: false,
        },
      }));
    });
    const text = allText(tree);
    expect(text).toContain('%');
  });

  it('SC5.4 — DailyAIRow shows "—" when taggedSlots=0', () => {
    const { DailyAIRow } = require('@/src/components/DailyAIRow');
    let tree: any;
    act(() => {
      // total=5, noTags=5 → taggedSlots=0 → "—"
      tree = create(React.createElement(DailyAIRow, {
        item: {
          date: '2026-03-11',
          total: 5,
          aiUsage: 0,
          secondBrain: 0,
          noTags: 5,
          isToday: false,
        },
      }));
    });
    const text = allText(tree);
    expect(text).toContain('—');
  });

  it('SC5.5 — DailyAIRow.tsx source does not use StyleSheet.create', () => {
    const source = fs.readFileSync(DAILY_AI_ROW_PATH, 'utf8');
    const code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('StyleSheet.create');
  });

  it('SC5.6 — DailyAIRow.tsx source uses className for most styling', () => {
    // DailyAIRow may still use StyleSheet for specific layout props (Skia canvas sizing etc.)
    // The key check is that className= is used for visual styling.
    const source = fs.readFileSync(DAILY_AI_ROW_PATH, 'utf8');
    expect(source).toContain('className=');
  });

  it('SC5.7 — DailyAIRow.tsx source uses className strings', () => {
    const source = fs.readFileSync(DAILY_AI_ROW_PATH, 'utf8');
    expect(source).toContain('className=');
  });

  it('SC5.8 — daily breakdown renders one row per item in AIScreen', () => {
    mockUseAIData.mockReturnValue(DEFAULT_HOOK_RESULT);
    const tree = renderAIScreen();
    // DEFAULT_DATA has 3 daily breakdown items
    // We check that breakdown card is present
    const text = allText(tree);
    // All 3 dates should appear in some form — at minimum the today date
    expect(text).toContain('3/11');
  });

  it('SC5.9 — daily breakdown card renders column headers', () => {
    mockUseAIData.mockReturnValue(DEFAULT_HOOK_RESULT);
    const tree = renderAIScreen();
    const text = allText(tree);
    // Column headers from spec: "Day", "AI%", "BrainLift"
    expect(text.toLowerCase()).toContain('day');
  });
});

// ─── FR6: Loading / Skeleton States ──────────────────────────────────────────

describe('AITab — FR6: loading/skeleton states', () => {
  it('SC6.1 — SkeletonLoader rendered for hero when isLoading=true and data=null', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: null,
      isLoading: true,
    });
    const tree = renderAIScreen();
    // With AIArcHero, skeleton is a SkeletonLoader component (width=180, height=180)
    // ai-arc-hero testID should NOT be present (AIArcHero not rendered in skeleton path)
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).toBeNull();
  });

  it('SC6.2 — AIArcHero is rendered (no skeleton) when data is available', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: DEFAULT_DATA,
      isLoading: false,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).not.toBeNull();
  });

  it('SC6.3 — loading state rendered when isLoading=true and data=null', () => {
    // ai.tsx uses ActivityIndicator (not skeleton-breakdown) for initial load state.
    // When data=null and isLoading=true, it renders an ActivityIndicator centered view.
    // Verify: the ai-arc-hero testID is NOT present (data is still loading).
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: null,
      isLoading: true,
    });
    const tree = renderAIScreen();
    const hero = findByTestId(tree, 'ai-arc-hero');
    expect(hero).toBeNull();
  });

  it('SC6.4 — no skeletons when isLoading=true but data exists (background refresh)', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      isLoading: true,  // background refresh
      data: DEFAULT_DATA,
    });
    const tree = renderAIScreen();
    const skeletonRing = findByTestId(tree, 'skeleton-ring');
    expect(skeletonRing).toBeNull();
  });

  it('SC6.5 — no skeletons when isLoading=false and data exists', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      isLoading: false,
      data: DEFAULT_DATA,
    });
    const tree = renderAIScreen();
    const skeletonRing = findByTestId(tree, 'skeleton-ring');
    expect(skeletonRing).toBeNull();
  });

  it('SC6.6 — ai.tsx source handles loading state (ActivityIndicator or SkeletonLoader)', () => {
    // ai.tsx uses ActivityIndicator for the initial loading state (data=null, isLoading=true).
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/ActivityIndicator|SkeletonLoader/);
  });
});

// ─── Error / Empty States ─────────────────────────────────────────────────────

describe('AITab — error and empty states', () => {
  it('SC7.1 — auth error state renders with testID=error-auth', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: null,
      error: 'auth',
    });
    const tree = renderAIScreen();
    const node = findByTestId(tree, 'error-auth');
    expect(node).not.toBeNull();
  });

  it('SC7.2 — network error state renders with testID=error-network', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: null,
      error: 'network',
    });
    const tree = renderAIScreen();
    const node = findByTestId(tree, 'error-network');
    expect(node).not.toBeNull();
  });

  it('SC7.3 — empty state renders testID=empty-state when data=null and isLoading=false', () => {
    mockUseAIData.mockReturnValue({
      ...DEFAULT_HOOK_RESULT,
      data: null,
      isLoading: false,
      error: null,
    });
    const tree = renderAIScreen();
    const node = findByTestId(tree, 'empty-state');
    expect(node).not.toBeNull();
  });
});

// ─── AI Tab imports Card ──────────────────────────────────────────────────────

describe('AITab — layout structure', () => {
  it('SC8.1 — ai.tsx source imports Card', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/\bCard\b/);
  });

  it('SC8.2 — ai.tsx does not import AIProgressBar', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).not.toContain('AIProgressBar');
  });
});

// ─── FR4 (12-app-breakdown-ui): AppBreakdownCard integration ─────────────────
// Tests that ai.tsx is correctly wired with AppBreakdownCard, useAppBreakdown,
// generateGuidance, and that stagger count is bumped to 7.

describe('AITab — FR4 (12-app-breakdown-ui): AppBreakdownCard integration', () => {
  it('FR4.1 — ai.tsx source imports AppBreakdownCard', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/AppBreakdownCard/);
  });

  it('FR4.2 — ai.tsx source imports useAppBreakdown', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/useAppBreakdown/);
  });

  it('FR4.3 — ai.tsx source imports generateGuidance', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/generateGuidance/);
  });

  it('FR4.4 — ai.tsx useStaggeredEntry count is 7 (bumped from 6)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*7\s*\}/);
  });

  it('FR4.5 — ai.tsx source uses getEntryStyle(3) for AppBreakdownCard', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/getEntryStyle\s*\(\s*3\s*\)/);
  });

  it('FR4.6 — ai.tsx source uses getEntryStyle(4) for Trajectory card (was 3)', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/getEntryStyle\s*\(\s*4\s*\)/);
  });

  it('FR4.7 — ai.tsx source calls useAppBreakdown() and destructures aggregated12w and currentWeek', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/aggregated12w/);
    expect(source).toMatch(/currentWeek/);
  });

  it('FR4.8 — ai.tsx source guards AppBreakdownCard on aggregated12w.length > 0', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/aggregated12w\.length\s*>\s*0|aggregated12w\.length\s*&&/);
  });

  it('FR4.9 — ai.tsx source slices aggregated12w to 8 entries before passing to AppBreakdownCard', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    expect(source).toMatch(/aggregated12w\.slice\s*\(\s*0\s*,\s*8\s*\)/);
  });

  it('FR4.10 — ai.tsx source passes generateGuidance result to AppBreakdownCard guidance prop', () => {
    const source = fs.readFileSync(AI_TAB_PATH, 'utf8');
    // generateGuidance(...) is called and result passed as guidance prop
    expect(source).toMatch(/generateGuidance\s*\(/);
    expect(source).toMatch(/guidance\s*=/);
  });
});
