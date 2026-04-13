// FR1 (01-manager-history): buildTeamQueueRows — unit tests
//
// Tests the helper that inserts week headers ("This Week" / "Last Week" / "2 Weeks Ago")
// and urgency flags into the flat FlatList row array for the approvals screen.
//
// Strategy: import the function from approvals.tsx by relying on the named export.
// The helper is a pure function (no React, no hooks), so we test it directly.

import { buildTeamQueueRows } from '../app/(tabs)/approvals';
import type { ManualApprovalItem } from '../src/lib/approvals';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeManualItem(overrides: Partial<ManualApprovalItem> = {}): ManualApprovalItem {
  return {
    id: `mt-${Math.random()}`,
    category: 'MANUAL',
    userId: 100,
    fullName: 'Test User',
    durationMinutes: 60,
    hours: '1.0',
    description: 'Work',
    startDateTime: '2026-04-07T09:00:00Z',
    type: 'WEB',
    timecardIds: [1],
    weekStartDate: '2026-04-07',
    ...overrides,
  };
}

// Fixed week start dates for tests
const CURRENT = '2026-04-13';
const PREV1   = '2026-04-06';
const PREV2   = '2026-03-30';

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('buildTeamQueueRows — no items', () => {
  it('BTQ_empty_items_returns_empty_array', () => {
    const rows = buildTeamQueueRows([], CURRENT, PREV1, PREV2, false);
    expect(rows).toEqual([]);
  });
});

describe('buildTeamQueueRows — single-week grouping', () => {
  it('BTQ_items_only_in_current_week_produces_one_header_and_items', () => {
    const item = makeManualItem({ weekStartDate: CURRENT });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, false);

    expect(rows[0]).toMatchObject({ type: 'header', label: 'This Week' });
    expect(rows[1]).toMatchObject({ type: 'item', item });
    expect(rows).toHaveLength(2);
  });

  it('BTQ_items_only_in_prev1_produces_last_week_header', () => {
    const item = makeManualItem({ weekStartDate: PREV1 });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, false);

    expect(rows[0]).toMatchObject({ type: 'header', label: 'Last Week' });
    expect(rows[1]).toMatchObject({ type: 'item', item });
    expect(rows).toHaveLength(2);
  });

  it('BTQ_items_only_in_prev2_produces_2_weeks_ago_header', () => {
    const item = makeManualItem({ weekStartDate: PREV2 });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, false);

    expect(rows[0]).toMatchObject({ type: 'header', label: '2 Weeks Ago' });
    expect(rows[1]).toMatchObject({ type: 'item', item });
    expect(rows).toHaveLength(2);
  });
});

