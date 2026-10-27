// Tests: app/direct-reports.tsx — 1.2 manager auto-approve, the per-report settings screen.
//
// Strategy: runtime render (react-test-renderer) with every hook mocked, so no query
// client, storage or network is involved:
//   - the manager gate (a non-manager sees one line, and no report hook runs)
//   - loading, roster error (nothing cached) and stale-roster states, and Retry
//   - the report rows: switches, pending counts (matched as the runner matches: overtime
//     through the roster, manual time by the work-diary proof from useManualOwners, never
//     by userId), "Checking…" while that proof loads, the team name only across teams, a
//     report without a userId
//   - the switches: ON asks first (setRule only after "Turn on"; the manual copy gives a
//     count only once useManualOwners has settled), OFF saves at once, a failed save says
//     so, a switch is locked while its save is in flight
//   - the preview note and the "Recently auto-approved" log rows
//
// Mocks:
//   - useIsManager, useConfig, useApprovalItems, useAutoApprove (hooks; useManualOwners
//     returns the proven owners each test sets)
//   - @tanstack/react-query (useQueryClient: the Retry's refetchQueries)
//   - GlassCard (Skia), SkeletonLoader (Reanimated), AnimatedPressable (Reanimated)
//   - Alert.alert via jest.spyOn

import React from 'react';
import { create, act } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { useIsManager } from '@/src/hooks/useIsManager';
import { useConfig } from '@/src/hooks/useConfig';
import { useApprovalItems } from '@/src/hooks/useApprovalItems';
import { useAutoApproveSettings, useDirectReports, useManualOwners } from '@/src/hooks/useAutoApprove';
import type { AutoApproveLogEntry, AutoApproveRules } from '@/src/lib/autoApprove';
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem } from '@/src/lib/approvals';
import type { TeamMember } from '@/src/types/api';
import DirectReportsScreen from '../direct-reports';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// jest.mock calls are hoisted above the imports.

jest.mock('@/src/hooks/useIsManager', () => ({ useIsManager: jest.fn() }));
jest.mock('@/src/hooks/useConfig', () => ({ useConfig: jest.fn() }));
jest.mock('@/src/hooks/useApprovalItems', () => ({ useApprovalItems: jest.fn() }));
jest.mock('@/src/hooks/useAutoApprove', () => ({
  useAutoApproveSettings: jest.fn(),
  useDirectReports: jest.fn(),
  useManualOwners: jest.fn(),
}));

const mockRefetchQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ refetchQueries: mockRefetchQueries }),
}));

// Card delegates to GlassCard (Skia): a pass-through.
jest.mock('@/src/components/GlassCard', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/SkeletonLoader', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: () => mockReact.createElement('View', { testID: 'skeleton-loader' }),
  };
});

jest.mock('@/src/components/AnimatedPressable', () => {
  const mockReact = require('react');
  return {
    AnimatedPressable: ({ children, ...props }: any) => mockReact.createElement('Pressable', props, children),
  };
});

const mockUseIsManager = useIsManager as jest.Mock;
const mockUseConfig = useConfig as jest.Mock;
const mockUseApprovalItems = useApprovalItems as jest.Mock;
const mockUseSettings = useAutoApproveSettings as jest.Mock;
const mockUseDirectReports = useDirectReports as jest.Mock;
const mockUseManualOwners = useManualOwners as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MANAGER_CONFIG = { userId: '2362707', isManager: true, useQA: false, devManagerView: false };
const PREVIEW_CONFIG = { userId: '2362707', isManager: false, useQA: false, devManagerView: true };

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
/** Ana's row on the manager's second team: in the roster, not in the reports. */
const ANA_SECOND = member({ assignmentId: '80099', candidateId: '3000099', teamId: '5000', teamName: 'Mobile' });
/** A report whose roster row has no candidate.userId. */
const XU = member({ assignmentId: '81000', candidateId: '3100000', userId: null, name: 'Xu Lin' });

/** A pending manual request. Its userId (a legacy id in live data) is never matched. */
function manual(id: string, userId = 36412): ManualApprovalItem {
  return {
    id,
    category: 'MANUAL',
    userId,
    fullName: 'Whoever',
    durationMinutes: 60,
    hours: '1.0',
    description: 'Work',
    startDateTime: '2026-10-20T10:00:00Z',
    type: 'WEB',
    timecardIds: [1],
    weekStartDate: '2026-10-19',
  };
}

