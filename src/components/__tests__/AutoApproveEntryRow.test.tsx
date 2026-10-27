// Tests: AutoApproveEntryRow — 1.2 manager auto-approve, the Requests tab's way in to
// app/direct-reports.tsx.
//
// Strategy: runtime render (react-test-renderer) with useAutoApproveSettings and
// useDirectReports mocked (no QueryClientProvider):
//   - "On for N of M direct reports" (singular / plural), counting only reports with a
//     toggle on
//   - the count hidden while the roster loads, or failed, with nothing to show
//   - pressing the row pushes '/direct-reports'
//   - "Auto-approved N requests today" only when today's log holds approvals

import React from 'react';
import { create, act } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { useAutoApproveSettings, useDirectReports } from '@/src/hooks/useAutoApprove';
import type { AutoApproveLogEntry, AutoApproveOutcome, AutoApproveRules } from '@/src/lib/autoApprove';
import type { TeamMember } from '@/src/types/api';
import { AutoApproveEntryRow } from '../AutoApproveEntryRow';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// jest.mock calls are hoisted above the imports.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('@/src/hooks/useAutoApprove', () => ({
  useAutoApproveSettings: jest.fn(),
  useDirectReports: jest.fn(),
}));

jest.mock('@/src/components/AnimatedPressable', () => {
  const mockReact = require('react');
  return {
    AnimatedPressable: ({ children, ...props }: any) => mockReact.createElement('Pressable', props, children),
  };
});

const mockUseSettings = useAutoApproveSettings as jest.Mock;
const mockUseDirectReports = useDirectReports as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    assignmentId: '80001',
    candidateId: '3000001',
    userId: '1190001',
    managerId: '2362707',
    teamId: '4584',
    teamName: 'Platform',
    name: 'Ana Ruiz',
    isManager: false,
    ...overrides,
  };
}

const ANA = member({});
const BEN = member({ assignmentId: '80002', candidateId: '3000002', userId: '1190002', name: 'Ben Okafor' });
const CY = member({ assignmentId: '80003', candidateId: '3000003', userId: '1190003', name: 'Cy Park' });

let seq = 0;

function logEntry(at: Date, outcome: AutoApproveOutcome = 'approved'): AutoApproveLogEntry {
  seq++;
  return {
    id: `mt-${seq}`,
    personId: '1190001',
    name: 'Ana Ruiz',
    category: 'MANUAL',
    durationMinutes: 60,
    startDateTime: '2026-10-20T10:00:00Z',
    at: at.toISOString(),
    outcome,
  };
}

/** Noon yesterday, on the device's calendar: never today, whatever the time now. */
function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

interface Setup {
  reports?: TeamMember[];
  isLoading?: boolean;
  error?: string | null;
  rules?: AutoApproveRules;
  log?: AutoApproveLogEntry[];
}

function setup(opts: Setup = {}) {
  const reports = opts.reports ?? [ANA, BEN, CY];
  mockUseDirectReports.mockReturnValue({
    reports,
    roster: reports,
    isLoading: opts.isLoading ?? false,
    error: opts.error ?? null,
  });
  mockUseSettings.mockReturnValue({
    ownerKey: '2362707|prod',
    rules: opts.rules ?? {},
    log: opts.log ?? [],
    isLoading: false,
    setRule: jest.fn(),
  });
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const trees: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<AutoApproveEntryRow />);
  });
  trees.push(tree);
  return tree;
}

