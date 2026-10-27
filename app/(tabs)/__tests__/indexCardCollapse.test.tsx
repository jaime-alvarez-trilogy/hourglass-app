// Tests: Hours Dashboard — 1.2 collapsible PAY WEEK / PAY DAYS cards
// File: app/(tabs)/index.tsx (wiring), with the real useCardCollapsed, WeekBreakdownCard and
// PayDaysCard
//
//   default expanded; pressing a card's toggle hides its body (the PAY WEEK status and the
//   PAY DAYS summary stay) and persists home_cards_v1; stored flags collapse the cards on
//   load; a remount (tab switch) renders the session's state on its first frame; the cards
//   keep their getEntryStyle stagger slots
//
// Mocks follow index.test.tsx (hooks, expo-router, safe-area, gradient, TextInput,
// @expo/vector-icons, Reanimated mock); usePayDays returns the live-shaped PAY_DAYS_RAW
// fixture and useHoursData a week with a breakdown. AsyncStorage is the in-memory
// __mocks__ store.

import React from 'react';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHoursData } from '@/src/hooks/useHoursData';
import { useConfig } from '@/src/hooks/useConfig';
import { HOME_CARDS_KEY, __resetCardCollapsedForTests } from '@/src/hooks/useCardCollapsed';
import type { WeekBreakdown } from '@/src/lib/hours';
import HoursDashboard from '../index';

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  return { ...mock, useReducedMotion: () => false };
});

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/src/hooks/useHoursData');
jest.mock('@/src/hooks/useConfig');
jest.mock('@/src/hooks/useIsManager', () => ({ useIsManager: () => false }));
jest.mock('@/src/hooks/useEarningsHistory', () => ({
  useEarningsHistory: () => ({ trend: [], isLoading: false }),
}));
jest.mock('@/src/hooks/useAIData', () => ({
  useAIData: () => ({ data: null, previousWeekPercent: null, isLoading: false, error: null }),
}));
jest.mock('@/src/hooks/useFocusKey', () => ({ useFocusKey: () => 'focus-key-0' }));
jest.mock('@/src/hooks/useApprovalItems', () => ({
  useApprovalItems: () => ({ items: [], isLoading: false, error: null }),
}));
jest.mock('@/src/hooks/usePayDays', () => {
  const { normalizePayDays } = jest.requireActual('@/src/lib/hoursOverview');
  const { PAY_DAYS_RAW } = jest.requireActual('@/src/__fixtures__/hoursOverview');
  const data = normalizePayDays(PAY_DAYS_RAW);
  return { usePayDays: () => ({ data }) };
});
jest.mock('@/src/components/FadeInScreen', () => {
  const mockReact = jest.requireActual('react');
  return {
    __esModule: true,
    default: ({ children }: any) => mockReact.createElement(mockReact.Fragment, null, children),
  };
});
jest.mock('@/src/hooks/useStaggeredEntry', () => ({
  useStaggeredEntry: () => ({ getEntryStyle: () => ({}), isReady: true }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
}));
// Ionicons' real implementation loads its font on mount, which crashes jest-expo/node
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const mockReact = jest.requireActual('react');
  return {
    SafeAreaView: ({ children, ...props }: any) => mockReact.createElement('View', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('expo-linear-gradient', () => {
  const mockReact = jest.requireActual('react');
  return {
    LinearGradient: ({ children }: any) => mockReact.createElement(mockReact.Fragment, null, children),
  };
});
// MetricValue's animated TextInput runs DOM effects under react-native-web (see index.test.tsx)
jest.mock('react-native-web/dist/exports/TextInput/index.js', () => {
  const mockR = jest.requireActual('react');
  const mockRN = jest.requireActual('react-native-web');
  return {
    __esModule: true,
    default: ({ defaultValue, value, ...props }: any) =>
      mockR.createElement(mockRN.View, props, mockR.createElement(mockRN.Text, null, defaultValue ?? value ?? '')),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const INDEX_FILE = path.resolve(__dirname, '../index.tsx');

// ─── Test data ────────────────────────────────────────────────────────────────

/** 38h 50m billable of 40h with 2h 10m pending → "1h 10m left" + the pending footnote. */
const BREAKDOWN: WeekBreakdown = {
  weekStart: '2026-10-19',
  tracked: 1920,
  idle: 110,
  manualApproved: 410,
  manualPending: 130,
  manualRejected: 0,
  disputed: 0,
  billable: 2330,
  cappedBillable: 2330,
  limitMinutes: 2400,
  approvedOvertime: 0,
  isHourly: true,
};

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
  total: 38.8,
  average: 7.8,
  today: 7.2,
  daily: [
    { date: '2026-10-19', hours: 8.0, isToday: false },
    { date: '2026-10-20', hours: 8.0, isToday: false },
    { date: '2026-10-21', hours: 8.0, isToday: false },
    { date: '2026-10-22', hours: 7.6, isToday: false },
    { date: '2026-10-23', hours: 7.2, isToday: true },
  ],
  weeklyEarnings: 970,
  todayEarnings: 180,
  hoursRemaining: 1.2,
  overtimeHours: 0,
  timeRemaining: 48 * 60 * 60 * 1000,
  deadline: new Date('2026-10-25T23:59:59Z'),
  weeklyLimit: 40,
  breakdown: BREAKDOWN,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderHome(): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(React.createElement(HoursDashboard));
  });
  return tree!;
}

/** Lets the preference read / write promise chains settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function has(tree: ReactTestRenderer, id: string): boolean {
  return tree.root.findAll((n) => n.props.testID === id).length > 0;
}

function toggle(tree: ReactTestRenderer, id: string): ReactTestInstance {
  const [node] = tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function');
  if (!node) throw new Error(`no ${id}`);
  return node;
}

function press(tree: ReactTestRenderer, id: string): void {
  act(() => toggle(tree, id).props.onPress());
}

function storedPrefs(): unknown {
  const calls = MockAsyncStorage.setItem.mock.calls.filter(([key]) => key === HOME_CARDS_KEY);
  const last = calls[calls.length - 1];
  return last ? JSON.parse(last[1] as string) : undefined;
}

const WEEK_BODY = ['week-breakdown-bar', 'week-breakdown-row-tracked', 'week-breakdown-footnote'];
const PAY_ROWS = ['pay-day-row-2026-10-21', 'pay-day-row-2026-10-28', 'pay-day-row-2026-11-04'];

beforeEach(() => {
  MockAsyncStorage._reset();
  __resetCardCollapsedForTests();
  (useHoursData as jest.Mock).mockReturnValue({
    data: MOCK_HOURS_DATA,
    isLoading: false,
    isStale: false,
    cachedAt: null,
    error: null,
    refetch: jest.fn(),
  });
  (useConfig as jest.Mock).mockReturnValue({ config: MOCK_CONFIG, isLoading: false, refetch: jest.fn() });
});

// ─── Render ───────────────────────────────────────────────────────────────────

describe('HoursDashboard — collapsible cards (1.2)', () => {
  it('both cards start expanded', async () => {
    const tree = renderHome();
    await flush();
    for (const id of [...WEEK_BODY, ...PAY_ROWS]) expect(has(tree, id)).toBe(true);
    expect(toggle(tree, 'week-breakdown-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(toggle(tree, 'pay-days-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(has(tree, 'pay-days-summary')).toBe(false);
  });

  it('the PAY WEEK toggle hides its body, keeps the status and persists', async () => {
    const tree = renderHome();
    await flush();
    press(tree, 'week-breakdown-toggle');

    for (const id of WEEK_BODY) expect(has(tree, id)).toBe(false);
    expect(has(tree, 'week-breakdown-status')).toBe(true);
    expect(has(tree, 'week-breakdown-caption')).toBe(true);
    expect(toggle(tree, 'week-breakdown-toggle').props.accessibilityState).toEqual({ expanded: false });
    // The other card is untouched
    for (const id of PAY_ROWS) expect(has(tree, id)).toBe(true);

    await flush();
    expect(storedPrefs()).toEqual({ payWeek: true });

    press(tree, 'week-breakdown-toggle');
    for (const id of WEEK_BODY) expect(has(tree, id)).toBe(true);
    await flush();
    expect(storedPrefs()).toEqual({ payWeek: false });
  });

  it('the PAY DAYS toggle swaps the rows for the summary and persists', async () => {
    const tree = renderHome();
    await flush();
    press(tree, 'pay-days-toggle');

    for (const id of PAY_ROWS) expect(has(tree, id)).toBe(false);
    expect(has(tree, 'pay-days-summary')).toBe(true);
    for (const id of WEEK_BODY) expect(has(tree, id)).toBe(true);

    await flush();
    expect(storedPrefs()).toEqual({ payDays: true });
  });

  it('stored flags collapse the cards once read', async () => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payWeek: true, payDays: true }));
    const tree = renderHome();
    await flush();
    for (const id of [...WEEK_BODY, ...PAY_ROWS]) expect(has(tree, id)).toBe(false);
    expect(has(tree, 'week-breakdown-status')).toBe(true);
    expect(has(tree, 'pay-days-summary')).toBe(true);
  });

  it('a remount renders the collapsed state on its first frame', async () => {
    const first = renderHome();
    await flush();
    press(first, 'week-breakdown-toggle');
    act(() => first.unmount());

    // No flush: the module copy must already be right
    const again = renderHome();
    for (const id of WEEK_BODY) expect(has(again, id)).toBe(false);
    for (const id of PAY_ROWS) expect(has(again, id)).toBe(true);
  });
});

// ─── Source wiring ────────────────────────────────────────────────────────────

describe('HoursDashboard — collapsible cards: source wiring', () => {
  const source = fs.readFileSync(INDEX_FILE, 'utf8');

  it('keeps one flag per card, default expanded', () => {
    expect(source).toMatch(/useCardCollapsed\('payWeek'\)/);
    expect(source).toMatch(/useCardCollapsed\('payDays'\)/);
  });

  it('passes collapsed + onToggle to both cards, inside their stagger slots', () => {
    expect(source).toMatch(
      /getEntryStyle\(1\)\}>\s*<WeekBreakdownCard[\s\S]{0,200}collapsed=\{payWeekCard\.collapsed\}[\s\S]{0,80}onToggle=\{payWeekCard\.toggle\}/,
    );
    expect(source).toMatch(
      /getEntryStyle\(2\)\}>\s*<PayDaysCard[\s\S]{0,120}collapsed=\{payDaysCard\.collapsed\}[\s\S]{0,80}onToggle=\{payDaysCard\.toggle\}/,
    );
  });
});