describe('buildTeamQueueRows — multi-week grouping', () => {
  it('BTQ_items_from_all_3_weeks_produce_3_headers_in_order', () => {
    const cur  = makeManualItem({ weekStartDate: CURRENT, startDateTime: '2026-04-14T10:00:00Z' });
    const p1   = makeManualItem({ weekStartDate: PREV1,   startDateTime: '2026-04-07T10:00:00Z' });
    const p2   = makeManualItem({ weekStartDate: PREV2,   startDateTime: '2026-03-31T10:00:00Z' });
    // Items arrive sorted descending (most recent first)
    const rows = buildTeamQueueRows([cur, p1, p2], CURRENT, PREV1, PREV2, false);

    const headers = rows.filter((r) => r.type === 'header') as { type: 'header'; label: string }[];
    expect(headers).toHaveLength(3);
    expect(headers[0].label).toBe('This Week');
    expect(headers[1].label).toBe('Last Week');
    expect(headers[2].label).toBe('2 Weeks Ago');
  });

  it('BTQ_items_from_2_of_3_weeks_produce_only_2_headers', () => {
    const cur = makeManualItem({ weekStartDate: CURRENT, startDateTime: '2026-04-14T10:00:00Z' });
    const p2  = makeManualItem({ weekStartDate: PREV2,   startDateTime: '2026-03-31T10:00:00Z' });
    const rows = buildTeamQueueRows([cur, p2], CURRENT, PREV1, PREV2, false);

    const headers = rows.filter((r) => r.type === 'header') as { type: 'header'; label: string }[];
    expect(headers).toHaveLength(2);
    expect(headers.map((h) => h.label)).toEqual(['This Week', '2 Weeks Ago']);
  });

  it('BTQ_item_rows_contain_correct_items_in_correct_week_group', () => {
    const cur = makeManualItem({ weekStartDate: CURRENT, fullName: 'Alice', startDateTime: '2026-04-14T10:00:00Z' });
    const p1  = makeManualItem({ weekStartDate: PREV1,   fullName: 'Bob',   startDateTime: '2026-04-07T10:00:00Z' });
    const rows = buildTeamQueueRows([cur, p1], CURRENT, PREV1, PREV2, false);

    // Row 0: "This Week" header
    // Row 1: Alice item
    // Row 2: "Last Week" header
    // Row 3: Bob item
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ type: 'header', label: 'This Week' });
    expect(rows[1]).toMatchObject({ type: 'item' });
    expect((rows[1] as any).item.fullName).toBe('Alice');
    expect(rows[2]).toMatchObject({ type: 'header', label: 'Last Week' });
    expect(rows[3]).toMatchObject({ type: 'item' });
    expect((rows[3] as any).item.fullName).toBe('Bob');
  });
});

describe('buildTeamQueueRows — urgency flag', () => {
  it('BTQ_showUrgency_true_for_prevMonday2_item_when_isUrgencyWindow_true', () => {
    const item = makeManualItem({ weekStartDate: PREV2 });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, /* isUrgencyWindow */ true);

    const itemRow = rows.find((r) => r.type === 'item') as { type: 'item'; item: ManualApprovalItem; showUrgency: boolean };
    expect(itemRow.showUrgency).toBe(true);
  });

  it('BTQ_showUrgency_false_for_prevMonday2_item_when_isUrgencyWindow_false', () => {
    const item = makeManualItem({ weekStartDate: PREV2 });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, /* isUrgencyWindow */ false);

    const itemRow = rows.find((r) => r.type === 'item') as { type: 'item'; item: ManualApprovalItem; showUrgency: boolean };
    expect(itemRow.showUrgency).toBe(false);
  });

  it('BTQ_showUrgency_false_for_current_week_item_even_when_isUrgencyWindow_true', () => {
    const item = makeManualItem({ weekStartDate: CURRENT });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, true);

    const itemRow = rows.find((r) => r.type === 'item') as { type: 'item'; item: ManualApprovalItem; showUrgency: boolean };
    expect(itemRow.showUrgency).toBe(false);
  });

  it('BTQ_showUrgency_false_for_prevMonday1_item_even_when_isUrgencyWindow_true', () => {
    const item = makeManualItem({ weekStartDate: PREV1 });
    const rows = buildTeamQueueRows([item], CURRENT, PREV1, PREV2, true);

    const itemRow = rows.find((r) => r.type === 'item') as { type: 'item'; item: ManualApprovalItem; showUrgency: boolean };
    expect(itemRow.showUrgency).toBe(false);
  });

  it('BTQ_showUrgency_false_for_all_items_when_isUrgencyWindow_false', () => {
    const cur = makeManualItem({ weekStartDate: CURRENT });
    const p1  = makeManualItem({ weekStartDate: PREV1 });
    const p2  = makeManualItem({ weekStartDate: PREV2 });
    const rows = buildTeamQueueRows([cur, p1, p2], CURRENT, PREV1, PREV2, false);

    const itemRows = rows.filter((r) => r.type === 'item') as { type: 'item'; showUrgency: boolean }[];
    expect(itemRows.every((r) => r.showUrgency === false)).toBe(true);
  });
});