afterEach(() => {
  act(() => {
    for (const tree of trees.splice(0)) tree.unmount();
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

function textsOf(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') out.push(n);
    else n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function entry(tree: ReactTestRenderer): ReactTestInstance {
  return tree.root.find((n) => n.props.testID === 'auto-approve-entry' && typeof n.props.onPress === 'function');
}

function todayLine(tree: ReactTestRenderer): ReactTestInstance | undefined {
  return tree.root.findAll((n) => n.props.testID === 'auto-approve-today', { deep: false })[0];
}

// ─── Status ──────────────────────────────────────────────────────────────────

describe('AutoApproveEntryRow — status', () => {
  it('"On for N of M direct reports", counting reports with at least one toggle on', () => {
    setup({
      rules: {
        '1190001': { manual: true, overtime: false },
        '1190002': { manual: false, overtime: true },
        '9999999': { manual: true, overtime: true }, // not a report: not counted
      },
    });
    const tree = render();
    expect(textsOf(entry(tree)).join('')).toBe('Auto-approve· On for 2 of 3 direct reports›');
    expect(entry(tree).props.accessibilityLabel).toBe('Auto-approve, On for 2 of 3 direct reports');
  });

  it('singular with one direct report', () => {
    setup({ reports: [ANA], rules: { '1190001': { manual: true, overtime: true } } });
    const tree = render();
    expect(textsOf(entry(tree)).join('')).toContain('· On for 1 of 1 direct report›');
    expect(entry(tree).props.accessibilityLabel).toBe('Auto-approve, On for 1 of 1 direct report');
  });

  it('none on: "On for 0 of M"', () => {
    setup();
    expect(textsOf(entry(render())).join('')).toContain('On for 0 of 3 direct reports');
  });

  it('no direct reports (loaded): "On for 0 of 0 direct reports"', () => {
    setup({ reports: [] });
    expect(textsOf(entry(render())).join('')).toContain('On for 0 of 0 direct reports');
  });

  it('hides the counts while the roster loads with nothing to show', () => {
    setup({ reports: [], isLoading: true });
    const tree = render();
    expect(textsOf(entry(tree)).join('')).toBe('Auto-approve›');
    expect(entry(tree).props.accessibilityLabel).toBe('Auto-approve');
  });

  it('hides the counts when the roster failed with nothing to show', () => {
    setup({ reports: [], error: 'teams failed' });
    expect(textsOf(entry(render())).join('')).toBe('Auto-approve›');
  });

  it('keeps the counts during a refresh, or after a failed one, when reports are cached', () => {
    setup({ isLoading: true, rules: { '1190003': { manual: true, overtime: false } } });
    expect(textsOf(entry(render())).join('')).toContain('On for 1 of 3 direct reports');
    setup({ error: 'teams failed' });
    expect(textsOf(entry(render())).join('')).toContain('On for 0 of 3 direct reports');
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

describe('AutoApproveEntryRow — press', () => {
  it("pushes '/direct-reports'", () => {
    setup();
    const tree = render();
    act(() => {
      entry(tree).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/direct-reports');
  });

  it('is a button, also while loading', () => {
    setup({ reports: [], isLoading: true });
    const tree = render();
    expect(entry(tree).props.accessibilityRole).toBe('button');
    act(() => {
      entry(tree).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/direct-reports');
  });
});

// ─── Today's approvals ───────────────────────────────────────────────────────

describe('AutoApproveEntryRow — approved today', () => {
  it('"Auto-approved N requests today", counting only today\'s approvals', () => {
    const now = new Date();
    setup({
      log: [
        logEntry(now),
        logEntry(now),
        logEntry(now, 'over_limit'),
        logEntry(now, 'retrying'),
        logEntry(now, 'failed'),
        logEntry(yesterday()),
      ],
    });
    const line = todayLine(render());
    expect(line).toBeDefined();
    expect(textsOf(line!).join('')).toBe('Auto-approved 2 requests today');
  });

  it('singular for one approval', () => {
    setup({ log: [logEntry(new Date())] });
    expect(textsOf(todayLine(render())!).join('')).toBe('Auto-approved 1 request today');
  });

  it('hidden when today\'s log holds no approvals', () => {
    const now = new Date();
    setup({ log: [logEntry(now, 'failed'), logEntry(now, 'deadline_passed'), logEntry(yesterday())] });
    expect(todayLine(render())).toBeUndefined();
  });

  it('hidden with an empty log', () => {
    setup();
    expect(todayLine(render())).toBeUndefined();
  });
});
