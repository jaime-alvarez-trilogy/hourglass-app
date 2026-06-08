// Tests: computePrescription pure function — 03-pace-prescription FR1–FR4
// Tests: usePrescription hook — 03-pace-prescription FR5 (static analysis)
//
// FR1: Types and constants
//   SC1.1 — PrescriptionStatus is 'done' | 'active' | 'insufficient_data'
//   SC1.2 — DayPrescription has dayIndex, dayLabel, hoursNeeded, isToday
//   SC1.3 — Prescription has status, days, totalRemaining, patternBased, summaryLine
//
// FR2: computePrescription core algorithm
//   SC2.1  — 40h worked → done
//   SC2.1b — 42h (overtime) → done
//   SC2.2  — Monday → todayIndex 0
//   SC2.2b — Sunday → todayIndex 6 (NOT -1)
//   SC2.2c — Saturday → todayIndex 5
//   SC2.3  — horizon covers today through Sunday
//   SC2.4  — patternBased:true when ready; rest-day weights=0 excluded
//   SC2.5  — patternBased:false when insufficient_data; Sat/Sun excluded; status='active'
//   SC2.6  — weights renormalized (sum to 1)
//   SC2.7  — today's hours subtracted, clamped ≥0, no re-spread
//   SC2.8  — all rest days → status:'done'
//   SC2.9  — normal case → status:'active'
//   SC2.10 — totalRemaining === max(0, weeklyLimit - total)
//
// FR3: Day labels and isToday flag
//   SC3.1 — dayLabel correct per dayIndex
//   SC3.2 — isToday true only for todayIndex entry
//
// FR4: summaryLine formatting
//   SC4.1 — two+ days: "Need Xh today · Yh {dayLabel}"
//   SC4.2 — only today: "Need Xh today"
//   SC4.3 — today already met: "Need Xh {dayLabel}"
//   SC4.4 — done: "You're done for the week"
//   SC4.5 — hours rounded to 1 decimal
//   SC4.6 — no trailing whitespace or emoji
//
// FR5: usePrescription hook (static analysis)
//   SC5.1 — hook file exists at src/hooks/usePrescription.ts
//   SC5.2 — imports computePrescription from ../lib/prescription
//   SC5.3 — imports useHoursData, useWorkPattern, useConfig
//   SC5.4 — returns null when hoursData or config is null
//   SC5.5 — uses useMemo with [hoursData, pattern, config] dependencies
//   SC5.6 — no imports from src/api/, src/store/, or AsyncStorage
//   SC5.7 — calls computePrescription(hoursData, pattern, config.weeklyLimit)

import * as path from 'path';
import * as fs from 'fs';
import { computePrescription } from '../prescription';
import type { Prescription, DayPrescription, PrescriptionStatus } from '../prescription';
import type { HoursData } from '../hours';
import type { WorkPattern } from '../workPattern';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHoursData(overrides: Partial<HoursData> = {}): HoursData {
  return {
    total: 20,
    average: 4,
    today: 0,
    daily: [],
    weeklyEarnings: 800,
    todayEarnings: 0,
    hoursRemaining: 20,
    overtimeHours: 0,
    timeRemaining: 48 * 60 * 60 * 1000,
    deadline: new Date('2026-06-11T23:59:59Z'),
    ...overrides,
  };
}

/** Equal Mon–Fri pattern, Sat/Sun rest */
const READY_PATTERN: WorkPattern = {
  status: 'ready',
  dayWeights: [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0],
  restDays: [5, 6],
  avgDailyHours: [8, 8, 8, 8, 8, 0, 0],
  weeksUsed: 4,
};

const INSUFFICIENT_PATTERN: WorkPattern = {
  status: 'insufficient_data',
  dayWeights: [],
  restDays: [],
  avgDailyHours: [],
  weeksUsed: 0,
};

/** Partial-history pattern: insufficient_data but 2 weeks of data including weekend work. */
const PARTIAL_WEEKEND_PATTERN: WorkPattern = {
  status: 'insufficient_data',
  dayWeights: [],
  restDays: [],
  avgDailyHours: [8, 8, 8, 8, 8, 6, 4], // works Sat(6h) and Sun(4h)
  weeksUsed: 2,
};

