// Tests: manualOwnership.ts — 1.2 manager auto-approve, the work-diary proof of who owns a
// pending MANUAL request: manualItemUtcDates (no offset = UTC, 'Z', explicit offsets,
// midnight crossing, invalid input), adjacentUtcDates, resolveManualOwners (proof yes / no /
// partial ids, the day either side read before a "no", empty timecardIds, fetch errors →
// null and never cached, the cache, at most one fetch per (assignment, date) per call,
// stopping at the first proof, two candidates, two proven owners), cachedManualOwner (with
// reads waiting out a failure), and the name helpers (ordering only, never proof).
//
// The live case (QA, 2026-10-27): "Test CC" on assignment 80232, pending userId 36412 (an
// id nothing else exposes), startDateTime "2026-10-27T04:30:00" with no offset, timecardIds
// 280021041-280021043, which are that assignment's manual slots on the UTC date 2026-10-27.
// The report is on IST (the entry was 10:00+05:30), so that probe cannot tell a UTC diary
// day from the report's own: the day either side is read before an assignment is "not
// theirs".

import {
  MAX_ITEM_UTC_DATES,
  adjacentUtcDates,
  cachedManualOwner,
  manualItemUtcDates,
  nameMatchedFirst,
  nameMatchedRows,
  normalisedName,
  ownershipKey,
  resolveManualOwners,
} from '../manualOwnership';
import type { ManualSlotIds, OwnershipCache } from '../manualOwnership';
import type { ManualApprovalItem } from '../approvals';
import type { TeamMember } from '../../types/api';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function member(overrides: Partial<TeamMember> = {}): TeamMember {
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

const TEST_CC = member({ assignmentId: '80232', candidateId: '2374577', userId: '1194942', name: 'Test CC' });
const ANA = member();
const BEN = member({ assignmentId: '80002', candidateId: '3000002', userId: '1190002', name: 'Ben Okafor' });

function manual(overrides: Partial<ManualApprovalItem> = {}): ManualApprovalItem {
  return {
    id: 'mt-280021041-280021042-280021043',
    category: 'MANUAL',
    userId: 36412, // the legacy id: matches nobody
    fullName: 'Test CC',
    durationMinutes: 30,
    hours: '0.5',
    description: 'QA probe',
    startDateTime: '2026-10-27T04:30:00',
    type: 'WEB',
    timecardIds: [280021041, 280021042, 280021043],
    weekStartDate: '2026-10-26',
    ...overrides,
  };
}

const LIVE = manual();

/** A diary: assignmentId → UTC date → manual slot ids. Records every call. */
function diary(slots: Record<string, Record<string, number[]>>) {
  const calls: string[] = [];
  const fn = jest.fn<ReturnType<ManualSlotIds>, Parameters<ManualSlotIds>>(async (assignmentId, date) => {
    calls.push(`${assignmentId}|${date}`);
    return new Set(slots[assignmentId]?.[date] ?? []);
  });
  return { fn, calls };
}

const only = (candidates: TeamMember[]) => () => candidates;

// ─── manualItemUtcDates ──────────────────────────────────────────────────────

describe('manualItemUtcDates', () => {
  const dates = (startDateTime: string, durationMinutes = 30) =>
    manualItemUtcDates({ startDateTime, durationMinutes });

  it('reads a start with no offset as UTC (the pending-manual response\'s format)', () => {
    expect(dates('2026-10-27T04:30:00')).toEqual(['2026-10-27']);
    // 23:30 is the next day east of UTC and still the 27th west of it: UTC either way
    expect(dates('2026-10-27T23:30:00')).toEqual(['2026-10-27']);
    expect(dates('2026-10-27T00:10:00')).toEqual(['2026-10-27']);
  });

  it('accepts Z, fractional seconds and a start without seconds', () => {
    expect(dates('2026-10-27T04:30:00Z')).toEqual(['2026-10-27']);
    expect(dates('2026-10-27T04:30:00.000Z')).toEqual(['2026-10-27']);
    expect(dates('2026-10-27T04:30')).toEqual(['2026-10-27']);
  });

  it('honours an explicit offset', () => {
    // 02:00 in India is 20:30 UTC the day before
    expect(dates('2026-10-27T02:00:00+05:30')).toEqual(['2026-10-26']);
    expect(dates('2026-10-27T02:00:00+0530')).toEqual(['2026-10-26']);
    // 20:00 in Vancouver (PDT) is 03:00 UTC the day after
    expect(dates('2026-10-27T20:00:00-07:00')).toEqual(['2026-10-28']);
    expect(dates('2026-10-27T10:00:00+00:00')).toEqual(['2026-10-27']);
  });

  it('spans two dates when the request crosses UTC midnight', () => {
    expect(dates('2026-10-27T23:50:00', 20)).toEqual(['2026-10-27', '2026-10-28']);
    expect(dates('2026-12-31T23:30:00Z', 60)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('[start, end): a request ending exactly at midnight stays on its date', () => {
    expect(dates('2026-10-27T23:30:00', 30)).toEqual(['2026-10-27']);
    expect(dates('2026-10-27T23:30:00', 31)).toEqual(['2026-10-27', '2026-10-28']);
  });

  it('a zero duration is the start date', () => {
    expect(dates('2026-10-27T04:30:00', 0)).toEqual(['2026-10-27']);
  });

  it('invalid input gives []', () => {
    for (const bad of ['', 'not a date', '2026-10-27', '2026-02-30T10:00:00', '2026-13-01T10:00:00', '2026-10-27T25:00:00', '2026-10-27T10:00:00+25:00', '27/10/2026 04:30']) {
      expect(dates(bad)).toEqual([]);
    }
    expect(manualItemUtcDates({ startDateTime: undefined as unknown as string, durationMinutes: 30 })).toEqual([]);
    expect(dates('2026-10-27T04:30:00', Number.NaN)).toEqual([]);
    expect(dates('2026-10-27T04:30:00', -10)).toEqual([]);
    expect(manualItemUtcDates({ startDateTime: '2026-10-27T04:30:00', durationMinutes: '30' as unknown as number })).toEqual([]);
  });

  it(`a request over ${MAX_ITEM_UTC_DATES} UTC dates gives [] (never proven, never fetched)`, () => {
    expect(dates('2026-10-27T23:00:00', 26 * 60)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
    expect(dates('2026-10-27T23:00:00', 50 * 60)).toEqual([]);
  });
});

// ─── adjacentUtcDates ────────────────────────────────────────────────────────

describe('adjacentUtcDates', () => {
  it('the day before the first date and the day after the last', () => {
    expect(adjacentUtcDates(['2026-10-27'])).toEqual(['2026-10-26', '2026-10-28']);
    expect(adjacentUtcDates(['2026-10-27', '2026-10-28'])).toEqual(['2026-10-26', '2026-10-29']);
  });

  it('across month, year and leap-day boundaries', () => {
    expect(adjacentUtcDates(['2026-11-01'])).toEqual(['2026-10-31', '2026-11-02']);
    expect(adjacentUtcDates(['2026-12-31', '2027-01-01'])).toEqual(['2026-12-30', '2027-01-02']);
    expect(adjacentUtcDates(['2028-02-28'])).toEqual(['2028-02-27', '2028-02-29']);
    expect(adjacentUtcDates(['2026-03-01'])).toEqual(['2026-02-28', '2026-03-02']);
  });

  it('[] for []', () => {
    expect(adjacentUtcDates([])).toEqual([]);
  });
});

// ─── resolveManualOwners ─────────────────────────────────────────────────────

describe('resolveManualOwners', () => {
  it('the live case: every timecardId among the assignment\'s manual slots on the UTC date proves the owner', async () => {
    const { fn, calls } = diary({ '80232': { '2026-10-27': [280021040, 280021041, 280021042, 280021043] } });
    const owners = await resolveManualOwners([LIVE], only([TEST_CC]), fn);
    expect(owners.get(LIVE.id)).toBe(TEST_CC);
    expect(calls).toEqual(['80232|2026-10-27']);
  });

  it('no proof: the diary holds none of the ids → null', async () => {
    const { fn } = diary({ '80232': { '2026-10-27': [999] } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn)).get(LIVE.id)).toBeNull();
  });

  it('not on its UTC date: the day either side is read before "not theirs" is cached', async () => {
    const cache: OwnershipCache = new Map();
    const { fn, calls } = diary({ '80232': { '2026-10-27': [999] } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn, cache)).get(LIVE.id)).toBeNull();
    // Its UTC date first, then the day before and after
    expect(calls).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(cache.get(ownershipKey(LIVE.id, '80232'))).toBe(false);
  });

  it('a diary day west of UTC: the ids on the day before prove it', async () => {
    // 04:30Z on the 27th is the evening of the 26th in the Americas
    const cache: OwnershipCache = new Map();
    const { fn, calls } = diary({ '80232': { '2026-10-26': LIVE.timecardIds } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn, cache)).get(LIVE.id)).toBe(TEST_CC);
    expect(calls).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
    expect(cache.get(ownershipKey(LIVE.id, '80232'))).toBe(true);
  });

  it('a diary day east of UTC: the ids on the day after prove it', async () => {
    // 02:00 in India on the 27th is 20:30 UTC on the 26th
    const item = manual({ startDateTime: '2026-10-26T20:30:00' });
    const { fn } = diary({ '80232': { '2026-10-27': item.timecardIds } });
    expect((await resolveManualOwners([item], only([TEST_CC]), fn)).get(item.id)).toBe(TEST_CC);
  });

  it('ids split between its UTC date and the day after are proven together', async () => {
    const { fn } = diary({ '80232': { '2026-10-27': [280021041], '2026-10-28': [280021042, 280021043] } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn)).get(LIVE.id)).toBe(TEST_CC);
  });

  it('a day either side failing: unknown (null), never cached as "not theirs"', async () => {
    const cache: OwnershipCache = new Map();
    const dayBeforeDown: ManualSlotIds = async (_a, date) => {
      if (date === '2026-10-26') throw new Error('offline');
      return new Set();
    };
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), dayBeforeDown, cache)).get(LIVE.id)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('partial ids are no proof → null', async () => {
    const { fn } = diary({ '80232': { '2026-10-27': [280021041, 280021042] } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn)).get(LIVE.id)).toBeNull();
  });

  it('the ids of a request crossing UTC midnight are proven over both dates', async () => {
    const item = manual({ startDateTime: '2026-10-27T23:50:00', durationMinutes: 20, timecardIds: [1, 2] });
    const { fn, calls } = diary({ '80232': { '2026-10-27': [1], '2026-10-28': [2] } });
    expect((await resolveManualOwners([item], only([TEST_CC]), fn)).get(item.id)).toBe(TEST_CC);
    expect(calls.sort()).toEqual(['80232|2026-10-27', '80232|2026-10-28']);
  });

  it('empty timecardIds → null without a fetch', async () => {
    const item = manual({ id: 'mt-', timecardIds: [] });
    const { fn } = diary({ '80232': { '2026-10-27': [1] } });
    expect((await resolveManualOwners([item], only([TEST_CC]), fn)).get(item.id)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('an unparseable start → null without a fetch', async () => {
    const item = manual({ startDateTime: 'garbage' });
    const { fn } = diary({});
    expect((await resolveManualOwners([item], only([TEST_CC]), fn)).get(item.id)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('no candidates → null without a fetch', async () => {
    const { fn } = diary({});
    expect((await resolveManualOwners([LIVE], only([]), fn)).get(LIVE.id)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('a fetch error with no candidate proven → null, never cached: the next call fetches again', async () => {
    const cache: OwnershipCache = new Map();
    const failing = jest.fn<ReturnType<ManualSlotIds>, Parameters<ManualSlotIds>>().mockRejectedValue(new Error('offline'));
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), failing, cache)).get(LIVE.id)).toBeNull();
    expect(cache.size).toBe(0);

    const { fn } = diary({ '80232': { '2026-10-27': LIVE.timecardIds } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn, cache)).get(LIVE.id)).toBe(TEST_CC);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.get(ownershipKey(LIVE.id, '80232'))).toBe(true);
  });

  it('a synchronous throw is a fetch error like any other', async () => {
    const throwing: ManualSlotIds = () => {
      throw new Error('boom');
    };
    const cache: OwnershipCache = new Map();
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), throwing, cache)).get(LIVE.id)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('one date failing: unknown unless the other date already holds every id', async () => {
    const item = manual({ startDateTime: '2026-10-27T23:50:00', durationMinutes: 20, timecardIds: [1, 2] });
    const halfDown = (found: number[]): ManualSlotIds => async (_a, date) => {
      if (date === '2026-10-28') throw new Error('offline');
      return new Set(found);
    };
    const cache: OwnershipCache = new Map();
    expect((await resolveManualOwners([item], only([TEST_CC]), halfDown([1]), cache)).get(item.id)).toBeNull();
    expect(cache.size).toBe(0); // not cached: unknown
    expect((await resolveManualOwners([item], only([TEST_CC]), halfDown([1, 2]), cache)).get(item.id)).toBe(TEST_CC);
  });

  it('caches proven answers per (item, assignment): a cache hit makes no fetch', async () => {
    const cache: OwnershipCache = new Map();
    const { fn } = diary({ '80232': { '2026-10-27': LIVE.timecardIds } });
    await resolveManualOwners([LIVE], only([ANA, TEST_CC]), fn, cache);
    expect(cache.get(ownershipKey(LIVE.id, '80001'))).toBe(false); // Ana: proven not hers
    expect(cache.get(ownershipKey(LIVE.id, '80232'))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(4); // Ana's 3 days, Test CC's UTC date

    expect((await resolveManualOwners([LIVE], only([ANA, TEST_CC]), fn, cache)).get(LIVE.id)).toBe(TEST_CC);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('a cached "not theirs" is never fetched again', async () => {
    const cache: OwnershipCache = new Map([[ownershipKey(LIVE.id, '80232'), false]]);
    const { fn } = diary({ '80232': { '2026-10-27': LIVE.timecardIds } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC]), fn, cache)).get(LIVE.id)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('stops checking candidates once one is proven', async () => {
    const { fn, calls } = diary({ '80232': { '2026-10-27': LIVE.timecardIds } });
    expect((await resolveManualOwners([LIVE], only([TEST_CC, ANA, BEN]), fn)).get(LIVE.id)).toBe(TEST_CC);
    expect(calls).toEqual(['80232|2026-10-27']);
  });

  it('two candidates: tried in order, the one whose diary proves it owns it', async () => {
    const { fn, calls } = diary({ '80232': { '2026-10-27': LIVE.timecardIds } });
    expect((await resolveManualOwners([LIVE], only([ANA, TEST_CC]), fn)).get(LIVE.id)).toBe(TEST_CC);
    expect(calls).toEqual(['80001|2026-10-27', '80001|2026-10-26', '80001|2026-10-28', '80232|2026-10-27']);
  });

  it('a failed candidate does not block a later proof', async () => {
    const fn: ManualSlotIds = async (assignmentId) => {
      if (assignmentId === '80001') throw new Error('offline');
      return new Set(LIVE.timecardIds);
    };
    const cache: OwnershipCache = new Map();
    expect((await resolveManualOwners([LIVE], only([ANA, TEST_CC]), fn, cache)).get(LIVE.id)).toBe(TEST_CC);
    expect(cache.has(ownershipKey(LIVE.id, '80001'))).toBe(false);
  });

  it('two proven owners (answers cached by earlier calls) → null', async () => {
    const cache: OwnershipCache = new Map([
      [ownershipKey(LIVE.id, '80001'), true],
      [ownershipKey(LIVE.id, '80232'), true],
    ]);
    const { fn } = diary({});
    expect((await resolveManualOwners([LIVE], only([ANA, TEST_CC]), fn, cache)).get(LIVE.id)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('fetches each (assignment, date) at most once per call, across items and repeated candidates', async () => {
    const a = manual({ id: 'mt-1', timecardIds: [1], fullName: 'Someone' });
    const b = manual({ id: 'mt-2', timecardIds: [2], fullName: 'Someone' });
    const c = manual({ id: 'mt-3', timecardIds: [3], fullName: 'Someone' });
    const { fn, calls } = diary({ '80232': { '2026-10-27': [1, 2] } });
    const owners = await resolveManualOwners([a, b, c], only([TEST_CC, { ...TEST_CC }]), fn);
    expect([...owners]).toEqual([
      ['mt-1', TEST_CC],
      ['mt-2', TEST_CC],
      ['mt-3', null],
    ]);
    // mt-3 adds the day either side, once
    expect(calls).toEqual(['80232|2026-10-27', '80232|2026-10-26', '80232|2026-10-28']);
  });

  it('asks candidatesFor per item', async () => {
    const a = manual({ id: 'mt-1', timecardIds: [1] });
    const b = manual({ id: 'mt-2', timecardIds: [2] });
    const { fn } = diary({ '80001': { '2026-10-27': [1] }, '80002': { '2026-10-27': [2] } });
    const owners = await resolveManualOwners([a, b], (item) => (item.id === 'mt-1' ? [ANA] : [BEN]), fn);
    expect(owners.get('mt-1')).toBe(ANA);
    expect(owners.get('mt-2')).toBe(BEN);
  });

  it('never reads item.userId or the name: a name match without the diary proves nothing', async () => {
    const { fn } = diary({});
    const named = manual({ fullName: 'Ana Ruiz', userId: 1190001 }); // Ana's name AND Ana's userId
    expect((await resolveManualOwners([named], only([ANA]), fn)).get(named.id)).toBeNull();
  });
});

// ─── cachedManualOwner ───────────────────────────────────────────────────────

describe('cachedManualOwner', () => {
  it('undefined while a candidate is unchecked', () => {
    expect(cachedManualOwner(LIVE, [ANA, TEST_CC], new Map())).toBeUndefined();
    expect(cachedManualOwner(LIVE, [ANA, TEST_CC], new Map([[ownershipKey(LIVE.id, '80001'), false]]))).toBeUndefined();
  });

  it('the proven owner', () => {
    expect(cachedManualOwner(LIVE, [ANA, TEST_CC], new Map([[ownershipKey(LIVE.id, '80232'), true]]))).toBe(TEST_CC);
  });

  it('null when every candidate is disproven, there are none, or two are proven', () => {
    const disproven = new Map([
      [ownershipKey(LIVE.id, '80001'), false],
      [ownershipKey(LIVE.id, '80232'), false],
    ]);
    expect(cachedManualOwner(LIVE, [ANA, TEST_CC], disproven)).toBeNull();
    expect(cachedManualOwner(LIVE, [], new Map())).toBeNull();
    const both = new Map([
      [ownershipKey(LIVE.id, '80001'), true],
      [ownershipKey(LIVE.id, '80232'), true],
    ]);
    expect(cachedManualOwner(LIVE, [ANA, TEST_CC], both)).toBeNull();
  });

  it('null for an item that can never be proven (no timecardIds, no dates)', () => {
    expect(cachedManualOwner(manual({ timecardIds: [] }), [TEST_CC], new Map())).toBeNull();
    expect(cachedManualOwner(manual({ startDateTime: 'x' }), [TEST_CC], new Map())).toBeNull();
  });

  it('a candidate with a read that may not be made now (a failure waiting out its retry) is not unchecked', () => {
    const dayAfterWaiting = (assignmentId: string, date: string) => !(assignmentId === '80232' && date === '2026-10-28');
    expect(cachedManualOwner(LIVE, [TEST_CC], new Map(), dayAfterWaiting)).toBeNull();
    // Another candidate that can be read keeps it unchecked
    expect(cachedManualOwner(LIVE, [TEST_CC, ANA], new Map(), dayAfterWaiting)).toBeUndefined();
    // A proven answer stands whatever may be read
    const proven = new Map([[ownershipKey(LIVE.id, '80232'), true]]);
    expect(cachedManualOwner(LIVE, [TEST_CC], proven, () => false)).toBe(TEST_CC);
  });
});

// ─── Names (ordering only) ───────────────────────────────────────────────────

describe('name helpers', () => {
  it('normalisedName trims, collapses spaces and lowercases', () => {
    expect(normalisedName('  Test   CC ')).toBe('test cc');
    expect(normalisedName(undefined)).toBe('');
  });

  it('nameMatchedRows: the rows whose printableName matches fullName; none for a blank name', () => {
    const ccSecond = { ...TEST_CC, assignmentId: '80999' };
    expect(nameMatchedRows(manual({ fullName: 'test  cc' }), [ANA, TEST_CC, ccSecond])).toEqual([TEST_CC, ccSecond]);
    expect(nameMatchedRows(manual({ fullName: '  ' }), [ANA, member({ name: ' ' })])).toEqual([]);
  });

  it('nameMatchedFirst moves the name-matched rows first and keeps every row', () => {
    expect(nameMatchedFirst(LIVE, [ANA, BEN, TEST_CC])).toEqual([TEST_CC, ANA, BEN]);
    expect(nameMatchedFirst(manual({ fullName: 'Nobody' }), [ANA, BEN])).toEqual([ANA, BEN]);
  });
});