function overtime(id: string, assignmentId: number, personId: number): OvertimeApprovalItem {
  return {
    id,
    category: 'OVERTIME',
    overtimeId: 1,
    userId: 3000001,
    fullName: 'Whoever',
    jobTitle: 'Engineer',
    durationMinutes: 120,
    hours: '2.0',
    cost: 100,
    description: 'Release',
    startDateTime: '2026-10-22T09:00:00Z',
    weekStartDate: '2026-10-19',
    assignmentId,
    personId,
  };
}

function logEntry(overrides: Partial<AutoApproveLogEntry>): AutoApproveLogEntry {
  return {
    id: 'mt-1',
    personId: '1190001',
    name: 'Ana Ruiz',
    category: 'MANUAL',
    durationMinutes: 90,
    startDateTime: '2026-10-20T10:00:00Z',
    at: new Date().toISOString(),
    outcome: 'approved',
    ...overrides,
  };
}

interface Setup {
  isManager?: boolean;
  config?: object | null;
  reports?: TeamMember[];
  roster?: TeamMember[];
  reportsLoading?: boolean;
  error?: string | null;
  rules?: AutoApproveRules;
  log?: AutoApproveLogEntry[];
  settingsLoading?: boolean;
  setRule?: jest.Mock;
  items?: ApprovalItem[];
  /** The work-diary proof useManualOwners returns: item id → owner row. */
  owners?: Record<string, TeamMember | null>;
  ownersLoading?: boolean;
  /** useManualOwners' settled; by default, whenever it is not loading. */
  ownersSettled?: boolean;
}

function setup(opts: Setup = {}): { setRule: jest.Mock } {
  const reports = opts.reports ?? [ANA, BEN];
  const setRule = opts.setRule ?? jest.fn().mockResolvedValue(undefined);
  mockUseIsManager.mockReturnValue(opts.isManager ?? true);
  mockUseConfig.mockReturnValue({ config: opts.config === undefined ? MANAGER_CONFIG : opts.config, isLoading: false });
  mockUseDirectReports.mockReturnValue({
    reports,
    roster: opts.roster ?? reports,
    isLoading: opts.reportsLoading ?? false,
    error: opts.error ?? null,
  });
  mockUseSettings.mockReturnValue({
    ownerKey: '2362707|prod',
    rules: opts.rules ?? {},
    log: opts.log ?? [],
    isLoading: opts.settingsLoading ?? false,
    setRule,
  });
  mockUseApprovalItems.mockReturnValue({ items: opts.items ?? [] });
  mockUseManualOwners.mockReturnValue({
    owners: new Map(Object.entries(opts.owners ?? {})),
    isLoading: opts.ownersLoading ?? false,
    settled: opts.ownersSettled ?? !(opts.ownersLoading ?? false),
  });
  return { setRule };
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const trees: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<DirectReportsScreen />);
  });
  trees.push(tree);
  return tree;
}

afterEach(() => {
  act(() => {
    for (const tree of trees.splice(0)) tree.unmount();
  });
});

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

/** The outermost element with this testID (one per rendered element). */
function all(root: ReactTestInstance, testID: string): ReactTestInstance[] {
  return root.findAll((n) => n.props.testID === testID, { deep: false });
}

function one(tree: ReactTestRenderer, testID: string): ReactTestInstance {
  const found = all(tree.root, testID);
  if (found.length !== 1) throw new Error(`expected one ${testID}, found ${found.length}`);
  return found[0];
}

function has(tree: ReactTestRenderer, testID: string): boolean {
  return all(tree.root, testID).length > 0;
}