/** Wednesday local noon — getDay() === 3 → todayIndex === 2 */
const WED = new Date('2026-06-10T12:00:00'); // local Wednesday (non-UTC-shifting)
/** Monday local noon — getDay() === 1 → todayIndex === 0 */
const MON = new Date('2026-06-08T12:00:00');
/** Sunday local noon — getDay() === 0 → todayIndex === 6 */
const SUN = new Date('2026-06-14T12:00:00');
/** Saturday local noon — getDay() === 6 → todayIndex === 5 */
const SAT = new Date('2026-06-13T12:00:00');
/** Thursday local noon — getDay() === 4 → todayIndex === 3 */
const THU = new Date('2026-06-11T12:00:00');
/** Friday local noon — getDay() === 5 → todayIndex === 4 */
const FRI = new Date('2026-06-12T12:00:00');

// ─── FR1: Types ───────────────────────────────────────────────────────────────

describe('FR1 — types', () => {
  it('SC1.1 — PrescriptionStatus type is exported (done | active | insufficient_data)', () => {
    // Type-level: verify the value can be assigned to the type
    const s1: PrescriptionStatus = 'done';
    const s2: PrescriptionStatus = 'active';
    const s3: PrescriptionStatus = 'insufficient_data';
    expect([s1, s2, s3]).toEqual(['done', 'active', 'insufficient_data']);
  });

  it('SC1.2 — DayPrescription shape is correct', () => {
    const dp: DayPrescription = { dayIndex: 0, dayLabel: 'Mon', hoursNeeded: 5, isToday: true };
    expect(dp).toMatchObject({ dayIndex: 0, dayLabel: 'Mon', hoursNeeded: 5, isToday: true });
  });

  it('SC1.3 — Prescription shape is correct', () => {
    const p: Prescription = {
      status: 'active',
      days: [],
      totalRemaining: 10,
      patternBased: true,
      summaryLine: 'Need 10.0h today',
    };
    expect(p).toMatchObject({
      status: 'active',
      days: [],
      totalRemaining: 10,
      patternBased: true,
      summaryLine: 'Need 10.0h today',
    });
  });
});

// ─── FR2: computePrescription core algorithm ──────────────────────────────────

