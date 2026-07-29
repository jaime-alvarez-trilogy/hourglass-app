// Tests: scheduleInsights — 02-schedule-insights FR1 + FR3
//
// FR1: inferWorkSchedule() pure function
//   SC1.1  — 4 valid snapshots → non-null WorkSchedule
//   SC1.2  — weeksCovered = count of snapshots with ≥1 non-zero slot
//   SC1.3  — peakHour = argmax of averaged hourlySlots
//   SC1.4  — peakRange[0] <= peakHour <= peakRange[1]
//   SC1.5  — all hours in peakRange have avg ≥ 0.5 * avg[peakHour]
//   SC1.6  — hours immediately outside peakRange have avg < 0.5 * avg[peakHour]
//   SC1.7  — windowStart = first h with avg ≥ 2.0; windowEnd = last
//   SC1.8  — returns null when < 4 valid snapshots
//   SC1.9  — returns null when all hourlySlots undefined or all-zero
//   SC1.10 — returns null when agg[peakHour] === 0
//   SC1.11 — returns null when windowStart === windowEnd (only 1 hour qualifies)
//   SC1.12 — single-hour peak → peakRange: [h, h]
//   SC1.13 — snapshots with hourlySlots: undefined excluded from weeksCovered
//
// FR3: formatScheduleChip() pure formatter
//   SC3.1  — key === "schedule"
//   SC3.2  — dotColor === colors.cyan
//   SC3.3  — boldLine am/pm format: [7,11] → "Peak hours: 7am–11am"
//   SC3.4  — midnight edge: peakRange[0]=0 → "12am" in boldLine
//   SC3.5  — noon edge: peakRange[1]=12 → "12pm" in boldLine
//   SC3.6  — afternoon: peakRange[1]=14 → "2pm" in boldLine
//   SC3.7  — weeksCovered=1 → "Across 1 week" (singular)
//   SC3.8  — weeksCovered=8 → "Across 8 weeks" (plural)
//
// Strategy: Pure function unit tests — no mocks needed.

import { colors } from '../colors';
import type { WeeklySnapshot } from '../weeklyHistory';
import { inferWorkSchedule } from '../scheduleInsights';
import type { WorkSchedule } from '../scheduleInsights';
import { formatScheduleChip } from '../insightFormatting';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal WeeklySnapshot with the given hourlySlots. */
function snap(hourlySlots: number[] | undefined, weekStart = '2025-01-06'): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 0,
    aiPct: 0,
    brainliftHours: 0,
    hourlySlots,
  };
}

/**
 * Build an hourlySlots array (length 24) with a strong peak at `peakHour`
 * surrounded by descending neighbours.
 *
 * peakHour gets `peak` slots; adjacent hours get `shoulder` slots;
 * all other hours get `base` slots.
 */
function makeSlots(
  peakHour: number,
  peak = 10,
  shoulder = 4,
  base = 0,
): number[] {
  return Array.from({ length: 24 }, (_, h) => {
    if (h === peakHour) return peak;
    if (h === peakHour - 1 || h === peakHour + 1) return shoulder;
    return base;
  });
}

/** Repeat the same snapshot N times (different weekStarts to be realistic). */
function snapsWithSlots(slots: number[], n: number): WeeklySnapshot[] {
  return Array.from({ length: n }, (_, i) =>
    snap(slots, `2025-0${1 + i}-06`),
  );
}

/** Build a WorkSchedule fixture for formatter tests. */
function makeSchedule(overrides: Partial<WorkSchedule> = {}): WorkSchedule {
  return {
    peakRange: [7, 11],
    peakHour: 9,
    windowStart: 7,
    windowEnd: 17,
    weeksCovered: 6,
    ...overrides,
  };
}

// ─── FR1: inferWorkSchedule ───────────────────────────────────────────────────

