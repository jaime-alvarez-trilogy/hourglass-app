// Tests: ApprovalsScreen — FR3, FR4, FR5 (02-approvals-tab-redesign)
//        + durable-data 04-requests-history-ui FR4 (DD4.18-DD4.24)
// File: app/(tabs)/approvals.tsx
//
// Strategy:
//   - Runtime render tests for contributor vs manager role, empty states, loading
//   - Source-file static analysis for "Requests" title and no useRouter redirect
//   - durable-data 04: the Older toggle, the quiet note vs the no-data banner, the
//     'incomplete' empty state, the pull spinner and the copy guard, all driven through
//     a mocked useMyRequests (fixtures relative to the current week, C9)
//   - durable-data 05 FR4 (DD5.36): the screen imports useRequestsBackfill and calls it,
//     with no arguments, on every render (static check + the mocked hook's calls)
//
// Mocks:
//   - useConfig, useMyRequests, useApprovalItems (hooks)
//   - useRequestsBackfill (factory form, durable-data 05 C16)
//   - expo-router (no redirect tests)
//   - react-native-safe-area-context

import React from 'react';
import { create as createRenderer, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Mock setup ───────────────────────────────────────────────────────────────

jest.mock('@/src/hooks/useConfig');
jest.mock('@/src/hooks/useMyRequests');
jest.mock('@/src/hooks/useApprovalItems');

// durable-data 05 C16: factory form, so the real hook never loads. It needs a
// QueryClientProvider (useQueryClient) these renders do not have, and would start its
// 5 s timer and the backfill's AsyncStorage reads inside render tests.
jest.mock('@/src/hooks/useRequestsBackfill', () => ({ useRequestsBackfill: jest.fn() }));

// 1.2 auto-approve entry row (manager branch): stubbed for the same reason, its hooks
// (useAutoApproveSettings / useDirectReports) need a QueryClientProvider.
jest.mock('@/src/components/AutoApproveEntryRow', () => ({ AutoApproveEntryRow: () => null }));

// useStaggeredEntry — return plain styles (no Reanimated shared values in tests)
jest.mock('@/src/hooks/useStaggeredEntry', () => ({
  useStaggeredEntry: () => ({
    getEntryStyle: () => ({}),
    isReady: true,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      mockReact.createElement('View', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// FadeInScreen passthrough — removes Reanimated dependency in tests
jest.mock('@/src/components/FadeInScreen', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) =>
      mockReact.createElement(mockReact.Fragment, null, children),
  };
});

// SkeletonLoader — render as a recognisable placeholder
jest.mock('@/src/components/SkeletonLoader', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: (props: any) =>
      mockReact.createElement('View', { testID: 'skeleton-loader', ...props }),
  };
});

// ApprovalCard — lightweight stub (not testing manager queue internals)
jest.mock('@/src/components/ApprovalCard', () => ({
  ApprovalCard: ({ item }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('View', { testID: 'approval-card' },
      mockReact.createElement('Text' as any, null, item.fullName)
    );
  },
}));

// RejectionSheet passthrough
jest.mock('@/src/components/RejectionSheet', () => {
  const mockReact = require('react');
  return {
    RejectionSheet: () => null,
  };
});

// MyRequestCard stub
jest.mock('@/src/components/MyRequestCard', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: ({ entry }: any) =>
      mockReact.createElement('View', { testID: 'my-request-card' },
        mockReact.createElement('Text' as any, null, entry.memo)
      ),
  };
});

// ─── Typed mock imports ───────────────────────────────────────────────────────