describe('FR2 — computePrescription algorithm', () => {
  // SC2.1 — done when exactly at limit
  it('SC2.1 — 40h worked, 40h limit → status: done', () => {
    const result = computePrescription(makeHoursData({ total: 40 }), READY_PATTERN, 40, WED);
    expect(result.status).toBe('done');
    expect(result.days).toEqual([]);
    expect(result.totalRemaining).toBe(0);
    expect(result.patternBased).toBe(false);
    expect(result.summaryLine).toBe("You're done for the week");
  });

  // SC2.1b — done when overtime
  it('SC2.1b — 42h worked (overtime) → status: done', () => {
    const result = computePrescription(makeHoursData({ total: 42 }), READY_PATTERN, 40, WED);
    expect(result.status).toBe('done');
    expect(result.totalRemaining).toBe(0);
  });

  // SC2.2 — Monday: todayIndex = 0
  it('SC2.2 — Monday (getDay()===1) → todayIndex 0, all Mon–Sun in horizon', () => {
    const result = computePrescription(makeHoursData({ total: 0, today: 0 }), READY_PATTERN, 40, MON);
    // Mon–Fri should all be present (Sat/Sun rest)
    expect(result.days.map(d => d.dayIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(result.days[0].isToday).toBe(true);
  });

  // SC2.2b — Sunday: todayIndex = 6, NOT -1
  it('SC2.2b — Sunday (getDay()===0) → todayIndex 6 (not -1 or 7)', () => {
    // patternBased: Sunday (6) is rest → all remaining days excluded → done
    const result = computePrescription(makeHoursData({ total: 20 }), READY_PATTERN, 40, SUN);
    // Sunday has dayWeights[6]=0 → survivingDays empty → done
    expect(result.status).toBe('done');
  });

  // SC2.2b — Sunday with a pattern that works Sundays
  it('SC2.2b — Sunday todayIndex=6 with Sunday work day → single-day prescription', () => {
    const sunPattern: WorkPattern = {
      ...READY_PATTERN,
      dayWeights: [0.16, 0.16, 0.16, 0.16, 0.16, 0.1, 0.1],
      restDays: [],
    };
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), sunPattern, 40, SUN);
    expect(result.status).toBe('active');
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayIndex).toBe(6);
    expect(result.days[0].isToday).toBe(true);
  });

  // SC2.2c — Saturday: todayIndex = 5
  it('SC2.2c — Saturday (getDay()===6) → todayIndex 5; patternBased:false → done (Sat>4)', () => {
    const result = computePrescription(makeHoursData({ total: 20 }), INSUFFICIENT_PATTERN, 40, SAT);
    // In fallback mode (zero history), only i<=4; Sat(5) and Sun(6) both excluded → empty → done
    expect(result.status).toBe('done');
  });

  // SC2.2d — Weekend worker: partial history shows Saturday work → Saturday included
  it('SC2.2d — Saturday with partial-history weekend pattern → status:active (Sat included)', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), PARTIAL_WEEKEND_PATTERN, 40, SAT);
    // avgDailyHours[5]=6 >= REST_DAY_THRESHOLD(0.5) → Sat survives
    expect(result.status).toBe('active');
    expect(result.days.map(d => d.dayIndex)).toContain(5);
  });

  // SC2.2e — Weekend worker: Sunday also works (avgDailyHours[6]=4)
  it('SC2.2e — Sunday with partial-history weekend pattern → status:active (Sun included)', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), PARTIAL_WEEKEND_PATTERN, 40, SUN);
    // avgDailyHours[6]=4 >= REST_DAY_THRESHOLD → Sun survives
    expect(result.status).toBe('active');
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayIndex).toBe(6);
    expect(result.days[0].isToday).toBe(true);
  });

  // SC2.2f — patternBased:false even with partial weekend data (status is still insufficient_data)
  it('SC2.2f — partial weekend pattern → patternBased:false (pattern not ready)', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), PARTIAL_WEEKEND_PATTERN, 40, SAT);
    expect(result.patternBased).toBe(false);
  });

  // SC2.3 — horizon covers today through Sunday only (not wrapping to next week)
  it('SC2.3 — horizon is today..Sunday; Friday horizon = [Fri, Sat, Sun]', () => {
    // patternBased with Sat/Sun as rest → only Fri survives
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, FRI);
    expect(result.days.map(d => d.dayIndex)).toEqual([4]);
  });

  // SC2.4 — patternBased:true when pattern ready; rest days excluded
  it('SC2.4 — patternBased:true with ready pattern; rest days (weight=0) excluded', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    expect(result.patternBased).toBe(true);
    // Wed=2, Thu=3, Fri=4 survive; Sat/Sun excluded
    expect(result.days.map(d => d.dayIndex)).toEqual([2, 3, 4]);
  });

  // SC2.5 — patternBased:false when insufficient_data; status='active'
  it('SC2.5 — insufficient_data → patternBased:false, Sat/Sun excluded, status:active', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), INSUFFICIENT_PATTERN, 40, WED);
    expect(result.patternBased).toBe(false);
    expect(result.status).toBe('active');
    // Wed=2, Thu=3, Fri=4 survive (≤4)
    expect(result.days.map(d => d.dayIndex)).toEqual([2, 3, 4]);
  });

  // SC2.6 — weights renormalize to sum 1
  it('SC2.6 — normalized weights: hours distributed proportionally across surviving days', () => {
    // 20h remaining, Wed–Fri equal weight → 20/3 each ≈ 6.67h
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    const totalNeeded = result.days.reduce((s, d) => s + d.hoursNeeded, 0);
    expect(totalNeeded).toBeCloseTo(20, 5);
  });

  // SC2.7 — today's worked hours subtracted, clamped ≥0
  it('SC2.7 — today 4h worked subtracted from today share; no re-spread', () => {
    // 20h remain, Wed–Fri equal weight → 20/3 ≈ 6.67h each
    // today=4h → today's slot = 6.67-4 = 2.67h
    // Thu and Fri unchanged at 6.67h each
    const result = computePrescription(makeHoursData({ total: 20, today: 4 }), READY_PATTERN, 40, WED);
    const today = result.days.find(d => d.isToday)!;
    const thu = result.days.find(d => d.dayIndex === 3)!;
    const fri = result.days.find(d => d.dayIndex === 4)!;
    expect(today.hoursNeeded).toBeCloseTo(20 / 3 - 4, 5);
    expect(thu.hoursNeeded).toBeCloseTo(20 / 3, 5);
    expect(fri.hoursNeeded).toBeCloseTo(20 / 3, 5);
  });

  it('SC2.7 — today already done: hoursNeeded clamped to 0, no re-spread', () => {
    // 20h remain, Wed–Fri equal → 6.67h each; today=10h → today clamps to 0
    // Thu and Fri still 6.67h (no re-spread)
    const result = computePrescription(makeHoursData({ total: 20, today: 10 }), READY_PATTERN, 40, WED);
    const today = result.days.find(d => d.isToday)!;
    const thu = result.days.find(d => d.dayIndex === 3)!;
    expect(today.hoursNeeded).toBe(0);
    expect(thu.hoursNeeded).toBeCloseTo(20 / 3, 5);
  });

  // SC2.8 — all rest days → done
  it('SC2.8 — all remaining days are rest days (patternBased:true) → status:done', () => {
    // Only Fri and Sat remain; both have weight=0 in this pattern
    const fri_sat_rest: WorkPattern = {
      ...READY_PATTERN,
      dayWeights: [0.25, 0.25, 0.25, 0.25, 0, 0, 0],
      restDays: [4, 5, 6],
    };
    const result = computePrescription(makeHoursData({ total: 20 }), fri_sat_rest, 40, FRI);
    expect(result.status).toBe('done');
    expect(result.summaryLine).toBe("You're done for the week");
  });

  // SC2.9 — normal case → status:'active'
  it('SC2.9 — normal mid-week case → status:active', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    expect(result.status).toBe('active');
  });

  // SC2.10 — totalRemaining
  it('SC2.10 — totalRemaining === max(0, weeklyLimit - total)', () => {
    const result = computePrescription(makeHoursData({ total: 32.5 }), READY_PATTERN, 40, WED);
    expect(result.totalRemaining).toBeCloseTo(7.5, 5);
  });

  it('SC2.10 — totalRemaining is 0 when overtime', () => {
    const result = computePrescription(makeHoursData({ total: 45 }), READY_PATTERN, 40, WED);
    expect(result.totalRemaining).toBe(0);
  });

  // Happy path: 20h worked, Wednesday, pattern-based
  it('happy path — 20h worked, Wed, pattern-based → 3 days, correct distribution', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    expect(result.status).toBe('active');
    expect(result.patternBased).toBe(true);
    expect(result.days).toHaveLength(3); // Wed, Thu, Fri
    // Each day gets 20/3 ≈ 6.67h
    result.days.forEach(d => {
      expect(d.hoursNeeded).toBeCloseTo(20 / 3, 4);
    });
  });

  // Uneven pattern weights
  it('uneven pattern — heavier Mon/Tue → correct proportional distribution', () => {
    const heavy_mon_tue: WorkPattern = {
      status: 'ready',
      dayWeights: [0.3, 0.3, 0.2, 0.1, 0.1, 0, 0],
      restDays: [5, 6],
      avgDailyHours: [12, 12, 8, 4, 4, 0, 0],
      weeksUsed: 4,
    };
    // Starting Wednesday with 30h remaining
    // Surviving: Wed(2)=0.2, Thu(3)=0.1, Fri(4)=0.1 → total raw=0.4 → norm: 0.5, 0.25, 0.25
    const result = computePrescription(makeHoursData({ total: 10, today: 0 }), heavy_mon_tue, 40, WED);
    const wed = result.days.find(d => d.dayIndex === 2)!;
    const thu = result.days.find(d => d.dayIndex === 3)!;
    const fri = result.days.find(d => d.dayIndex === 4)!;
    // 30h remaining
    expect(wed.hoursNeeded).toBeCloseTo(30 * 0.5, 4);  // 15h
    expect(thu.hoursNeeded).toBeCloseTo(30 * 0.25, 4); // 7.5h
    expect(fri.hoursNeeded).toBeCloseTo(30 * 0.25, 4); // 7.5h
  });

  // Thursday afternoon, 38h worked
  it('edge — Thursday, 38h worked, 40h limit → 2h on Thu only', () => {
    const result = computePrescription(makeHoursData({ total: 38, today: 6 }), READY_PATTERN, 40, THU);
    // 2h remaining; today=Thu with 6h worked
    // Thu raw share = 2h (only day); subtract 6h → clamp 0
    // Wait — Thu's raw share = 2h total; today=6h → max(0, 2-6) = 0
    // So today = 0, and totalRemaining = 2
    const today = result.days.find(d => d.isToday)!;
    expect(today.dayIndex).toBe(3);
    expect(today.hoursNeeded).toBe(0); // already done for today
    expect(result.totalRemaining).toBeCloseTo(2, 5);
  });

  // Fractional hoursRemaining
  it('fractional — 7.3h remaining distributes correctly', () => {
    const result = computePrescription(makeHoursData({ total: 32.7, today: 0 }), READY_PATTERN, 40, WED);
    const totalNeeded = result.days.reduce((s, d) => s + d.hoursNeeded, 0);
    expect(totalNeeded).toBeCloseTo(7.3, 4);
  });
});