/** Every rendered string under `node`, in render order. */
function textsOf(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') out.push(n);
    else n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function screenText(tree: ReactTestRenderer): string {
  return textsOf(tree.root).join('');
}

/** A Switch by testID: its value / disabled props and onValueChange. */
function switchOf(tree: ReactTestRenderer, testID: string) {
  const node = one(tree, testID);
  return {
    value: node.props.value as boolean,
    disabled: node.props.disabled as boolean,
    toggle: (value: boolean) => node.props.onValueChange(value),
  };
}

/** The buttons of the last Alert.alert call. */
function alertButtons(): { text: string; style?: string; onPress?: () => void }[] {
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  return call[2] ?? [];
}

async function settle() {
  await act(async () => {
    await new Promise<void>((res) => setTimeout(res, 0));
  });
}

// ─── Manager gate ────────────────────────────────────────────────────────────

describe('DirectReportsScreen — manager gate', () => {
  it('a non-manager sees only the message, and no report hook runs', () => {
    setup({ isManager: false });
    const tree = render();
    expect(textsOf(tree.root)).toEqual(['Auto-approve is only available to managers.']);
    expect(mockUseDirectReports).not.toHaveBeenCalled();
    expect(mockUseSettings).not.toHaveBeenCalled();
    expect(mockUseApprovalItems).not.toHaveBeenCalled();
    expect(mockUseConfig).not.toHaveBeenCalled();
  });

  it('a manager sees the intro, the reports and the log', () => {
    setup();
    const tree = render();
    const text = screenText(tree);
    expect(text).toContain('Hourglass approves these requests for you whenever you open the app.');
    expect(text).toContain('Auto-approve');
    expect(text).toContain('Recently auto-approved');
    expect(has(tree, 'report-row-1190001')).toBe(true);
  });
});

// ─── Loading, error, stale ───────────────────────────────────────────────────

describe('DirectReportsScreen — loading and errors', () => {
  it('shows skeletons while the roster loads with nothing cached', () => {
    setup({ reports: [], reportsLoading: true });
    const tree = render();
    expect(all(tree.root, 'skeleton-loader').length).toBeGreaterThan(0);
    expect(has(tree, 'direct-reports-error')).toBe(false);
    expect(screenText(tree)).not.toContain('No direct reports');
  });

  it('shows skeletons (no rows, no log) while the settings load', () => {
    setup({ settingsLoading: true, log: [logEntry({})] });
    const tree = render();
    expect(all(tree.root, 'skeleton-loader').length).toBeGreaterThan(0);
    expect(has(tree, 'report-row-1190001')).toBe(false);
    expect(has(tree, 'auto-approve-log-row')).toBe(false);
  });

  it('a refresh with a roster on screen shows the rows, not the skeleton', () => {
    setup({ reportsLoading: true });
    const tree = render();
    expect(has(tree, 'skeleton-loader')).toBe(false);
    expect(has(tree, 'report-row-1190001')).toBe(true);
  });

  it('the roster failed with nothing cached: the error and a Retry that refetches the roster', () => {
    setup({ reports: [], error: 'teams failed' });
    const tree = render();
    const error = one(tree, 'direct-reports-error');
    expect(textsOf(error)).toContain("Couldn't load your direct reports.");
    expect(has(tree, 'direct-reports-stale')).toBe(false);

    const retry = error.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect(textsOf(retry)).toEqual(['Retry']);
    act(() => {
      retry.props.onPress();
    });
    expect(mockRefetchQueries).toHaveBeenCalledWith({ queryKey: ['teamRoster'] });
  });

  it('an error with the last roster cached: a quiet stale note above the rows', () => {
    setup({ error: 'teams failed' });
    const tree = render();
    const stale = one(tree, 'direct-reports-stale');
    expect(textsOf(stale)).toContain("Couldn't refresh your team. Showing the last list.");
    expect(textsOf(stale)).toContain('Retry');
    expect(has(tree, 'direct-reports-error')).toBe(false);
    expect(has(tree, 'report-row-1190001')).toBe(true);
    expect(has(tree, 'report-row-1190002')).toBe(true);
  });

  it('no reports and no error: the empty state', () => {
    setup({ reports: [] });
    const tree = render();
    expect(screenText(tree)).toContain('No direct reports');
    expect(has(tree, 'direct-reports-error')).toBe(false);
  });
});

// ─── Rows ────────────────────────────────────────────────────────────────────

describe('DirectReportsScreen — report rows', () => {
  it('one row per report, with both switches', () => {
    setup({ reports: [ANA, BEN, XU] });
    const tree = render();
    for (const key of ['1190001', '1190002', 'a81000']) {
      expect(all(tree.root, `report-row-${key}`)).toHaveLength(1);
      expect(all(tree.root, `switch-manual-${key}`)).toHaveLength(1);
      expect(all(tree.root, `switch-overtime-${key}`)).toHaveLength(1);
    }
    const row = one(tree, 'report-row-1190001');
    expect(textsOf(row)).toEqual(expect.arrayContaining(['Ana Ruiz', 'Manual time', 'Overtime']));
  });

  it('the switches show the stored rule', () => {
    setup({ rules: { '1190001': { manual: true, overtime: false }, '1190002': { manual: false, overtime: true } } });
    const tree = render();
    expect(switchOf(tree, 'switch-manual-1190001').value).toBe(true);
    expect(switchOf(tree, 'switch-overtime-1190001').value).toBe(false);
    expect(switchOf(tree, 'switch-manual-1190002').value).toBe(false);
    expect(switchOf(tree, 'switch-overtime-1190002').value).toBe(true);
    expect(switchOf(tree, 'switch-manual-1190001').disabled).toBe(false);
  });

  it('the pending count per report, and "Nothing pending" without any', () => {
    setup({
      items: [manual('mt-1'), manual('mt-2'), overtime('ot-1', 80001, 1190001)],
      owners: { 'mt-1': ANA, 'mt-2': ANA },
    });
    const tree = render();
    expect(textsOf(one(tree, 'report-pending-1190001')).join('')).toBe('3 pending');
    expect(textsOf(one(tree, 'report-pending-1190002')).join('')).toBe('Nothing pending');
  });

  it('asks useManualOwners for the queue, the reports and the roster', () => {
    const items = [manual('mt-1'), overtime('ot-1', 80001, 1190001)];
    setup({ reports: [ANA, BEN], roster: [ANA, BEN, ANA_SECOND], items });
    render();
    expect(mockUseManualOwners).toHaveBeenLastCalledWith(items, [ANA, BEN], [ANA, BEN, ANA_SECOND]);
  });

  it('counts overtime on a report\'s second assignment through the roster, as the runner does', () => {
    const items = [manual('mt-1'), overtime('ot-9', 80099, 1190001)];
    setup({ reports: [ANA, BEN], roster: [ANA, BEN, ANA_SECOND], items, owners: { 'mt-1': ANA } });
    expect(textsOf(one(render(), 'report-pending-1190001')).join('')).toBe('2 pending');

    // Off the roster (not one of the manager's assignments): not counted
    setup({ reports: [ANA, BEN], roster: [ANA, BEN], items, owners: { 'mt-1': ANA } });
    expect(textsOf(one(render(), 'report-pending-1190001')).join('')).toBe('1 pending');
  });

  it('counts manual time proven on a report\'s second assignment for that report', () => {
    setup({ reports: [ANA, BEN], roster: [ANA, BEN, ANA_SECOND], items: [manual('mt-1')], owners: { 'mt-1': ANA_SECOND } });
    expect(textsOf(one(render(), 'report-pending-1190001')).join('')).toBe('1 pending');
  });

  it('does not count items that match nobody', () => {
    setup({
      items: [
        manual('mt-1', 4242), // no proof
        manual('mt-2', 1190001), // Ana's candidate.userId, but no proof: a userId is never matched
        manual('mt-3'), // proven nobody's
        overtime('ot-1', 99999, 1190001), // Ana's, on an assignment off the manager's roster
      ],
      owners: { 'mt-3': null },
    });
    const tree = render();
    expect(textsOf(one(tree, 'report-pending-1190001')).join('')).toBe('Nothing pending');
    expect(textsOf(one(tree, 'report-pending-1190002')).join('')).toBe('Nothing pending');
  });

  it('while the manual proof loads: "Checking…" where nothing is known yet, counts where they are, switches usable', () => {
    setup({
      items: [manual('mt-1'), overtime('ot-1', 80001, 1190001)],
      ownersLoading: true,
    });
    const tree = render();
    // Ana's overtime is known already; her manual request is still being matched
    expect(textsOf(one(tree, 'report-pending-1190001')).join('')).toBe('1 pending');
    expect(textsOf(one(tree, 'report-pending-1190002')).join('')).toBe('Checking…');
    expect(switchOf(tree, 'switch-manual-1190002').disabled).toBe(false);
    expect(has(tree, 'skeleton-loader')).toBe(false);

    // Loaded: the proof's count
    setup({ items: [manual('mt-1'), overtime('ot-1', 80001, 1190001)], owners: { 'mt-1': BEN } });
    const loaded = render();
    expect(textsOf(one(loaded, 'report-pending-1190002')).join('')).toBe('1 pending');
  });

  it('a report without a userId: both switches off and disabled, with a note', () => {
    setup({ reports: [ANA, XU] });
    const tree = render();
    expect(switchOf(tree, 'switch-manual-a81000')).toMatchObject({ value: false, disabled: true });
    expect(switchOf(tree, 'switch-overtime-a81000')).toMatchObject({ value: false, disabled: true });
    expect(textsOf(one(tree, 'report-note-a81000'))).toEqual([
      "Can't be matched safely yet, so their requests stay with you.",
    ]);
    // A report with a userId has no note
    expect(has(tree, 'report-note-1190001')).toBe(false);
  });

  it('a report without a userId never saves or asks, even if the switch fires', () => {
    const { setRule } = setup({ reports: [XU] });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-a81000').toggle(true);
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(setRule).not.toHaveBeenCalled();
  });

  it('shows the team name only when the reports span more than one team', () => {
    setup({ reports: [ANA, BEN] });
    expect(textsOf(render().root)).not.toContain('Platform');

    const mobileBen = { ...BEN, teamId: '5000', teamName: 'Mobile' };
    setup({ reports: [ANA, mobileBen] });
    const tree = render();
    expect(textsOf(one(tree, 'report-row-1190001'))).toContain('Platform');
    expect(textsOf(one(tree, 'report-row-1190002'))).toContain('Mobile');
  });

  it('initials stand in for a missing photo', () => {
    setup({ reports: [ANA] });
    expect(textsOf(one(render(), 'report-row-1190001'))).toContain('AR');
  });
});

// ─── Switches ────────────────────────────────────────────────────────────────

describe('DirectReportsScreen — turning a switch on', () => {
  it('asks first, and saves only after "Turn on"', async () => {
    const { setRule } = setup();
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-1190001').toggle(true);
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe("Auto-approve Ana's manual time?");
    expect(setRule).not.toHaveBeenCalled();

    const turnOn = alertButtons().find((b) => b.text === 'Turn on');
    await act(async () => {
      turnOn?.onPress?.();
    });
    expect(setRule).toHaveBeenCalledTimes(1);
    expect(setRule).toHaveBeenCalledWith('1190001', { manual: true });
  });

  it('Cancel saves nothing', async () => {
    const { setRule } = setup();
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-overtime-1190002').toggle(true);
    });
    expect(alertSpy.mock.calls[0][0]).toBe("Auto-approve Ben's overtime?");
    const buttons = alertButtons();
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Turn on']);
    const cancel = buttons.find((b) => b.text === 'Cancel');
    expect(cancel?.style).toBe('cancel');
    await act(async () => {
      cancel?.onPress?.();
    });
    expect(setRule).not.toHaveBeenCalled();
    expect(switchOf(tree, 'switch-overtime-1190002').value).toBe(false);
  });

  it('the overtime switch saves { overtime: true } after "Turn on"', async () => {
    const { setRule } = setup();
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-overtime-1190001').toggle(true);
    });
    await act(async () => {
      alertButtons().find((b) => b.text === 'Turn on')?.onPress?.();
    });
    expect(setRule).toHaveBeenCalledWith('1190001', { overtime: true });
  });

  it('manual time: the copy says how many are waiting and that over-limit time needs Overtime', () => {
    setup({
      items: [manual('mt-1'), manual('mt-2'), overtime('ot-1', 80001, 1190001)],
      owners: { 'mt-1': ANA, 'mt-2': ANA },
    });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-1190001').toggle(true);
    });
    const message = alertSpy.mock.calls[0][1] as string;
    expect(message).toContain('including the 2 requests waiting now');
    expect(message).toContain('Manual time that would take Ana over the weekly limit is only approved when Overtime is on too.');
  });

  it('manual time with Overtime already on: over-limit time is approved as well', () => {
    setup({ rules: { '1190001': { manual: false, overtime: true } }, items: [manual('mt-1')], owners: { 'mt-1': ANA } });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-1190001').toggle(true);
    });
    const message = alertSpy.mock.calls[0][1] as string;
    expect(message).toContain('including the 1 request waiting now');
    expect(message).toContain('Overtime is on too, so manual time that takes Ana over the weekly limit is approved as well.');
  });

  it('overtime: the waiting count includes a second assignment (the roster), and the limit rule follows Manual time', () => {
    setup({
      reports: [ANA, BEN],
      roster: [ANA, BEN, ANA_SECOND],
      rules: { '1190001': { manual: true, overtime: false } },
      items: [overtime('ot-1', 80001, 1190001), overtime('ot-9', 80099, 1190001), manual('mt-1')],
      owners: { 'mt-1': ANA },
    });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-overtime-1190001').toggle(true);
    });
    expect(alertSpy.mock.calls[0][1]).toBe(
      "Hourglass will approve Ana's overtime requests whenever you open the app, including the 2 waiting now. " +
        'Manual time that takes Ana over the weekly limit will be approved too.',
    );
  });

  it('manual time: the waiting count is the proof\'s, never a userId match', () => {
    // Two requests carry Ana's candidate.userId; only one is proven hers
    setup({ items: [manual('mt-1', 1190001), manual('mt-2', 1190001)], owners: { 'mt-2': ANA } });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-1190001').toggle(true);
    });
    expect(alertSpy.mock.calls[0][1]).toContain('including the 1 request waiting now');
  });

  it('manual time before every request\'s owner is known: no count, "any requests waiting now"', () => {
    // Still proving (loading), and after a failed read (not loading, not settled)
    for (const state of [{ ownersLoading: true }, { ownersSettled: false }]) {
      alertSpy.mockClear();
      setup({ items: [manual('mt-1'), manual('mt-2')], owners: { 'mt-1': ANA }, ...state });
      const tree = render();
      act(() => {
        switchOf(tree, 'switch-manual-1190001').toggle(true);
      });
      const message = alertSpy.mock.calls[0][1] as string;
      expect(message).toContain("Hourglass will approve Ana's manual time whenever you open the app, including any requests waiting now.");
      expect(message).not.toContain('1 request');
    }
  });

  it('overtime keeps its count while the manual proof is still loading', () => {
    setup({ items: [overtime('ot-1', 80001, 1190001), manual('mt-1')], ownersLoading: true });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-overtime-1190001').toggle(true);
    });
    expect(alertSpy.mock.calls[0][1]).toContain('including the 1 waiting now');
  });

  it('nothing waiting: no count in the copy', () => {
    setup();
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-overtime-1190002').toggle(true);
    });
    expect(alertSpy.mock.calls[0][1]).toBe("Hourglass will approve Ben's overtime requests whenever you open the app.");
  });
});