describe('inferWorkSchedule — SC1.1 — 4 valid snapshots → non-null', () => {
  it('returns non-null WorkSchedule when 4 snapshots have valid hourlySlots', () => {
    const slots = makeSlots(9, 10, 4, 0);
    // give hour 9 a big peak but also ensure window (hours 8,9,10 avg 4 slots > 2)
    // window guard: need windowStart < windowEnd so ensure multiple hours ≥ 2
    const multiSlots = slots.map((v, h) => (h >= 7 && h <= 17 ? Math.max(v, 3) : v));
    const snaps = snapsWithSlots(multiSlots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
  });
});

describe('inferWorkSchedule — SC1.2 — weeksCovered counts valid snapshots', () => {
  it('counts only snapshots with at least one non-zero slot', () => {
    const goodSlots = makeSlots(9, 10, 5, 3);
    const good = snapsWithSlots(goodSlots, 5);
    const allZero = snap(new Array(24).fill(0), '2025-07-06');
    const undef = snap(undefined, '2025-08-06');
    const all = [...good, allZero, undef];
    const result = inferWorkSchedule(all);
    expect(result).not.toBeNull();
    expect(result!.weeksCovered).toBe(5);
  });
});

describe('inferWorkSchedule — SC1.3 — peakHour is argmax', () => {
  it('peakHour equals the hour with the highest average slot count', () => {
    // Hour 14 has the most slots
    const slots = new Array(24).fill(0);
    slots[14] = 8;
    slots[9] = 5;
    // add window hours: give 13..15 enough to qualify (>= 2) but 14 clearly wins
    for (let h = 8; h <= 18; h++) {
      if (slots[h] === 0) slots[h] = 2;
    }
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    expect(result!.peakHour).toBe(14);
  });
});

describe('inferWorkSchedule — SC1.4 — peakRange contains peakHour', () => {
  it('peakRange[0] <= peakHour <= peakRange[1]', () => {
    const slots = makeSlots(10, 10, 5, 2);
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    expect(result!.peakRange[0]).toBeLessThanOrEqual(result!.peakHour);
    expect(result!.peakHour).toBeLessThanOrEqual(result!.peakRange[1]);
  });
});

describe('inferWorkSchedule — SC1.5 — all hours in peakRange are ≥50% of peak', () => {
  it('every hour in [peakRange[0], peakRange[1]] has avg >= 0.5 * avg[peakHour]', () => {
    // Build consistent slots: peak=10, shoulders=6 (60% of 10), outside=1
    const slots = new Array(24).fill(0);
    for (let h = 6; h <= 18; h++) slots[h] = 2; // window filler
    slots[9] = 10;  // peak
    slots[8] = 6;   // 60% → included in peakRange
    slots[10] = 6;  // 60% → included in peakRange
    slots[7] = 3;   // 30% → NOT included
    slots[11] = 3;  // 30% → NOT included
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    const { peakRange, peakHour } = result!;
    // compute expected agg from the uniform snapshots
    const agg = slots; // same slots each week → avg = slots
    const threshold = 0.5 * agg[peakHour];
    for (let h = peakRange[0]; h <= peakRange[1]; h++) {
      expect(agg[h]).toBeGreaterThanOrEqual(threshold);
    }
  });
});

describe('inferWorkSchedule — SC1.6 — hours outside peakRange are <50% of peak', () => {
  it('hours immediately outside peakRange have avg < 0.5 * avg[peakHour]', () => {
    const slots = new Array(24).fill(0);
    for (let h = 6; h <= 18; h++) slots[h] = 2;
    slots[9] = 10;  // peak
    slots[8] = 6;   // ≥50% → inside range
    slots[10] = 6;  // ≥50% → inside range
    slots[7] = 4;   // 40% → just outside
    slots[11] = 4;  // 40% → just outside
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    const { peakRange, peakHour } = result!;
    const agg = slots;
    const threshold = 0.5 * agg[peakHour];
    // The hours just outside the range should be < threshold
    if (peakRange[0] > 0) {
      expect(agg[peakRange[0] - 1]).toBeLessThan(threshold);
    }
    if (peakRange[1] < 23) {
      expect(agg[peakRange[1] + 1]).toBeLessThan(threshold);
    }
  });
});

describe('inferWorkSchedule — SC1.7 — windowStart and windowEnd', () => {
  it('windowStart is the first hour with avg >= 2.0 and windowEnd is the last', () => {
    const slots = new Array(24).fill(0);
    // Only hours 8..16 have >= 2 avg slots; peak at 12
    for (let h = 8; h <= 16; h++) slots[h] = 3;
    slots[12] = 10;
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    expect(result!.windowStart).toBe(8);
    expect(result!.windowEnd).toBe(16);
  });
});

describe('inferWorkSchedule — SC1.8 — returns null when < 4 valid snapshots', () => {
  it('returns null with 3 valid snapshots', () => {
    const slots = makeSlots(9, 10, 5, 3);
    const snaps = snapsWithSlots(slots, 3);
    expect(inferWorkSchedule(snaps)).toBeNull();
  });

  it('returns null with 0 snapshots', () => {
    expect(inferWorkSchedule([])).toBeNull();
  });

  it('returns null with 1 valid snapshot', () => {
    const slots = makeSlots(9, 10, 5, 3);
    expect(inferWorkSchedule([snap(slots)])).toBeNull();
  });
});

describe('inferWorkSchedule — SC1.9 — returns null when all slots undefined or zero', () => {
  it('returns null when all snapshots have hourlySlots: undefined', () => {
    const snaps = Array.from({ length: 6 }, (_, i) => snap(undefined, `2025-0${i + 1}-06`));
    expect(inferWorkSchedule(snaps)).toBeNull();
  });

  it('returns null when all snapshots have all-zero hourlySlots', () => {
    const zero = new Array(24).fill(0);
    const snaps = snapsWithSlots(zero, 6);
    expect(inferWorkSchedule(snaps)).toBeNull();
  });
});

describe('inferWorkSchedule — SC1.10 — returns null when agg[peakHour] === 0', () => {
  it('returns null if aggregated peak is 0 (all-zero slots on 4+ weeks)', () => {
    const zero = new Array(24).fill(0);
    const snaps = snapsWithSlots(zero, 4);
    // Even though there are 4 snapshots, none have any non-zero slot
    // so valid.length < 4 guard fires first — still returns null
    expect(inferWorkSchedule(snaps)).toBeNull();
  });
});

describe('inferWorkSchedule — SC1.11 — returns null when only one hour qualifies for window', () => {
  it('returns null when exactly one hour has avg >= 2.0 (windowStart === windowEnd)', () => {
    const slots = new Array(24).fill(0);
    // Only hour 9 has >= 2 avg slots; everything else is 0 or 1
    slots[9] = 8;
    // No adjacent hours qualify for window
    const snaps = snapsWithSlots(slots, 4);
    expect(inferWorkSchedule(snaps)).toBeNull();
  });
});

describe('inferWorkSchedule — SC1.12 — single-hour peak → peakRange: [h, h]', () => {
  it('peakRange is [h, h] when no neighbor is >= 50% of peak density', () => {
    const slots = new Array(24).fill(0);
    // Peak at 9 = 10; neighbors at 8,10 = 1 (10% of 10 — well below 50%)
    // Add enough window hours so window guard passes
    for (let h = 6; h <= 18; h++) slots[h] = 3;
    slots[9] = 10;
    slots[8] = 1;  // override the filler for immediate neighbors
    slots[10] = 1;
    const snaps = snapsWithSlots(slots, 4);
    const result = inferWorkSchedule(snaps);
    expect(result).not.toBeNull();
    expect(result!.peakRange).toEqual([9, 9]);
  });
});

describe('inferWorkSchedule — SC1.13 — undefined hourlySlots excluded from weeksCovered', () => {
  it('snapshots with hourlySlots undefined are silently excluded', () => {
    const goodSlots = makeSlots(9, 10, 5, 3);
    const good = Array.from({ length: 4 }, (_, i) => snap(goodSlots, `2025-0${i + 1}-06`));
    const withUndef = [
      ...good,
      snap(undefined, '2025-05-06'),
      snap(undefined, '2025-06-06'),
    ];
    const result = inferWorkSchedule(withUndef);
    expect(result).not.toBeNull();
    expect(result!.weeksCovered).toBe(4);
  });
});

// ─── FR3: formatScheduleChip ──────────────────────────────────────────────────

describe('formatScheduleChip — SC3.1 — key === "schedule"', () => {
  it('chip key is "schedule"', () => {
    const chip = formatScheduleChip(makeSchedule());
    expect(chip.key).toBe('schedule');
  });
});

describe('formatScheduleChip — SC3.2 — dotColor === colors.cyan', () => {
  it('dotColor is colors.cyan', () => {
    const chip = formatScheduleChip(makeSchedule());
    expect(chip.dotColor).toBe(colors.cyan);
  });
});

describe('formatScheduleChip — SC3.3 — am/pm format for standard range', () => {
  it('[7, 11] → "Peak hours: 7am–11am"', () => {
    const chip = formatScheduleChip(makeSchedule({ peakRange: [7, 11] }));
    expect(chip.boldLine).toBe('Peak hours: 7am–11am');
  });

  it('[9, 17] → "Peak hours: 9am–5pm"', () => {
    const chip = formatScheduleChip(makeSchedule({ peakRange: [9, 17] }));
    expect(chip.boldLine).toBe('Peak hours: 9am–5pm');
  });
});

describe('formatScheduleChip — SC3.4 — midnight edge: 0 → "12am"', () => {
  it('peakRange[0] === 0 → "12am" appears in boldLine', () => {
    const chip = formatScheduleChip(makeSchedule({ peakRange: [0, 1] }));
    expect(chip.boldLine).toContain('12am');
    expect(chip.boldLine).toBe('Peak hours: 12am–1am');
  });
});

describe('formatScheduleChip — SC3.5 — noon edge: 12 → "12pm"', () => {
  it('peakRange[1] === 12 → "12pm" appears in boldLine', () => {
    const chip = formatScheduleChip(makeSchedule({ peakRange: [10, 12] }));
    expect(chip.boldLine).toContain('12pm');
    expect(chip.boldLine).toBe('Peak hours: 10am–12pm');
  });
});

describe('formatScheduleChip — SC3.6 — afternoon: 14 → "2pm"', () => {
  it('peakRange[1] === 14 → "2pm" appears in boldLine', () => {
    const chip = formatScheduleChip(makeSchedule({ peakRange: [12, 14] }));
    expect(chip.boldLine).toBe('Peak hours: 12pm–2pm');
  });
});

describe('formatScheduleChip — SC3.7 — weeksCovered 1 → singular', () => {
  it('"Across 1 week" when weeksCovered is 1', () => {
    const chip = formatScheduleChip(makeSchedule({ weeksCovered: 1 }));
    expect(chip.mutedLine).toBe('Across 1 week');
  });
});

describe('formatScheduleChip — SC3.8 — weeksCovered > 1 → plural', () => {
  it('"Across 8 weeks" when weeksCovered is 8', () => {
    const chip = formatScheduleChip(makeSchedule({ weeksCovered: 8 }));
    expect(chip.mutedLine).toBe('Across 8 weeks');
  });

  it('"Across 4 weeks" when weeksCovered is 4', () => {
    const chip = formatScheduleChip(makeSchedule({ weeksCovered: 4 }));
    expect(chip.mutedLine).toBe('Across 4 weeks');
  });
});