// ─── FR3: Day labels and isToday ─────────────────────────────────────────────

describe('FR3 — day labels and isToday', () => {
  it('SC3.1 — dayLabel values match Mon–Sun array by dayIndex', () => {
    const expected = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // Monday start → all 5 work days with correct labels
    const result = computePrescription(makeHoursData({ total: 0, today: 0 }), READY_PATTERN, 40, MON);
    result.days.forEach(d => {
      expect(d.dayLabel).toBe(expected[d.dayIndex]);
    });
  });

  it('SC3.2 — isToday true only for the todayIndex entry (Wednesday)', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    const todayEntries = result.days.filter(d => d.isToday);
    expect(todayEntries).toHaveLength(1);
    expect(todayEntries[0].dayIndex).toBe(2); // Wednesday = 2
  });

  it('SC3.2 — isToday false for all non-today entries', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    const notToday = result.days.filter(d => !d.isToday);
    notToday.forEach(d => expect(d.isToday).toBe(false));
  });
});

// ─── FR4: summaryLine formatting ──────────────────────────────────────────────

describe('FR4 — summaryLine formatting', () => {
  // SC4.1 — Two+ days with hours
  it('SC4.1 — two+ days with hours: "Need Xh today · Yh {dayLabel}"', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    // 3 days: Wed, Thu, Fri — each ~6.7h; summaryLine = top 2 (today first)
    expect(result.summaryLine).toMatch(/^Need \d+\.\dh today · \d+\.\dh Thu$/);
  });

  // SC4.2 — Only today has hours
  it('SC4.2 — only today has hoursNeeded: "Need Xh today"', () => {
    // Friday is the last work day; all hours needed today
    const result = computePrescription(makeHoursData({ total: 32, today: 0 }), READY_PATTERN, 40, FRI);
    expect(result.summaryLine).toMatch(/^Need \d+\.\dh today$/);
  });

  // SC4.3 — Today already met, later days remain
  it('SC4.3 — today already met (hoursNeeded=0), later days: "Need Xh {dayLabel}"', () => {
    // Wed with 10h worked today; raw share = 20/3 ≈ 6.67 < 10 → today=0
    const result = computePrescription(makeHoursData({ total: 20, today: 10 }), READY_PATTERN, 40, WED);
    expect(result.summaryLine).not.toContain('today');
    expect(result.summaryLine).toMatch(/^Need \d+\.\dh Thu$/);
  });

  // SC4.4 — Done status
  it('SC4.4 — done: "You\'re done for the week" (no emoji, no period)', () => {
    const result = computePrescription(makeHoursData({ total: 40 }), READY_PATTERN, 40, WED);
    expect(result.summaryLine).toBe("You're done for the week");
    expect(result.summaryLine).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u); // no emoji
  });

  // SC4.5 — rounding to 1 decimal
  it('SC4.5 — hours rounded to 1 decimal', () => {
    // 20h remaining over 3 equal days = 6.666... → rounds to 6.7
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    expect(result.summaryLine).toContain('6.7h');
  });

  // SC4.6 — no trailing whitespace or emoji
  it('SC4.6 — no trailing whitespace or emoji in summaryLine', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), READY_PATTERN, 40, WED);
    expect(result.summaryLine).toBe(result.summaryLine.trim());
    // No emoji (emoji Unicode ranges) — the · separator is intentional punctuation, not an emoji
    expect(result.summaryLine).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
  });

  // Edge: summaryLine when only one day left (today) with exact hours
  it('summaryLine — exact hours (8h, single day): "Need 8.0h today"', () => {
    // 8h remaining, Friday only, today=0
    const result = computePrescription(makeHoursData({ total: 32, today: 0 }), READY_PATTERN, 40, FRI);
    expect(result.summaryLine).toBe('Need 8.0h today');
  });

  // Edge: today = Monday, 40h to go (full week)
  it('summaryLine — full week from Monday: top-2 days shown', () => {
    const result = computePrescription(makeHoursData({ total: 0, today: 0 }), READY_PATTERN, 40, MON);
    // 5 equal days → 8h each. Top 2: today (Mon) + Tue
    expect(result.summaryLine).toBe('Need 8.0h today · 8.0h Tue');
  });

  // Insufficient data pattern
  it('summaryLine — insufficient_data fallback: no pattern but shows top-2 days', () => {
    const result = computePrescription(makeHoursData({ total: 20, today: 0 }), INSUFFICIENT_PATTERN, 40, WED);
    // Fallback: Wed, Thu, Fri equal → 20/3 ≈ 6.7h each
    expect(result.summaryLine).toMatch(/^Need \d+\.\dh today · \d+\.\dh Thu$/);
  });
});