describe('DirectReportsScreen — turning a switch off', () => {
  it('saves { [kind]: false } at once, with no Alert', async () => {
    const { setRule } = setup({ rules: { '1190001': { manual: true, overtime: true } } });
    const tree = render();
    await act(async () => {
      switchOf(tree, 'switch-overtime-1190001').toggle(false);
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(setRule).toHaveBeenCalledWith('1190001', { overtime: false });

    await act(async () => {
      switchOf(tree, 'switch-manual-1190001').toggle(false);
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(setRule).toHaveBeenLastCalledWith('1190001', { manual: false });
  });
});

describe('DirectReportsScreen — saving', () => {
  it('a failed save shows "Couldn\'t save" and the switch shows the stored state again', async () => {
    const setRule = jest.fn().mockRejectedValue(new Error('Auto-approve settings could not be saved'));
    setup({ rules: { '1190001': { manual: true, overtime: false } }, setRule });
    const tree = render();
    await act(async () => {
      switchOf(tree, 'switch-manual-1190001').toggle(false);
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledWith("Couldn't save", "Your change wasn't saved. Try again.");
    expect(switchOf(tree, 'switch-manual-1190001')).toMatchObject({ value: true, disabled: false });
  });

  it('a failed save after "Turn on" also says so', async () => {
    const setRule = jest.fn().mockRejectedValue(new Error('full'));
    setup({ setRule });
    const tree = render();
    act(() => {
      switchOf(tree, 'switch-manual-1190002').toggle(true);
    });
    await act(async () => {
      alertButtons().find((b) => b.text === 'Turn on')?.onPress?.();
    });
    await settle();
    expect(alertSpy).toHaveBeenLastCalledWith("Couldn't save", "Your change wasn't saved. Try again.");
    expect(switchOf(tree, 'switch-manual-1190002').value).toBe(false);
  });

  it('while a save is in flight the switch shows the new value and is locked', async () => {
    let resolve!: () => void;
    const setRule = jest.fn(() => new Promise<void>((res) => (resolve = res)));
    setup({ rules: { '1190001': { manual: true, overtime: false } }, setRule });
    const tree = render();
    await act(async () => {
      switchOf(tree, 'switch-manual-1190001').toggle(false);
    });
    expect(switchOf(tree, 'switch-manual-1190001')).toMatchObject({ value: false, disabled: true });
    // The other switch is not locked
    expect(switchOf(tree, 'switch-overtime-1190001').disabled).toBe(false);

    await act(async () => {
      resolve();
    });
    await settle();
    expect(switchOf(tree, 'switch-manual-1190001').disabled).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

describe('DirectReportsScreen — manager preview', () => {
  it('shows the preview note on a non-manager account with devManagerView', () => {
    setup({ config: PREVIEW_CONFIG });
    const tree = render();
    expect(textsOf(one(tree, 'direct-reports-preview'))).toEqual(['Preview data — nothing is sent to Crossover']);
  });

  it('no preview note for a real manager', () => {
    setup({ config: MANAGER_CONFIG });
    expect(has(render(), 'direct-reports-preview')).toBe(false);
  });

  it('no preview note for a real manager who also has devManagerView on', () => {
    setup({ config: { ...MANAGER_CONFIG, devManagerView: true } });
    expect(has(render(), 'direct-reports-preview')).toBe(false);
  });
});

// ─── Log ─────────────────────────────────────────────────────────────────────

describe('DirectReportsScreen — recently auto-approved', () => {
  it('an empty log says so', () => {
    setup();
    const tree = render();
    expect(textsOf(one(tree, 'auto-approve-log-empty')).join('')).toContain('Nothing yet.');
    expect(has(tree, 'auto-approve-log-row')).toBe(false);
  });

  it('one row per entry, with the outcome label when not approved', () => {
    setup({
      log: [
        logEntry({ id: 'mt-1', outcome: 'approved' }),
        logEntry({ id: 'ot-2', category: 'OVERTIME', name: 'Ben Okafor', outcome: 'over_limit' }),
        logEntry({ id: 'mt-3', outcome: 'deadline_passed' }),
        logEntry({ id: 'mt-4', outcome: 'retrying' }),
        logEntry({ id: 'mt-5', outcome: 'failed' }),
      ],
    });
    const rows = all(render().root, 'auto-approve-log-row');
    expect(rows).toHaveLength(5);
    const lines = rows.map((row) => textsOf(row).join(''));
    expect(lines[0]).toContain('Ana Ruiz');
    expect(lines[0]).toContain('Manual time · 1h 30m');
    expect(lines[0]).not.toMatch(/left for you|Deadline passed|try again/);
    expect(lines[1]).toContain('Ben Okafor');
    expect(lines[1]).toContain('Overtime · 1h 30m');
    expect(lines[1]).toContain('Over weekly limit — left for you');
    expect(lines[2]).toContain('Deadline passed');
    expect(lines[3]).toContain("Couldn't reach Crossover — will try again");
    expect(lines[3]).not.toContain('Failed');
    expect(lines[4]).toContain('Failed — left for you');
  });

  it('marks simulated entries "(preview)", and only those', () => {
    setup({
      config: PREVIEW_CONFIG,
      log: [logEntry({ id: 'mt-1', simulated: true }), logEntry({ id: 'mt-2' })],
    });
    const rows = all(render().root, 'auto-approve-log-row');
    expect(textsOf(rows[0])).toContain(' (preview)');
    expect(textsOf(rows[1]).join('')).not.toContain('(preview)');
  });

  it('shows how long ago each entry was', () => {
    const at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    setup({ log: [logEntry({ at })] });
    expect(textsOf(one(render(), 'auto-approve-log-row'))).toContain('5 min ago');
  });
});