import { useConfig } from '@/src/hooks/useConfig';
import { useIsManager as useIsManagerMock } from '@/src/hooks/useIsManager';
import { useMyRequests } from '@/src/hooks/useMyRequests';
import { useApprovalItems } from '@/src/hooks/useApprovalItems';
import { useRequestsBackfill } from '@/src/hooks/useRequestsBackfill';
import { AUTH_LOGIN_LATCHED, NO_CREDENTIALS } from '@/src/api/errors';
import SectionLabel from '@/src/components/SectionLabel';
import { stripComments } from '../../../__tests__/helpers/stripComments';
import ApprovalsScreen from '../approvals';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Compute current week's Monday dynamically so buildTeamQueueRows places this
// item in the "This Week" group regardless of when the test runs.
function getCurrentMondayString(): string {
  const today = new Date();
  const day = today.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// durable-data 04 C9: dated this week, so the bounded buckets keep it visible (a fixed
// March date would sit behind the collapsed Older toggle).
const MOCK_ENTRY_PENDING = {
  id: `${getCurrentMondayString()}|Fix deploy`,
  date: getCurrentMondayString(),
  durationMinutes: 30,
  memo: 'Fix deploy',
  status: 'PENDING' as const,
  rejectionReason: null,
};

const MOCK_APPROVAL_ITEM = {
  id: 'item-1',
  fullName: 'Alice Smith',
  hours: 2,
  description: 'Completed feature',
  category: 'MANUAL' as const,
  startDateTime: '2026-03-17T08:00:00',
  timecardIds: ['tc-1'],
  weekStartDate: getCurrentMondayString(),
};

const MOCK_CONFIG_CONTRIBUTOR = {
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

const MOCK_CONFIG_MANAGER = {
  ...MOCK_CONFIG_CONTRIBUTOR,
  isManager: true,
};

// Helper: set up all hook mocks at once. Returns the two refetch mocks.
// durable-data 04: errorCode / staleDates / updatedAt are only put on the useMyRequests
// return when given, so the default mock keeps the legacy shape (the screen must default
// them, as the approvals-mesh mocks also lack them). `refetch` injects the My Requests
// refetch (e.g. one returning a deferred promise).
function setupMocks(opts: {
  isManager?: boolean | null | undefined;
  configNull?: boolean;
  entries?: any[];
  myLoading?: boolean;
  myError?: 'auth' | 'network' | null;
  errorCode?: string | null;
  staleDates?: string[];
  updatedAt?: string | null;
  refetch?: jest.Mock;
  items?: any[];
  teamLoading?: boolean;
  teamError?: string | null;
} = {}) {
  const config = opts.configNull
    ? null
    : opts.isManager === true
      ? MOCK_CONFIG_MANAGER
      : opts.isManager === undefined
        ? { ...MOCK_CONFIG_CONTRIBUTOR, isManager: undefined }
        : MOCK_CONFIG_CONTRIBUTOR;

  (useConfig as jest.Mock).mockReturnValue({
    config,
    isLoading: opts.configNull ?? false,
  });

  // 04-team-view-content FR1: approvals.tsx derives isManager from useIsManager(),
  // not useConfig() directly. Mirror the same tri-state resolution so existing
  // isManager-driven fixtures keep working after the hook-extraction swap.
  (useIsManagerMock as jest.Mock).mockReturnValue(opts.isManager === true);

  const myRefetch = opts.refetch ?? jest.fn();
  const teamRefetch = jest.fn();

  (useMyRequests as jest.Mock).mockReturnValue({
    entries: opts.entries ?? [],
    isLoading: opts.myLoading ?? false,
    error: opts.myError ?? null,
    refetch: myRefetch,
    ...(opts.errorCode !== undefined && { errorCode: opts.errorCode }),
    ...(opts.staleDates !== undefined && { staleDates: opts.staleDates }),
    ...(opts.updatedAt !== undefined && { updatedAt: opts.updatedAt }),
  });

  (useApprovalItems as jest.Mock).mockReturnValue({
    items: opts.items ?? [],
    isLoading: opts.teamLoading ?? false,
    error: opts.teamError ?? null,
    refetch: teamRefetch,
    approveItem: jest.fn(),
    rejectItem: jest.fn(),
    approveAll: jest.fn(),
  });

  return { myRefetch, teamRefetch };
}

// ─── Tree isolation ───────────────────────────────────────────────────────────
// Every tree is unmounted after its test. A screen left mounted keeps scheduling timer
// updates, and an async act (DD4.22's settle) waits for its queue to drain, so a leaked
// tree from an earlier test could hold that act open until the test times out.

const mountedTrees: any[] = [];

function create(element: React.ReactElement): any {
  const tree = createRenderer(element);
  mountedTrees.push(tree);
  return tree;
}

afterEach(() => {
  act(() => {
    for (const tree of mountedTrees.splice(0)) tree.unmount();
  });
});

// ─── File path ────────────────────────────────────────────────────────────────

const APPROVALS_FILE = path.resolve(__dirname, '../approvals.tsx');

// ─── Source file static checks ────────────────────────────────────────────────

describe('ApprovalsScreen — source file checks (FR3)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  // SC3.6 — Header shows "Requests" not "Approvals"
  it('SC3.6 — source contains "Requests" as header title text', () => {
    expect(source).toContain('Requests');
  });

  it('SC3.6 — source does NOT contain "Approvals" as a displayed title string', () => {
    // "Approvals" should not appear as a visible text label (comments ok)
    expect(code).not.toMatch(/>Approvals</);
    expect(code).not.toMatch(/"Approvals"/);
  });

  // SC3.7 — No useRouter redirect logic
  it('SC3.7 — source does not import useRouter from expo-router', () => {
    expect(code).not.toMatch(/useRouter/);
  });

  it('SC3.7 — source does not call router.replace', () => {
    expect(code).not.toMatch(/router\.replace/);
  });

  it('SC3.7 — source does not redirect contributors to home tab', () => {
    expect(code).not.toMatch(/isManager === false[\s\S]{0,80}router/);
  });

  it('SC3.7 — source imports useMyRequests', () => {
    expect(source).toContain('useMyRequests');
  });
});

// ─── Runtime render: Contributor view (FR3 SC3.1) ────────────────────────────

describe('ApprovalsScreen — contributor view (FR3 SC3.1)', () => {
  beforeEach(() => {
    setupMocks({ isManager: false, entries: [MOCK_ENTRY_PENDING] });
  });

  it('SC3.1 — renders without crash for contributor', () => {
    expect(() => {
      act(() => { create(React.createElement(ApprovalsScreen)); });
    }).not.toThrow();
  });

  it('SC3.1 — MY REQUESTS section header is present', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/MY REQUESTS/i);
  });

  it('SC3.1 — TEAM REQUESTS section header is NOT present for contributor', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toMatch(/TEAM REQUESTS/i);
  });

  it('SC3.1 — approval-card is NOT rendered for contributor', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toContain('"approval-card"');
  });
});

// ─── Runtime render: Manager view (FR3 SC3.2) ────────────────────────────────