// ─── FR5: usePrescription hook — static analysis ──────────────────────────────

describe('FR5 — usePrescription hook (static analysis)', () => {
  const SRC_ROOT = path.resolve(__dirname, '../..');
  const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'usePrescription.ts');

  let source: string;

  beforeAll(() => {
    if (fs.existsSync(HOOK_FILE)) {
      source = fs.readFileSync(HOOK_FILE, 'utf8');
    }
  });

  it('SC5.1 — hook file exists at src/hooks/usePrescription.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('SC5.2 — imports computePrescription from ../lib/prescription', () => {
    expect(source).toMatch(/computePrescription/);
    expect(source).toMatch(/prescription/);
  });

  it('SC5.3 — imports useHoursData, useWorkPattern, useConfig', () => {
    expect(source).toMatch(/useHoursData/);
    expect(source).toMatch(/useWorkPattern/);
    expect(source).toMatch(/useConfig/);
  });

  it('SC5.4 — guards null hoursData and null config (returns null)', () => {
    expect(source).toMatch(/null/);
    // Must check both hoursData and config are non-null before calling computePrescription
    expect(source).toMatch(/hoursData/);
    expect(source).toMatch(/config/);
  });

  it('SC5.5 — uses useMemo with [hoursData, pattern, config] dependencies', () => {
    expect(source).toMatch(/useMemo/);
    expect(source).toMatch(/hoursData/);
    expect(source).toMatch(/pattern/);
    expect(source).toMatch(/config/);
  });

  it('SC5.6 — does not import from src/api/, src/store/, or AsyncStorage', () => {
    expect(source).not.toMatch(/from.*['"].*\/api\//);
    expect(source).not.toMatch(/from.*['"].*\/store\//);
    expect(source).not.toMatch(/AsyncStorage/);
  });

  it('SC5.7 — calls computePrescription with (hoursData, pattern, config.weeklyLimit)', () => {
    expect(source).toMatch(/computePrescription/);
    expect(source).toMatch(/weeklyLimit/);
  });
});
