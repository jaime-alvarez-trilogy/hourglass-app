/**
 * FR1, FR2, FR3: Widget Data Bridge tests
 * Tests for src/widgets/bridge.ts: updateWidgetData, buildTimelineEntries, readWidgetData
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-widgets — iOS-only native module (virtual so it doesn't need to exist on disk)
jest.mock('expo-widgets', () => ({}), { virtual: true });

// Mock Platform so bridge runs Android path (no iOS-only modules needed)
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

// Import the module under test — static import so CJS/Jest works correctly
import {
  updateWidgetData,
  buildTimelineEntries,
  readWidgetData,
  buildDailyEntries,
  formatApprovalItems,
  formatMyRequests,
} from '../../widgets/bridge';

import type { HoursData, DailyEntry } from '../../lib/hours';
import type { AIWeekData } from '../../lib/ai';
import type { CrossoverConfig } from '../../types/config';
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem } from '../../lib/approvals';
import type { ManualRequestEntry } from '../../types/requests';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEADLINE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).getTime(); // 5 days from now

function makeHoursData(overrides: Partial<HoursData> = {}): HoursData {
  return {
    total: 32.5,
    average: 6.5,
    today: 6.2,
    daily: [
      { date: '2026-03-09', hours: 6.1, isToday: false },
      { date: '2026-03-10', hours: 6.2, isToday: true },
    ],
    weeklyEarnings: 1300,
    todayEarnings: 248,
    hoursRemaining: 7.5,
    overtimeHours: 0,
    timeRemaining: DEADLINE - Date.now(),
    deadline: new Date(DEADLINE),
    ...overrides,
  };
}

function makeAIData(overrides: Partial<AIWeekData> = {}): AIWeekData {
  return {
    aiPctLow: 71,
    aiPctHigh: 75,
    brainliftHours: 3.2,
    totalSlots: 200,
    taggedSlots: 180,
    workdaysElapsed: 2,
    dailyBreakdown: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<CrossoverConfig> = {}): CrossoverConfig {
  return {
    userId: '2362707',
    fullName: 'Test User',
    managerId: '2372227',
    primaryTeamId: '4584',
    teams: [],
    hourlyRate: 40,
    weeklyLimit: 40,
    useQA: false,
    isManager: false,
    assignmentId: '79996',
    lastRoleCheck: '2026-03-10T00:00:00.000Z',
    debugMode: false,
    setupComplete: true,
    setupDate: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

// Helper: get the widget_data value written to AsyncStorage
function getWrittenWidgetData(): Record<string, unknown> | null {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  const call = calls.find(([key]: [string]) => key === 'widget_data');
  if (!call) return null;
  return JSON.parse(call[1]);
}

// ─── FR1: updateWidgetData ─────────────────────────────────────────────────────

describe('updateWidgetData (FR1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls AsyncStorage.setItem with widget_data key', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('widget_data', expect.any(String));
  });

  it('formats hours as string with 1 decimal', async () => {
    await updateWidgetData(makeHoursData({ total: 8 }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.hours).toBe('8.0');
    expect(data.hoursDisplay).toBe('8.0h');
  });

  it('formats earnings $1300 as $1,300', async () => {
    await updateWidgetData(makeHoursData({ weeklyEarnings: 1300 }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.earnings).toBe('$1,300');
  });

  it('formats earnings under $1000 without comma', async () => {
    await updateWidgetData(makeHoursData({ weeklyEarnings: 800 }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.earnings).toBe('$800');
  });

  it('sets pendingCount to 0 for contributors (isManager false)', async () => {
    const config = makeConfig({ isManager: false });
    await updateWidgetData(makeHoursData(), makeAIData(), 5, config);
    const data = getWrittenWidgetData()!;
    expect(data.pendingCount).toBe(0);
  });

  it('pendingCount derived from approvalItems.length for managers', async () => {
    const config = makeConfig({ isManager: true });
    // pendingCount param is now ignored; derived from approvalItems.length
    // Pass 3 approval items → pendingCount should be 3
    const approvalItems = [
      { id: 'mt-1', category: 'MANUAL' as const, userId: 1, fullName: 'A', durationMinutes: 60,
        hours: '1.0', description: '', startDateTime: '', type: 'WEB' as const, timecardIds: [1], weekStartDate: '2026-03-16' },
      { id: 'mt-2', category: 'MANUAL' as const, userId: 2, fullName: 'B', durationMinutes: 60,
        hours: '1.0', description: '', startDateTime: '', type: 'WEB' as const, timecardIds: [2], weekStartDate: '2026-03-16' },
      { id: 'mt-3', category: 'MANUAL' as const, userId: 3, fullName: 'C', durationMinutes: 60,
        hours: '1.0', description: '', startDateTime: '', type: 'WEB' as const, timecardIds: [3], weekStartDate: '2026-03-16' },
    ];
    await updateWidgetData(makeHoursData(), makeAIData(), 3, config, approvalItems);
    const data = getWrittenWidgetData()!;
    expect(data.pendingCount).toBe(3);
    expect(data.isManager).toBe(true);
  });

  it('sets cachedAt to current timestamp', async () => {
    const before = Date.now();
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const after = Date.now();
    const data = getWrittenWidgetData()!;
    expect(Number(data.cachedAt)).toBeGreaterThanOrEqual(before);
    expect(Number(data.cachedAt)).toBeLessThanOrEqual(after);
  });

  it('sets urgency to none when >12h from deadline', async () => {
    const hoursData = makeHoursData({
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await updateWidgetData(hoursData, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.urgency).toBe('none');
  });

  it('sets urgency to expired when deadline is in the past', async () => {
    const hoursData = makeHoursData({
      deadline: new Date(Date.now() - 1000),
    });
    await updateWidgetData(hoursData, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.urgency).toBe('expired');
  });

  it('sets aiPct to N/A when aiData is null', async () => {
    await updateWidgetData(makeHoursData(), null, 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.aiPct).toBe('N/A');
  });

  it('sets brainlift to 0.0h when aiData is null', async () => {
    await updateWidgetData(makeHoursData(), null, 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.brainlift).toBe('0.0h');
  });

  it('formats aiPct as range string when aiData provided', async () => {
    const aiData = makeAIData({ aiPctLow: 71, aiPctHigh: 75 });
    await updateWidgetData(makeHoursData(), aiData, 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.aiPct).toMatch(/71%/);
    expect(data.aiPct).toMatch(/75%/);
  });

  it('formats brainlift hours with 1 decimal', async () => {
    const aiData = makeAIData({ brainliftHours: 3.2 });
    await updateWidgetData(makeHoursData(), aiData, 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.brainlift).toBe('3.2h');
  });

  it('shows hoursRemaining as "Xh left" when not in overtime', async () => {
    const hoursData = makeHoursData({ hoursRemaining: 7.5, overtimeHours: 0 });
    await updateWidgetData(hoursData, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.hoursRemaining).toMatch(/7\.5h left/);
  });

  it('shows hoursRemaining as "Xh OT" when in overtime', async () => {
    const hoursData = makeHoursData({ hoursRemaining: 0, overtimeHours: 2.5 });
    await updateWidgetData(hoursData, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.hoursRemaining).toMatch(/2\.5h OT/);
  });

  it('stores earningsRaw as number', async () => {
    await updateWidgetData(makeHoursData({ weeklyEarnings: 1300 }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(typeof data.earningsRaw).toBe('number');
    expect(data.earningsRaw).toBe(1300);
  });

  it('stores deadline as unix timestamp number', async () => {
    const deadline = new Date(DEADLINE);
    await updateWidgetData(makeHoursData({ deadline }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(typeof data.deadline).toBe('number');
    expect(data.deadline).toBe(deadline.getTime());
  });
});

// ─── FR2: buildTimelineEntries ─────────────────────────────────────────────────

describe('buildTimelineEntries (FR2)', () => {
  function makeBaseData() {
    return {
      hours: '32.5',
      hoursDisplay: '32.5h',
      earnings: '$1,300',
      earningsRaw: 1300,
      today: '6.2h',
      hoursRemaining: '7.5h left',
      aiPct: '71%\u201375%',
      brainlift: '3.2h',
      deadline: Date.now() + 6 * 60 * 60 * 1000, // 6h from now
      urgency: 'high' as const,
      pendingCount: 0,
      isManager: false,
      cachedAt: Date.now(),
      useQA: false,
    };
  }

  it('returns exactly 60 entries by default', () => {
    const entries = buildTimelineEntries(makeBaseData());
    expect(entries).toHaveLength(60);
  });

  it('returns exactly count entries when count specified', () => {
    expect(buildTimelineEntries(makeBaseData(), 10)).toHaveLength(10);
    expect(buildTimelineEntries(makeBaseData(), 1)).toHaveLength(1);
  });

  it('first entry date is >= now', () => {
    const before = Date.now();
    const entries = buildTimelineEntries(makeBaseData(), 5);
    expect(entries[0].date.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('each subsequent entry is 15 minutes after previous by default', () => {
    const entries = buildTimelineEntries(makeBaseData(), 5);
    const interval = 15 * 60 * 1000;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].date.getTime() - entries[i - 1].date.getTime()).toBe(interval);
    }
  });

  it('each subsequent entry respects custom intervalMinutes', () => {
    const entries = buildTimelineEntries(makeBaseData(), 4, 30);
    const interval = 30 * 60 * 1000;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].date.getTime() - entries[i - 1].date.getTime()).toBe(interval);
    }
  });

  it('non-time-dependent fields are identical across all entries', () => {
    const entries = buildTimelineEntries(makeBaseData(), 5);
    const first = entries[0].props;
    for (const entry of entries) {
      expect(entry.props.hours).toBe(first.hours);
      expect(entry.props.earnings).toBe(first.earnings);
      expect(entry.props.aiPct).toBe(first.aiPct);
      expect(entry.props.brainlift).toBe(first.brainlift);
      expect(entry.props.earningsRaw).toBe(first.earningsRaw);
      expect(entry.props.isManager).toBe(first.isManager);
    }
  });

  it('urgency field updates as entries advance past deadline', () => {
    // Deadline 1 minute from now — entries at 15min intervals
    const base = { ...makeBaseData(), deadline: Date.now() + 60 * 1000 };
    const entries = buildTimelineEntries(base, 5, 15);
    // Entry 1+ are all 15min past the 1min deadline → 'expired'
    expect(entries[1].props.urgency).toBe('expired');
    expect(entries[4].props.urgency).toBe('expired');
  });

  it('early entries before deadline have non-expired urgency', () => {
    // Deadline 24h from now → entry 0 is well within range
    const base = { ...makeBaseData(), deadline: Date.now() + 24 * 60 * 60 * 1000 };
    const entries = buildTimelineEntries(base, 3, 15);
    expect(entries[0].props.urgency).not.toBe('expired');
  });

  it('each entry has a date property as a Date object', () => {
    const entries = buildTimelineEntries(makeBaseData(), 3);
    for (const entry of entries) {
      expect(entry.date).toBeInstanceOf(Date);
    }
  });
});

// ─── FR3: readWidgetData ──────────────────────────────────────────────────────

describe('readWidgetData (FR3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when key is absent', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    await expect(readWidgetData()).resolves.toBeNull();
  });

  it('reads from AsyncStorage key widget_data', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    await readWidgetData();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('widget_data');
  });

  it('returns parsed WidgetData when JSON is valid', async () => {
    const data = {
      hours: '32.5',
      hoursDisplay: '32.5h',
      earnings: '$1,300',
      earningsRaw: 1300,
      today: '6.2h',
      hoursRemaining: '7.5h left',
      aiPct: '71%\u201375%',
      brainlift: '3.2h',
      deadline: DEADLINE,
      urgency: 'none',
      pendingCount: 0,
      isManager: false,
      cachedAt: Date.now(),
      useQA: false,
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
    const result = await readWidgetData();
    expect(result).not.toBeNull();
    expect(result!.hours).toBe('32.5');
    expect(result!.earnings).toBe('$1,300');
    expect(result!.pendingCount).toBe(0);
  });

  it('returns null for malformed JSON without throwing', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{ bad json }}}');
    await expect(readWidgetData()).resolves.toBeNull();
  });

  it('returns null when AsyncStorage.getItem rejects without throwing', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
    await expect(readWidgetData()).resolves.toBeNull();
  });
});

// ─── FR2: buildDailyEntries ────────────────────────────────────────────────────

describe('buildDailyEntries (FR2)', () => {
  it('empty daily array → 7 entries all with hours: 0, isToday: false', () => {
    const result = buildDailyEntries([]);
    expect(result).toHaveLength(7);
    for (const entry of result) {
      expect(entry.hours).toBe(0);
      expect(entry.isToday).toBe(false);
    }
  });

  it('returns entries with correct day labels Mon[0]–Sun[6]', () => {
    const result = buildDailyEntries([]);
    expect(result[0].day).toBe('Mon');
    expect(result[1].day).toBe('Tue');
    expect(result[2].day).toBe('Wed');
    expect(result[3].day).toBe('Thu');
    expect(result[4].day).toBe('Fri');
    expect(result[5].day).toBe('Sat');
    expect(result[6].day).toBe('Sun');
  });

  it('Mon–Wed filled (2026-03-16 Mon, 2026-03-17 Tue, 2026-03-18 Wed), Thu–Sun → 0', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-16', hours: 7.0, isToday: false },  // Mon
      { date: '2026-03-17', hours: 8.5, isToday: false },  // Tue
      { date: '2026-03-18', hours: 6.0, isToday: true  },  // Wed (today)
    ];
    const result = buildDailyEntries(daily);
    expect(result).toHaveLength(7);
    expect(result[0].hours).toBeCloseTo(7.0);  // Mon
    expect(result[1].hours).toBeCloseTo(8.5);  // Tue
    expect(result[2].hours).toBeCloseTo(6.0);  // Wed
    expect(result[3].hours).toBe(0);           // Thu
    expect(result[4].hours).toBe(0);           // Fri
    expect(result[5].hours).toBe(0);           // Sat
    expect(result[6].hours).toBe(0);           // Sun
  });

  it('isToday propagates to exactly the matching day entry', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-16', hours: 7.0, isToday: false },  // Mon
      { date: '2026-03-17', hours: 8.5, isToday: true  },  // Tue (today)
    ];
    const result = buildDailyEntries(daily);
    expect(result[0].isToday).toBe(false); // Mon
    expect(result[1].isToday).toBe(true);  // Tue
    expect(result[2].isToday).toBe(false); // Wed
  });

  it('all 7 days filled → all hours mapped correctly', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-16', hours: 8.0, isToday: false }, // Mon
      { date: '2026-03-17', hours: 7.5, isToday: false }, // Tue
      { date: '2026-03-18', hours: 7.0, isToday: false }, // Wed
      { date: '2026-03-19', hours: 6.5, isToday: false }, // Thu
      { date: '2026-03-20', hours: 6.0, isToday: true  }, // Fri (today)
      { date: '2026-03-21', hours: 0.0, isToday: false }, // Sat
      { date: '2026-03-22', hours: 0.0, isToday: false }, // Sun
    ];
    const result = buildDailyEntries(daily);
    expect(result).toHaveLength(7);
    expect(result[0].hours).toBeCloseTo(8.0);
    expect(result[1].hours).toBeCloseTo(7.5);
    expect(result[2].hours).toBeCloseTo(7.0);
    expect(result[3].hours).toBeCloseTo(6.5);
    expect(result[4].hours).toBeCloseTo(6.0);
    expect(result[5].hours).toBe(0);
    expect(result[6].hours).toBe(0);
  });

  it('out-of-order input returns Mon[0]–Sun[6] order', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-20', hours: 5.0, isToday: false }, // Fri
      { date: '2026-03-16', hours: 8.0, isToday: false }, // Mon
      { date: '2026-03-18', hours: 7.0, isToday: false }, // Wed
    ];
    const result = buildDailyEntries(daily);
    expect(result[0].day).toBe('Mon');
    expect(result[0].hours).toBeCloseTo(8.0);
    expect(result[2].day).toBe('Wed');
    expect(result[2].hours).toBeCloseTo(7.0);
    expect(result[4].day).toBe('Fri');
    expect(result[4].hours).toBeCloseTo(5.0);
  });

  it('Sunday date (2026-03-22) → Sun entry has isToday: true', () => {
    const daily: DailyEntry[] = [
      { date: '2026-03-22', hours: 3.0, isToday: true }, // Sun
    ];
    const result = buildDailyEntries(daily);
    expect(result[6].day).toBe('Sun');
    expect(result[6].isToday).toBe(true);
    expect(result[6].hours).toBeCloseTo(3.0);
  });
});

// ─── FR2: formatApprovalItems ─────────────────────────────────────────────────

describe('formatApprovalItems (FR2)', () => {
  function makeManualItem(overrides: Partial<ManualApprovalItem> = {}): ManualApprovalItem {
    return {
      id: 'mt-1-2-3',
      category: 'MANUAL',
      userId: 12345,
      fullName: 'John Smith',
      durationMinutes: 90,
      hours: '1.5',
      description: 'Bug fix',
      startDateTime: '2026-03-17T10:00:00Z',
      type: 'WEB',
      timecardIds: [1, 2, 3],
      weekStartDate: '2026-03-16',
      ...overrides,
    };
  }

  function makeOvertimeItem(overrides: Partial<OvertimeApprovalItem> = {}): OvertimeApprovalItem {
    return {
      id: 'ot-99',
      category: 'OVERTIME',
      overtimeId: 99,
      userId: 67890,
      fullName: 'Ana Garcia',
      jobTitle: 'Engineer',
      durationMinutes: 60,
      hours: '1.0',
      cost: 40,
      description: 'OT work',
      startDateTime: '2026-03-17T18:00:00Z',
      weekStartDate: '2026-03-16',
      ...overrides,
    };
  }

  it('empty array → returns []', () => {
    expect(formatApprovalItems([], 3)).toEqual([]);
  });

  it('2 items, maxCount=3 → returns both items', () => {
    const items: ApprovalItem[] = [makeManualItem(), makeOvertimeItem()];
    const result = formatApprovalItems(items, 3);
    expect(result).toHaveLength(2);
  });

  it('5 items, maxCount=3 → returns first 3 items only', () => {
    const items: ApprovalItem[] = Array.from({ length: 5 }, (_, i) =>
      makeManualItem({ id: `mt-${i}`, fullName: `User ${i}` })
    );
    const result = formatApprovalItems(items, 3);
    expect(result).toHaveLength(3);
  });

  it('ManualApprovalItem → category MANUAL, correct hours and id', () => {
    const item = makeManualItem({ id: 'mt-42', hours: '2.5' });
    const result = formatApprovalItems([item], 3);
    expect(result[0].category).toBe('MANUAL');
    expect(result[0].hours).toBe('2.5');
    expect(result[0].id).toBe('mt-42');
  });

  it('OvertimeApprovalItem → category OVERTIME, correct hours', () => {
    const item = makeOvertimeItem({ id: 'ot-55', hours: '1.0' });
    const result = formatApprovalItems([item], 3);
    expect(result[0].category).toBe('OVERTIME');
    expect(result[0].hours).toBe('1.0');
  });

  it('fullName exactly 18 chars → no truncation', () => {
    const item = makeManualItem({ fullName: 'A'.repeat(18) });
    const result = formatApprovalItems([item], 3);
    expect(result[0].name).toBe('A'.repeat(18));
    expect(result[0].name.length).toBe(18);
  });

  it('fullName 19+ chars → truncated to 17 chars + ellipsis (18 chars total)', () => {
    const item = makeManualItem({ fullName: 'A'.repeat(19) });
    const result = formatApprovalItems([item], 3);
    expect(result[0].name.length).toBe(18);
    expect(result[0].name).toBe('A'.repeat(17) + '…');
  });

  it('fullName 30 chars → truncated correctly', () => {
    const item = makeManualItem({ fullName: 'B'.repeat(30) });
    const result = formatApprovalItems([item], 3);
    expect(result[0].name).toBe('B'.repeat(17) + '…');
  });
});

// ─── FR2: formatMyRequests ────────────────────────────────────────────────────

describe('formatMyRequests (FR2)', () => {
  function makeRequest(overrides: Partial<ManualRequestEntry> = {}): ManualRequestEntry {
    return {
      id: '2026-03-18|Fix bug',
      date: '2026-03-18',
      durationMinutes: 90,
      memo: 'Fix bug',
      status: 'PENDING',
      rejectionReason: null,
      ...overrides,
    };
  }

  it('empty array → returns []', () => {
    expect(formatMyRequests([], 3)).toEqual([]);
  });

  it('date "2026-03-18" (Wednesday) → formatted as "Wed Mar 18"', () => {
    const result = formatMyRequests([makeRequest({ date: '2026-03-18' })], 3);
    expect(result[0].date).toBe('Wed Mar 18');
  });

  it('date "2026-03-16" (Monday) → formatted as "Mon Mar 16"', () => {
    const result = formatMyRequests([makeRequest({ date: '2026-03-16' })], 3);
    expect(result[0].date).toBe('Mon Mar 16');
  });

  it('90 durationMinutes → hours "1.5h"', () => {
    const result = formatMyRequests([makeRequest({ durationMinutes: 90 })], 3);
    expect(result[0].hours).toBe('1.5h');
  });

  it('60 durationMinutes → hours "1.0h"', () => {
    const result = formatMyRequests([makeRequest({ durationMinutes: 60 })], 3);
    expect(result[0].hours).toBe('1.0h');
  });

  it('status PENDING passes through unchanged', () => {
    const result = formatMyRequests([makeRequest({ status: 'PENDING' })], 3);
    expect(result[0].status).toBe('PENDING');
  });

  it('status APPROVED is filtered out — resolved items do not show on widget', () => {
    const result = formatMyRequests([makeRequest({ status: 'APPROVED' })], 3);
    expect(result).toHaveLength(0);
  });

  it('status REJECTED passes through unchanged', () => {
    const result = formatMyRequests([makeRequest({ status: 'REJECTED' })], 3);
    expect(result[0].status).toBe('REJECTED');
  });

  it('memo exactly 18 chars → no truncation', () => {
    const result = formatMyRequests([makeRequest({ memo: 'A'.repeat(18) })], 3);
    expect(result[0].memo).toBe('A'.repeat(18));
    expect(result[0].memo.length).toBe(18);
  });

  it('memo 19+ chars → truncated to 17 chars + ellipsis', () => {
    const result = formatMyRequests([makeRequest({ memo: 'B'.repeat(19) })], 3);
    expect(result[0].memo).toBe('B'.repeat(17) + '…');
    expect(result[0].memo.length).toBe(18);
  });

  it('5 entries, maxCount=3 → only first 3 returned', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeRequest({ id: `entry-${i}`, date: '2026-03-18', memo: `Task ${i}` })
    );
    const result = formatMyRequests(entries, 3);
    expect(result).toHaveLength(3);
  });

  it('preserves id from original entry', () => {
    const result = formatMyRequests([makeRequest({ id: 'my-unique-id' })], 3);
    expect(result[0].id).toBe('my-unique-id');
  });
});

// ─── 01-data-extensions: FR1–FR5 new field tests ─────────────────────────────
//
// FR1: WidgetData type fields (compile-time + runtime shape)
// FR2: paceBadge computation
// FR3: weekDelta computation
// FR4: brainliftTarget constant
// FR5: updateWidgetData prevWeekSnapshot param

describe('01-data-extensions: FR1 WidgetData type fields', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('FR1: paceBadge field is present and has a valid union value', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    const valid = ['crushed_it', 'on_track', 'behind', 'critical', 'none'];
    expect(valid).toContain(data.paceBadge);
  });

  it('FR1: weekDeltaHours field is present and is a string', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(typeof data.weekDeltaHours).toBe('string');
  });

  it('FR1: weekDeltaEarnings field is present and is a string', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(typeof data.weekDeltaEarnings).toBe('string');
  });

  it('FR1: brainliftTarget field is present and is a string', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(typeof data.brainliftTarget).toBe('string');
  });
});

describe('01-data-extensions: FR2 paceBadge computation', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // Helper: call updateWidgetData with a specific day-of-week injected via Date mock
  async function getPaceBadgeOnDay(
    dayOfWeek: number, // 0=Sun..6=Sat
    hoursTotal: number,
    overrides?: Partial<Parameters<typeof makeConfig>[0]>
  ): Promise<string> {
    // Mock Date.prototype.getDay to return desired day
    const originalGetDay = Date.prototype.getDay;
    Date.prototype.getDay = function() { return dayOfWeek; };
    try {
      await updateWidgetData(makeHoursData({ total: hoursTotal, overtimeHours: 0 }), makeAIData(), 0, makeConfig(overrides ?? {}));
    } finally {
      Date.prototype.getDay = originalGetDay;
    }
    return getWrittenWidgetData()!.paceBadge as string;
  }

  it('FR2: overtimeHours > 0 → paceBadge === "crushed_it" regardless of day', async () => {
    await updateWidgetData(makeHoursData({ overtimeHours: 2.5, total: 42.5 }), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.paceBadge).toBe('crushed_it');
  });

  it('FR2: hoursData === null → paceBadge === "none"', async () => {
    await updateWidgetData(null, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.paceBadge).toBe('none');
  });

  it('FR2: Monday (day=1) → workdaysElapsed=0, expectedHours=0 → paceBadge === "none"', async () => {
    const badge = await getPaceBadgeOnDay(1, 0);
    expect(badge).toBe('none');
  });

  it('FR2: Wednesday (day=3) → workdaysElapsed=2, expectedHours=16 → 16h → on_track (ratio=1.0)', async () => {
    // day=3 (Wed): workdaysElapsed = 3-1 = 2; expectedHours = 40 * (2/5) = 16
    const badge = await getPaceBadgeOnDay(3, 16);
    expect(badge).toBe('on_track');
  });

  it('FR2: Wednesday, ratio 0.7–0.9 → paceBadge === "behind"', async () => {
    // expectedHours = 16; behind range: 11.2 <= hours < 14.4
    const badge = await getPaceBadgeOnDay(3, 12);
    expect(badge).toBe('behind');
  });

  it('FR2: Wednesday, ratio < 0.7 → paceBadge === "critical"', async () => {
    // expectedHours = 16; critical: hours < 11.2
    const badge = await getPaceBadgeOnDay(3, 8);
    expect(badge).toBe('critical');
  });

  it('FR2: Saturday (day=6) uses workdaysElapsed=5, full-week comparison → on_track', async () => {
    // workdaysElapsed=5; expectedHours=40*(5/5)=40; 36h → ratio=0.9 → on_track
    const badge = await getPaceBadgeOnDay(6, 36);
    expect(badge).toBe('on_track');
  });

  it('FR2: Sunday (day=0) uses workdaysElapsed=5, full-week comparison → critical', async () => {
    // workdaysElapsed=5; expectedHours=40; 20h → ratio=0.5 → critical
    const badge = await getPaceBadgeOnDay(0, 20);
    expect(badge).toBe('critical');
  });

  it('FR2: missing config.weeklyLimit → defaults to 40', async () => {
    const configNoLimit = { ...makeConfig() };
    // @ts-expect-error testing missing weeklyLimit
    delete configNoLimit.weeklyLimit;
    const originalGetDay = Date.prototype.getDay;
    Date.prototype.getDay = () => 3; // Wednesday: expectedHours=16
    try {
      await updateWidgetData(makeHoursData({ total: 16, overtimeHours: 0 }), makeAIData(), 0, configNoLimit);
    } finally {
      Date.prototype.getDay = originalGetDay;
    }
    const data = getWrittenWidgetData()!;
    // 16h / 16 expected = ratio 1.0 → on_track (confirms default 40 was used)
    expect(data.paceBadge).toBe('on_track');
  });
});

describe('01-data-extensions: FR3 weekDelta computation', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('FR3: positive hours delta → weekDeltaHours === "+2.1h"', async () => {
    await updateWidgetData(
      makeHoursData({ total: 34.6 }), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1216 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('+2.1h');
  });

  it('FR3: positive earnings delta → weekDeltaEarnings === "+$84"', async () => {
    await updateWidgetData(
      makeHoursData({ weeklyEarnings: 1384 }), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1300 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaEarnings).toBe('+$84');
  });

  it('FR3: negative hours delta → weekDeltaHours === "-3.4h"', async () => {
    await updateWidgetData(
      makeHoursData({ total: 29.1 }), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1300 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('-3.4h');
  });

  it('FR3: negative earnings delta → weekDeltaEarnings === "-$136"', async () => {
    await updateWidgetData(
      makeHoursData({ weeklyEarnings: 1164 }), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1300 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaEarnings).toBe('-$136');
  });

  it('FR3: zero delta → weekDeltaHours === "+0.0h" and weekDeltaEarnings === "+$0"', async () => {
    await updateWidgetData(
      makeHoursData({ total: 32.5, weeklyEarnings: 1300 }), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1300 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('+0.0h');
    expect(data.weekDeltaEarnings).toBe('+$0');
  });

  it('FR3: prevWeekSnapshot === null → weekDeltaHours and weekDeltaEarnings are ""', async () => {
    await updateWidgetData(
      makeHoursData(), makeAIData(), 0, makeConfig(),
      undefined, undefined,
      null
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('');
    expect(data.weekDeltaEarnings).toBe('');
  });

  it('FR3: prevWeekSnapshot === undefined (omitted) → weekDeltaHours and weekDeltaEarnings are ""', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('');
    expect(data.weekDeltaEarnings).toBe('');
  });

  it('FR3: hoursData === null → weekDeltaHours and weekDeltaEarnings are ""', async () => {
    await updateWidgetData(
      null, makeAIData(), 0, makeConfig(),
      undefined, undefined,
      { hours: 32.5, earnings: 1300 }
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('');
    expect(data.weekDeltaEarnings).toBe('');
  });
});

describe('01-data-extensions: FR4 brainliftTarget constant', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('FR4: brainliftTarget === "5h" with hoursData present', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.brainliftTarget).toBe('5h');
  });

  it('FR4: brainliftTarget === "5h" when hoursData is null', async () => {
    await updateWidgetData(null, makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.brainliftTarget).toBe('5h');
  });

  it('FR4: brainliftTarget === "5h" when aiData is null', async () => {
    await updateWidgetData(makeHoursData(), null, 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.brainliftTarget).toBe('5h');
  });
});

describe('01-data-extensions: FR5 updateWidgetData prevWeekSnapshot param', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('FR5: existing 6-arg callers still work (backward compat)', async () => {
    await expect(
      updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig(), [], [])
    ).resolves.not.toThrow();
    expect(getWrittenWidgetData()).not.toBeNull();
  });

  it('FR5: prevWeekSnapshot provided → delta fields populated correctly', async () => {
    const snap = { hours: 30.0, earnings: 1200 };
    await updateWidgetData(
      makeHoursData({ total: 32.5, weeklyEarnings: 1300 }),
      makeAIData(), 0, makeConfig(),
      undefined, undefined,
      snap
    );
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('+2.5h');
    expect(data.weekDeltaEarnings).toBe('+$100');
  });

  it('FR5: prevWeekSnapshot omitted → delta fields are ""', async () => {
    await updateWidgetData(makeHoursData(), makeAIData(), 0, makeConfig());
    const data = getWrittenWidgetData()!;
    expect(data.weekDeltaHours).toBe('');
    expect(data.weekDeltaEarnings).toBe('');
  });
});

// ─── FR3: Extended buildWidgetData (via updateWidgetData) ──────────────────────
//
// buildWidgetData is internal; we test via updateWidgetData which writes to AsyncStorage.

describe('FR3: buildWidgetData extensions (via updateWidgetData)', () => {
  function makeManagerConfig(): CrossoverConfig {
    return {
      userId: '2362707',
      fullName: 'Manager User',
      managerId: '2372227',
      primaryTeamId: '4584',
      teams: [],
      hourlyRate: 40,
      weeklyLimit: 40,
      useQA: false,
      isManager: true,
      assignmentId: '79996',
      lastRoleCheck: '2026-03-10T00:00:00.000Z',
      debugMode: false,
      setupComplete: true,
      setupDate: '2026-03-01T00:00:00.000Z',
    };
  }

  function makeContributorConfig(): CrossoverConfig {
    return { ...makeManagerConfig(), isManager: false };
  }

  function makeHours(): HoursData {
    return {
      total: 20.3,
      average: 5.0,
      today: 3.2,
      daily: [
        { date: '2026-03-16', hours: 8.0, isToday: false }, // Mon
        { date: '2026-03-17', hours: 7.5, isToday: false }, // Tue
        { date: '2026-03-18', hours: 4.8, isToday: true  }, // Wed
      ],
      weeklyEarnings: 812,
      todayEarnings: 128,
      hoursRemaining: 19.7,
      overtimeHours: 0,
      timeRemaining: 5 * 24 * 60 * 60 * 1000,
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    };
  }

  function makeManualApproval(id: string, fullName: string): ManualApprovalItem {
    return {
      id,
      category: 'MANUAL',
      userId: 100,
      fullName,
      durationMinutes: 60,
      hours: '1.0',
      description: 'Work',
      startDateTime: '2026-03-18T10:00:00Z',
      type: 'WEB',
      timecardIds: [1],
      weekStartDate: '2026-03-16',
    };
  }

  function makeMyRequest(status: 'PENDING' | 'APPROVED' | 'REJECTED'): ManualRequestEntry {
    return {
      id: `req-${status}`,
      date: '2026-03-18',
      durationMinutes: 60,
      memo: 'My work',
      status,
      rejectionReason: null,
    };
  }

  function getWritten(): Record<string, unknown> | null {
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    const call = calls.find(([key]: [string]) => key === 'widget_data');
    if (!call) return null;
    return JSON.parse(call[1]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns daily with 7 entries when hoursData.daily has data', async () => {
    await updateWidgetData(makeHours(), null, 0, makeManagerConfig());
    const data = getWritten()!;
    expect(Array.isArray(data.daily)).toBe(true);
    expect((data.daily as unknown[]).length).toBe(7);
  });

  it('daily entries have day, hours, isToday fields', async () => {
    await updateWidgetData(makeHours(), null, 0, makeManagerConfig());
    const data = getWritten()!;
    const daily = data.daily as Array<{ day: string; hours: number; isToday: boolean }>;
    expect(daily[0]).toHaveProperty('day');
    expect(daily[0]).toHaveProperty('hours');
    expect(daily[0]).toHaveProperty('isToday');
  });

  it('manager: approvalItems capped at 3, myRequests is []', async () => {
    const approvals: ApprovalItem[] = Array.from({ length: 5 }, (_, i) =>
      makeManualApproval(`mt-${i}`, `Person ${i}`)
    );
    await updateWidgetData(makeHours(), null, approvals.length, makeManagerConfig(), approvals, []);
    const data = getWritten()!;
    expect(Array.isArray(data.approvalItems)).toBe(true);
    expect((data.approvalItems as unknown[]).length).toBe(3);
    expect(Array.isArray(data.myRequests)).toBe(true);
    expect((data.myRequests as unknown[]).length).toBe(0);
  });

  it('contributor: myRequests capped at 3, approvalItems is []', async () => {
    const requests: ManualRequestEntry[] = Array.from({ length: 5 }, (_, i) =>
      makeMyRequest(i % 2 === 0 ? 'PENDING' : 'APPROVED')
    );
    await updateWidgetData(makeHours(), null, 0, makeContributorConfig(), [], requests);
    const data = getWritten()!;
    expect(Array.isArray(data.myRequests)).toBe(true);
    expect((data.myRequests as unknown[]).length).toBe(3);
    expect(Array.isArray(data.approvalItems)).toBe(true);
    expect((data.approvalItems as unknown[]).length).toBe(0);
  });

  it('pendingCount derived from approvalItems.length (not passed-in param)', async () => {
    const approvals: ApprovalItem[] = [
      makeManualApproval('mt-1', 'Alice'),
      makeManualApproval('mt-2', 'Bob'),
    ];
    // Pass pendingCount=99 — should be overridden by approvalItems.length=2
    await updateWidgetData(makeHours(), null, 99, makeManagerConfig(), approvals);
    const data = getWritten()!;
    expect(data.pendingCount).toBe(2);
  });

  it('manager with approvals → actionBg === "#1C1400"', async () => {
    const approvals: ApprovalItem[] = [makeManualApproval('mt-1', 'Alice')];
    await updateWidgetData(makeHours(), null, 1, makeManagerConfig(), approvals);
    const data = getWritten()!;
    expect(data.actionBg).toBe('#1C1400');
  });

  it('contributor with REJECTED request → actionBg === "#1C0A0E"', async () => {
    const requests = [makeMyRequest('REJECTED')];
    await updateWidgetData(makeHours(), null, 0, makeContributorConfig(), [], requests);
    const data = getWritten()!;
    expect(data.actionBg).toBe('#1C0A0E');
  });

  it('contributor with PENDING request (no rejected) → actionBg === "#120E1A"', async () => {
    const requests = [makeMyRequest('PENDING')];
    await updateWidgetData(makeHours(), null, 0, makeContributorConfig(), [], requests);
    const data = getWritten()!;
    expect(data.actionBg).toBe('#120E1A');
  });

  it('no pending items → actionBg === ""', async () => {
    await updateWidgetData(makeHours(), null, 0, makeManagerConfig(), []);
    const data = getWritten()!;
    expect(data.actionBg).toBe('');
  });

  it('approvalItems param omitted → approvalItems: [], pendingCount: 0', async () => {
    await updateWidgetData(makeHours(), null, 0, makeManagerConfig());
    const data = getWritten()!;
    expect(data.approvalItems).toEqual([]);
    expect(data.pendingCount).toBe(0);
  });

  it('myRequests param omitted → myRequests: []', async () => {
    await updateWidgetData(makeHours(), null, 0, makeContributorConfig());
    const data = getWritten()!;
    expect(data.myRequests).toEqual([]);
  });
});