describe('ApprovalsScreen — manager view (FR3 SC3.2)', () => {
  beforeEach(() => {
    setupMocks({
      isManager: true,
      entries: [MOCK_ENTRY_PENDING],
      items: [MOCK_APPROVAL_ITEM],
    });
  });

  it('SC3.2 — renders without crash for manager', () => {
    expect(() => {
      act(() => { create(React.createElement(ApprovalsScreen)); });
    }).not.toThrow();
  });

  it('SC3.2 — TEAM REQUESTS section header is present for manager', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/TEAM REQUESTS/i);
  });

  it('SC3.2 — MY REQUESTS section header is present for manager', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/MY REQUESTS/i);
  });

  it('SC3.2 — approval-card is rendered for manager with team items', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('"approval-card"');
  });

  it('SC3.2 — my-request-card is rendered for manager with own entries', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('"my-request-card"');
  });
});

// ─── Runtime render: isManager undefined (FR3 SC3.3) ─────────────────────────

describe('ApprovalsScreen — isManager undefined treated as contributor (SC3.3)', () => {
  beforeEach(() => {
    setupMocks({ isManager: undefined, entries: [MOCK_ENTRY_PENDING] });
  });

  it('SC3.3 — renders without crash when isManager is undefined', () => {
    expect(() => {
      act(() => { create(React.createElement(ApprovalsScreen)); });
    }).not.toThrow();
  });

  it('SC3.3 — TEAM REQUESTS NOT shown when isManager is undefined', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toMatch(/TEAM REQUESTS/i);
  });

  it('SC3.3 — MY REQUESTS IS shown when isManager is undefined', () => {
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/MY REQUESTS/i);
  });
});

// ─── Runtime render: Loading state (FR3/FR5 SC3.4, SC5.1, SC5.2) ─────────────

describe('ApprovalsScreen — loading skeletons (FR5)', () => {
  it('SC5.1 — MY REQUESTS section shows skeletons when myLoading=true and entries empty', () => {
    setupMocks({ isManager: false, entries: [], myLoading: true });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('"skeleton-loader"');
  });

  it('SC5.2 — TEAM REQUESTS section shows skeletons when teamLoading=true and items empty (manager)', () => {
    setupMocks({ isManager: true, items: [], teamLoading: true, entries: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('"skeleton-loader"');
  });

  it('SC5.3 — when only myLoading=true, still renders (no full-screen block)', () => {
    setupMocks({ isManager: true, items: [MOCK_APPROVAL_ITEM], myLoading: true, entries: [] });
    expect(() => {
      act(() => { create(React.createElement(ApprovalsScreen)); });
    }).not.toThrow();
  });
});

// ─── Runtime render: Pull-to-refresh (FR3 SC3.5) ─────────────────────────────

describe('ApprovalsScreen — pull-to-refresh (SC3.5)', () => {
  // Finds the rendered RefreshControl (the node carrying both `refreshing`
  // and an `onRefresh` function) and fires the real handler.
  function fireRefresh(tree: any) {
    const nodes = tree.root.findAll(
      (n: any) => typeof n.props?.onRefresh === 'function' && 'refreshing' in (n.props ?? {}),
    );
    expect(nodes.length).toBeGreaterThan(0);
    act(() => { nodes[0].props.onRefresh(); });
  }

  function setupRefetchMocks(isManager: boolean) {
    const myRefetch = jest.fn();
    const teamRefetch = jest.fn();
    (useIsManagerMock as jest.Mock).mockReturnValue(isManager);
    (useMyRequests as jest.Mock).mockReturnValue({
      entries: [MOCK_ENTRY_PENDING],
      isLoading: false,
      error: null,
      refetch: myRefetch,
    });
    (useApprovalItems as jest.Mock).mockReturnValue({
      items: [],
      isLoading: false,
      error: null,
      refetch: teamRefetch,
      approveItem: jest.fn(),
      rejectItem: jest.fn(),
      approveAll: jest.fn(),
    });
    return { myRefetch, teamRefetch };
  }

  it('SC3.5 — contributor pull-to-refresh calls my-requests refetch but NOT team refetch', () => {
    const { myRefetch, teamRefetch } = setupRefetchMocks(false);
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    fireRefresh(tree);
    expect(myRefetch).toHaveBeenCalledTimes(1);
    expect(teamRefetch).not.toHaveBeenCalled();
  });

  it('SC3.5 — manager pull-to-refresh calls BOTH refetch functions', () => {
    const { myRefetch, teamRefetch } = setupRefetchMocks(true);
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    fireRefresh(tree);
    expect(myRefetch).toHaveBeenCalledTimes(1);
    expect(teamRefetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Runtime render: Empty states (FR4) ──────────────────────────────────────

describe('ApprovalsScreen — empty states (FR4)', () => {
  // SC4.1 — Contributor with empty entries
  it('SC4.1 — contributor with no entries: shows "No requests yet"', () => {
    setupMocks({ isManager: false, entries: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('No requests yet');
  });

  // SC4.2 — Manager with empty team queue shows "All caught up"
  it('SC4.2 — manager with empty team queue: shows "All caught up"', () => {
    setupMocks({ isManager: true, items: [], entries: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('All caught up');
  });

  // SC4.3 — Manager with empty own requests
  it('SC4.3 — manager with empty own requests: shows "No requests yet" in MY REQUESTS', () => {
    setupMocks({ isManager: true, entries: [], items: [MOCK_APPROVAL_ITEM] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('No requests yet');
  });

  // SC4.4 — Manager with both empty: both empty states render independently
  it('SC4.4 — manager with both empty: both "All caught up" and "No requests yet" present', () => {
    setupMocks({ isManager: true, entries: [], items: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('All caught up');
    expect(text).toContain('No requests yet');
  });
});

// ─── 04-team-view-content FR1: useIsManager() adoption regression guard ──────
//
// approvals.tsx's only use of `config` is the manager-detection expression, so
// FR1 requires it to drop `useConfig` entirely and call `useIsManager()`
// instead. These tests guard that (a) the swap actually happened in source,
// and (b) manager-gated rendering behavior is unchanged after the swap.

jest.mock('@/src/hooks/useIsManager');

describe('ApprovalsScreen — source file checks (04-team-view-content FR1)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('imports useIsManager from @/src/hooks/useIsManager', () => {
    expect(source).toMatch(/import\s*\{\s*useIsManager\s*\}\s*from\s*['"]@\/src\/hooks\/useIsManager['"]/);
  });

  it('does not import useConfig (its only use was the manager expression)', () => {
    expect(code).not.toMatch(/useConfig/);
  });

  it('isManager is derived from useIsManager(), not the inline expression', () => {
    expect(source).toMatch(/isManager\s*=\s*useIsManager\s*\(\s*\)/);
    expect(source).not.toMatch(
      /config\?\.isManager\s*===\s*true\s*\|\|\s*config\?\.devManagerView\s*===\s*true/,
    );
  });
});

describe('ApprovalsScreen — manager-gated behavior unchanged after useIsManager() adoption', () => {
  it('non-manager (useIsManager → false): no TEAM REQUESTS section', () => {
    (useIsManagerMock as jest.Mock).mockReturnValue(false);
    setupMocks({ entries: [MOCK_ENTRY_PENDING] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toMatch(/TEAM REQUESTS/i);
  });

  it('manager (useIsManager → true): TEAM REQUESTS section renders', () => {
    setupMocks({ isManager: true, items: [MOCK_APPROVAL_ITEM], entries: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/TEAM REQUESTS/i);
  });

  it('manager (useIsManager → true) with pending items: Approve All button renders', () => {
    setupMocks({ isManager: true, items: [MOCK_APPROVAL_ITEM], entries: [] });
    let tree: any;
    act(() => { tree = create(React.createElement(ApprovalsScreen)); });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Approve All');
  });
});

// ─── durable-data 04-requests-history-ui FR4 ─────────────────────────────────
//
// The screen over up to 24 weeks of stored requests (spec 02):
//   - DD4.18 bounded buckets, then a collapsed "Show older requests (N)" toggle that
//     expands into month-grouped entries;
//   - DD4.19 with entries visible, a failed or partial refresh is one quiet note
//     (my-requests-note), never the red banner;
//   - DD4.20 with nothing visible, the red banner (my-requests-banner) with neutral auth
//     copy, and no Retry where it cannot help (NO_CREDENTIALS);
//   - DD4.21 an honest 'incomplete' empty state instead of "No requests yet" (C3);
//   - DD4.22 the pull spinner follows the forced refetch until it settles;
//   - DD4.23 no "re-open" / "password" copy anywhere.
// The copy is written out here (not imported from src/lib/requestRows), so these cases
// pin the words the user reads. Entries are dated relative to the current week (C9).
// The default setupMocks leaves isManager false and teamError null, so every "Retry"
// on screen in these cases belongs to My Requests.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM-DD' → 'September 2026' (independent of the screen's own helper). */
function monthLabelOf(date: string): string {
  const [y, m] = date.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** Local calendar arithmetic on 'YYYY-MM-DD' (noon-anchored, so DST never shifts the day). */
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function requestEntry(date: string, memo: string) {
  return {
    id: `${date}|${memo}`,
    date,
    durationMinutes: 30,
    memo,
    status: 'PENDING' as const,
    rejectionReason: null,
  };
}

const CURRENT_MONDAY = getCurrentMondayString();
const PREV_MONDAY_2 = addDays(CURRENT_MONDAY, -14);
const THIS_WEEK_ENTRY = requestEntry(CURRENT_MONDAY, 'This week work');
const LAST_WEEK_ENTRY = requestEntry(addDays(CURRENT_MONDAY, -7), 'Last week work');
// Both are before prevMonday2, so both are "older". Sorted descending, as the view is.
const OLDER_A = requestEntry(addDays(PREV_MONDAY_2, -7), 'Older work A');
const OLDER_B = requestEntry(addDays(PREV_MONDAY_2, -8), 'Older work B');
const OLDER_MONTHS = Array.from(new Set([OLDER_A, OLDER_B].map((e) => monthLabelOf(e.date))));

const VISIBLE = [THIS_WEEK_ENTRY, LAST_WEEK_ENTRY];

const NEUTRAL_AUTH_NOTE = "Can't sign in to Crossover right now · showing saved requests";
const NO_CREDS_NOTE =
  'Saved sign-in missing · showing saved requests · sign out and back in from Settings';
const NEUTRAL_AUTH_BANNER =
  "Can't sign in to Crossover right now. If this keeps happening, sign out and back in from Settings.";
const NO_CREDS_BANNER = 'Your saved sign-in is missing. Sign out and back in from Settings.';
const NETWORK_BANNER = 'Could not load requests.';
const INCOMPLETE_TEXT = "Some days couldn't refresh, so requests may be missing.";
const OLD_AUTH_COPY = 'Authentication error';

/** An ISO timestamp `min` minutes before now (the screen reads Date.now() at render). */
const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function renderScreen(): any {
  let tree: any;
  act(() => { tree = create(React.createElement(ApprovalsScreen)); });
  return tree;
}

/** Every rendered string under `node`, in tree order. */
function textsInOrder(node: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    for (const child of n.children ?? []) {
      if (typeof child === 'string') out.push(child);
      else walk(child);
    }
  };
  walk(node);
  return out;
}

const textOf = (node: any) => textsInOrder(node).join('');

function byTestID(tree: any, testID: string): any | undefined {
  return tree.root.findAll((n: any) => n.props?.testID === testID)[0];
}

/** The outermost pressable under `node` whose text is exactly `label`. */
function pressableIn(node: any, label: string): any {
  const found = node.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && textOf(n) === label,
  )[0];
  if (!found) throw new Error(`No pressable "${label}" rendered`);
  return found;
}

function olderToggle(tree: any): any {
  const found = tree.root.findAll(
    (n: any) => n.props?.testID === 'older-toggle' && typeof n.props?.onPress === 'function',
  )[0];
  if (!found) throw new Error('No pressable older-toggle rendered');
  return found;
}

const cardCount = (tree: any) =>
  tree.root.findAll((n: any) => n.props?.testID === 'my-request-card').length;

const approvalCardCount = (tree: any) =>
  tree.root.findAll((n: any) => n.props?.testID === 'approval-card').length;

const retryCount = (node: any) => textsInOrder(node).filter((t) => t === 'Retry').length;

/** The rendered RefreshControl (the node carrying `refreshing` and an `onRefresh`). */
function refreshControl(tree: any): any {
  const nodes = tree.root.findAll(
    (n: any) => typeof n.props?.onRefresh === 'function' && 'refreshing' in (n.props ?? {}),
  );
  if (nodes.length === 0) throw new Error('No RefreshControl rendered');
  return nodes[0];
}

/** A promise whose settlement the test controls (holds the refetch in flight). */
function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Lets every queued continuation run (allSettled → finally → setPulling) inside act.
 * jest-circus fails the running test on an unhandledRejection, and this turn is where
 * Node would report one.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
}

describe('ApprovalsScreen — durable-data 04 FR4 DD4.18: collapsible Older section', () => {
  it('collapsed by default: one toggle counts the 2 older entries; their cards and months stay hidden', () => {
    setupMocks({ entries: [THIS_WEEK_ENTRY, OLDER_A, OLDER_B] });
    const tree = renderScreen();
    const text = textOf(tree.root);

    expect(text).toContain('Show older requests (2)');
    expect(text).toContain('This week work');
    expect(text).not.toContain('Older work A');
    expect(text).not.toContain('Older work B');
    for (const month of OLDER_MONTHS) expect(text).not.toContain(month);
    // "2 Weeks Ago" is bounded: nothing in it, so no header (older entries no longer pile in).
    expect(text).not.toContain('2 Weeks Ago');
    expect(cardCount(tree)).toBe(1);

    const toggle = olderToggle(tree);
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityLabel).toBe('Show older requests (2)');
  });

  it('pressing the toggle shows the older entries under month headers after the recent buckets; pressing again collapses', () => {
    setupMocks({ entries: [THIS_WEEK_ENTRY, OLDER_A, OLDER_B] });
    const tree = renderScreen();

    act(() => { olderToggle(tree).props.onPress(); });

    const texts = textsInOrder(tree.root);
    const text = texts.join('');
    expect(text).toContain('Hide older requests');
    expect(text).not.toContain('Show older requests');
    expect(text).toContain('Older work A');
    expect(text).toContain('Older work B');
    expect(cardCount(tree)).toBe(3);
    expect(olderToggle(tree).props.accessibilityLabel).toBe('Hide older requests');

    // Each month is a section header, like the week buckets.
    for (const month of OLDER_MONTHS) {
      expect(
        tree.root.findAll((n: any) => n.type === SectionLabel && n.props.children === month),
      ).toHaveLength(1);
    }

    // Order: the recent bucket, then the toggle, then each older entry under its month.
    const at = (s: string) => texts.indexOf(s);
    expect(at('This Week')).toBeGreaterThanOrEqual(0);
    expect(at('This Week')).toBeLessThan(at('This week work'));
    expect(at('This week work')).toBeLessThan(at('Hide older requests'));
    for (const month of OLDER_MONTHS) expect(at('Hide older requests')).toBeLessThan(at(month));
    expect(at(monthLabelOf(OLDER_A.date))).toBeLessThan(at('Older work A'));
    expect(at(monthLabelOf(OLDER_B.date))).toBeLessThan(at('Older work B'));
    expect(at('Older work A')).toBeLessThan(at('Older work B'));

    act(() => { olderToggle(tree).props.onPress(); });

    const collapsed = textOf(tree.root);
    expect(collapsed).toContain('Show older requests (2)');
    expect(collapsed).not.toContain('Older work A');
    expect(collapsed).not.toContain('Older work B');
    expect(cardCount(tree)).toBe(1);
  });

  it('the toggle is local to My Requests: expanding it leaves the team queue unchanged', () => {
    setupMocks({
      isManager: true,
      entries: [THIS_WEEK_ENTRY, OLDER_A, OLDER_B],
      items: [MOCK_APPROVAL_ITEM],
    });
    const tree = renderScreen();
    expect(approvalCardCount(tree)).toBe(1);

    act(() => { olderToggle(tree).props.onPress(); });

    expect(approvalCardCount(tree)).toBe(1);
    expect(textOf(tree.root)).toMatch(/Team Requests/i);
    expect(cardCount(tree)).toBe(3);
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.19: with entries, one quiet note', () => {
  /** No red banner and none of its copy while entries are on screen. */
  function expectNoBanner(tree: any) {
    const text = textOf(tree.root);
    expect(byTestID(tree, 'my-requests-banner')).toBeUndefined();
    expect(text).not.toContain(NETWORK_BANNER);
    expect(text).not.toContain(OLD_AUTH_COPY);
    expect(text).not.toContain(NEUTRAL_AUTH_BANNER);
    expect(text).not.toContain(NO_CREDS_BANNER);
  }

  it("'network': the note reads \"Showing saved requests · updated 5 min ago\" with Retry, over every card", () => {
    const { myRefetch } = setupMocks({
      entries: VISIBLE,
      myError: 'network',
      errorCode: null,
      staleDates: [],
      updatedAt: minutesAgo(5),
    });
    const tree = renderScreen();

    const note = byTestID(tree, 'my-requests-note');
    expect(note).toBeDefined();
    expect(textsInOrder(note)).toEqual(['Showing saved requests · updated 5 min ago', 'Retry']);
    expectNoBanner(tree);
    expect(cardCount(tree)).toBe(2);
    expect(retryCount(tree.root)).toBe(1);

    act(() => { pressableIn(note, 'Retry').props.onPress(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
  });

  it("'network' with the legacy mock shape (no errorCode/staleDates/updatedAt): the note has no \"updated\" suffix", () => {
    setupMocks({ entries: VISIBLE, myError: 'network' });
    const tree = renderScreen();

    const note = byTestID(tree, 'my-requests-note');
    expect(note).toBeDefined();
    expect(textsInOrder(note)).toEqual(['Showing saved requests', 'Retry']);
    expectNoBanner(tree);
    expect(cardCount(tree)).toBe(2);
  });

  it.each([
    ['unset', undefined],
    ['null', null],
    ['AUTH_LOGIN_LATCHED', AUTH_LOGIN_LATCHED],
  ])("'auth' with errorCode %s: the neutral note with Retry, over every card", (_label, errorCode) => {
    const { myRefetch } = setupMocks({
      entries: VISIBLE,
      myError: 'auth',
      errorCode,
      updatedAt: minutesAgo(5),
    });
    const tree = renderScreen();

    const note = byTestID(tree, 'my-requests-note');
    expect(note).toBeDefined();
    expect(textsInOrder(note)).toEqual([`${NEUTRAL_AUTH_NOTE} · updated 5 min ago`, 'Retry']);
    expectNoBanner(tree);
    expect(cardCount(tree)).toBe(2);

    act(() => { pressableIn(note, 'Retry').props.onPress(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
  });

  it("'auth' + NO_CREDENTIALS: the note points to Settings, and My Requests offers no Retry", () => {
    setupMocks({
      entries: VISIBLE,
      myError: 'auth',
      errorCode: NO_CREDENTIALS,
      updatedAt: minutesAgo(5),
    });
    const tree = renderScreen();

    const note = byTestID(tree, 'my-requests-note');
    expect(note).toBeDefined();
    expect(textsInOrder(note)).toEqual([NO_CREDS_NOTE]);
    expectNoBanner(tree);
    expect(retryCount(tree.root)).toBe(0);
    expect(cardCount(tree)).toBe(2);
  });

  it('stale dates with no error: "Some days couldn\'t refresh · updated 5 min ago", with no Retry', () => {
    setupMocks({
      entries: VISIBLE,
      myError: null,
      errorCode: null,
      staleDates: [CURRENT_MONDAY],
      updatedAt: minutesAgo(5),
    });
    const tree = renderScreen();

    const note = byTestID(tree, 'my-requests-note');
    expect(note).toBeDefined();
    expect(textsInOrder(note)).toEqual(["Some days couldn't refresh · updated 5 min ago"]);
    expectNoBanner(tree);
    expect(retryCount(tree.root)).toBe(0);
    expect(cardCount(tree)).toBe(2);
  });

  it('preserved: a clean refresh shows no note, no banner and no Retry', () => {
    setupMocks({
      entries: VISIBLE,
      myError: null,
      errorCode: null,
      staleDates: [],
      updatedAt: minutesAgo(5),
    });
    const tree = renderScreen();

    expect(byTestID(tree, 'my-requests-note')).toBeUndefined();
    expectNoBanner(tree);
    expect(retryCount(tree.root)).toBe(0);
    expect(cardCount(tree)).toBe(2);
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.20: with no entries, the red banner', () => {
  /** The banner stands alone: no "No requests yet" card under it, and no note. */
  function expectBannerOnly(tree: any) {
    const text = textOf(tree.root);
    expect(text).not.toContain('No requests yet');
    expect(text).not.toContain(INCOMPLETE_TEXT);
    expect(text).not.toContain(OLD_AUTH_COPY);
    expect(byTestID(tree, 'my-requests-note')).toBeUndefined();
  }

  it.each([
    ['unset', undefined],
    ['null', null],
    ['AUTH_LOGIN_LATCHED', AUTH_LOGIN_LATCHED],
  ])("'auth' with errorCode %s: the neutral sentence with Retry", (_label, errorCode) => {
    const { myRefetch } = setupMocks({ entries: [], myError: 'auth', errorCode });
    const tree = renderScreen();

    const banner = byTestID(tree, 'my-requests-banner');
    expect(banner).toBeDefined();
    expect(textsInOrder(banner)).toEqual([NEUTRAL_AUTH_BANNER, 'Retry']);
    expectBannerOnly(tree);

    act(() => { pressableIn(banner, 'Retry').props.onPress(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
  });

  it("'auth' + NO_CREDENTIALS: \"Your saved sign-in is missing…\" with no Retry", () => {
    setupMocks({ entries: [], myError: 'auth', errorCode: NO_CREDENTIALS });
    const tree = renderScreen();

    const banner = byTestID(tree, 'my-requests-banner');
    expect(banner).toBeDefined();
    expect(textsInOrder(banner)).toEqual([NO_CREDS_BANNER]);
    expectBannerOnly(tree);
    expect(retryCount(tree.root)).toBe(0);
  });

  it("'network': \"Could not load requests.\" with Retry", () => {
    const { myRefetch } = setupMocks({ entries: [], myError: 'network', errorCode: null });
    const tree = renderScreen();

    const banner = byTestID(tree, 'my-requests-banner');
    expect(banner).toBeDefined();
    expect(textsInOrder(banner)).toEqual([NETWORK_BANNER, 'Retry']);
    expectBannerOnly(tree);

    act(() => { pressableIn(banner, 'Retry').props.onPress(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
  });

  it("an error wins over stale dates: 'network' + staleDates shows the banner, not the incomplete card", () => {
    setupMocks({ entries: [], myError: 'network', errorCode: null, staleDates: [CURRENT_MONDAY] });
    const tree = renderScreen();

    const banner = byTestID(tree, 'my-requests-banner');
    expect(banner).toBeDefined();
    expect(textsInOrder(banner)).toEqual([NETWORK_BANNER, 'Retry']);
    expectBannerOnly(tree);
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.21: the incomplete empty state (C3)', () => {
  it('no entries, no error, stale dates: the incomplete text with a Retry, never "No requests yet"', () => {
    const { myRefetch } = setupMocks({
      entries: [],
      myError: null,
      errorCode: null,
      staleDates: [CURRENT_MONDAY],
      updatedAt: null,
    });
    const tree = renderScreen();
    const text = textOf(tree.root);

    expect(text).toContain(INCOMPLETE_TEXT);
    expect(text).not.toContain('No requests yet');
    expect(byTestID(tree, 'my-requests-banner')).toBeUndefined();
    expect(byTestID(tree, 'my-requests-note')).toBeUndefined();
    expect(retryCount(tree.root)).toBe(1);

    act(() => { pressableIn(tree.root, 'Retry').props.onPress(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
  });

  it('preserved: no entries, no error, no stale dates → "No requests yet", with no Retry or banner', () => {
    setupMocks({ entries: [], myError: null, errorCode: null, staleDates: [], updatedAt: null });
    const tree = renderScreen();
    const text = textOf(tree.root);

    expect(text).toContain('No requests yet');
    expect(text).not.toContain(INCOMPLETE_TEXT);
    expect(byTestID(tree, 'my-requests-banner')).toBeUndefined();
    expect(retryCount(tree.root)).toBe(0);
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.22: pull-to-refresh follows the forced refetch', () => {
  it('the spinner stays up while the refetch is in flight and drops once it resolves', async () => {
    const pending = deferred();
    const { myRefetch } = setupMocks({
      entries: [MOCK_ENTRY_PENDING],
      refetch: jest.fn(() => pending.promise),
    });
    const tree = renderScreen();
    expect(refreshControl(tree).props.refreshing).toBe(false);

    act(() => { refreshControl(tree).props.onRefresh(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
    expect(refreshControl(tree).props.refreshing).toBe(true);

    // Still in flight after the queue drains: the spinner does not snap back.
    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(true);

    pending.resolve(undefined);
    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(false);
  });

  it('a rejected refetch also drops the spinner, and the rejection is not left unhandled', async () => {
    const pending = deferred();
    setupMocks({
      entries: [MOCK_ENTRY_PENDING],
      refetch: jest.fn(() => pending.promise),
    });
    const tree = renderScreen();

    act(() => { refreshControl(tree).props.onRefresh(); });
    expect(refreshControl(tree).props.refreshing).toBe(true);

    pending.reject(new Error('refresh failed'));
    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(false);
  });

  it('a refetch that throws synchronously still drops the spinner', async () => {
    const { myRefetch } = setupMocks({
      entries: [MOCK_ENTRY_PENDING],
      refetch: jest.fn(() => { throw new Error('sync failure'); }),
    });
    const tree = renderScreen();

    act(() => { refreshControl(tree).props.onRefresh(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);

    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(false);
  });

  it('manager: both refetches are called at once, and the spinner follows My Requests (team refetch returns void)', async () => {
    const pending = deferred();
    const { myRefetch, teamRefetch } = setupMocks({
      isManager: true,
      entries: [MOCK_ENTRY_PENDING],
      items: [MOCK_APPROVAL_ITEM],
      refetch: jest.fn(() => pending.promise),
    });
    const tree = renderScreen();

    act(() => { refreshControl(tree).props.onRefresh(); });
    expect(myRefetch).toHaveBeenCalledTimes(1);
    expect(teamRefetch).toHaveBeenCalledTimes(1);
    expect(refreshControl(tree).props.refreshing).toBe(true);

    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(true);

    pending.resolve(undefined);
    await settle();
    expect(refreshControl(tree).props.refreshing).toBe(false);
  });

  it('isLoading with no pull: refreshing is false (the skeletons show instead)', () => {
    setupMocks({ entries: [], myLoading: true });
    const tree = renderScreen();

    expect(textOf(tree.root)).not.toContain('No requests yet');
    expect(refreshControl(tree).props.refreshing).toBe(false);
  });

  it('manager with both sections loading and no pull: refreshing is false', () => {
    setupMocks({ isManager: true, entries: [], items: [], myLoading: true, teamLoading: true });
    const tree = renderScreen();

    expect(refreshControl(tree).props.refreshing).toBe(false);
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.23: no "re-open" or "password" copy', () => {
  const FORBIDDEN = [/re-?open/i, /password/i];

  it('across the error × errorCode × entries × staleDates matrix, no rendered text says either', () => {
    const offenders: string[] = [];
    for (const myError of [null, 'network', 'auth'] as const) {
      for (const errorCode of [undefined, null, NO_CREDENTIALS, AUTH_LOGIN_LATCHED]) {
        for (const entries of [[], VISIBLE]) {
          for (const staleDates of [[], [CURRENT_MONDAY]]) {
            setupMocks({ entries, myError, errorCode, staleDates, updatedAt: minutesAgo(5) });
            const tree = renderScreen();
            // Rendered strings plus every serialised prop (e.g. accessibility labels).
            const rendered = `${textOf(tree.root)}\n${JSON.stringify(tree.toJSON())}`;
            for (const re of FORBIDDEN) {
              if (re.test(rendered)) {
                offenders.push(
                  `${String(myError)}/${String(errorCode)}/${entries.length} entries/` +
                    `${staleDates.length} stale → ${re}`,
                );
              }
            }
            act(() => { tree.unmount(); });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('approvals.tsx (comments stripped) says neither, and the old auth sentence is gone', () => {
    const source = fs.readFileSync(APPROVALS_FILE, 'utf8');
    const code = stripComments(source);
    for (const re of FORBIDDEN) expect(code).not.toMatch(re);
    expect(source).not.toContain('Authentication error. Please re-open the app.');
  });
});

describe('ApprovalsScreen — durable-data 04 FR4 DD4.24: rows come from src/lib/requestRows', () => {
  it('approvals.tsx defines no buildMyRequestRows or MyRequestRow and imports the builder from @/src/lib/requestRows', () => {
    const code = stripComments(fs.readFileSync(APPROVALS_FILE, 'utf8'));
    expect(code).not.toMatch(/\bfunction\s+buildMyRequestRows\b/);
    expect(code).not.toMatch(/\b(?:const|let|var)\s+buildMyRequestRows\b/);
    expect(code).not.toMatch(/\b(?:type|interface)\s+MyRequestRow\b/);
    expect(code).toMatch(
      /import\s*\{[^}]*\bbuildMyRequestRows\b[^}]*\}\s*from\s*['"]@\/src\/lib\/requestRows['"]/,
    );
  });
});

// ─── durable-data 05 FR4 (DD5.36): the screen mounts the requests backfill ──────
//
// The hook schedules its own delayed, once-per-session run and reads config itself (C10),
// so the screen only has to call it on every render. The "does not import useConfig" case
// above (04-team-view-content FR1) stays green: approvals.tsx gains no config read.

describe('ApprovalsScreen — durable-data 05 FR4 DD5.36: the screen mounts the requests backfill', () => {
  const mockUseRequestsBackfill = useRequestsBackfill as jest.Mock;

  beforeEach(() => {
    mockUseRequestsBackfill.mockClear();
  });

  it('approvals.tsx (comments stripped) imports useRequestsBackfill from @/src/hooks/useRequestsBackfill', () => {
    const code = stripComments(fs.readFileSync(APPROVALS_FILE, 'utf8'));
    expect(code).toMatch(
      /import\s*\{\s*useRequestsBackfill\s*\}\s*from\s*['"]@\/src\/hooks\/useRequestsBackfill['"]/,
    );
  });

  // Placement is not pinned: the render cases below show it runs on every render path.
  it('approvals.tsx (comments stripped) calls useRequestsBackfill() exactly once, with no arguments', () => {
    const code = stripComments(fs.readFileSync(APPROVALS_FILE, 'utf8'));
    expect(code.match(/\buseRequestsBackfill\(/g)).toHaveLength(1);
    expect(code).toMatch(/\buseRequestsBackfill\(\s*\)/);
  });

  it.each<[string, Parameters<typeof setupMocks>[0]]>([
    ['a contributor with requests', { isManager: false, entries: [MOCK_ENTRY_PENDING] }],
    ['a manager with a team queue', { isManager: true, items: [MOCK_APPROVAL_ITEM] }],
    ['config not loaded yet', { configNull: true }],
    ['My Requests still loading', { myLoading: true }],
    ['My Requests failed with nothing to show', { entries: [], myError: 'network', errorCode: null }],
  ])('%s: rendering the screen calls useRequestsBackfill(), with no arguments', (_label, opts) => {
    setupMocks(opts);

    renderScreen();

    expect(mockUseRequestsBackfill).toHaveBeenCalled();
    expect(mockUseRequestsBackfill.mock.calls.every((args) => args.length === 0)).toBe(true);
  });
});
