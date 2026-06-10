// Tests: hourlyInsights — 02-hourly-pattern-insights FR1–FR4
//
// FR1: computeHourlyProfile(snapshots) pure function
//   SC1.1  — 4 valid weeks, only hour 9 active → avgSlots[9]=5, avgIntensity[9]=80,
//            avgAIRate[9]=1.0, avgProductiveRate[9]=1.0, all other hours NaN, activeWindow=[9,9], weeksCovered=4
//   SC1.2  — returns null for < 4 valid weeks (3 valid weeks)
//   SC1.3  — returns null for empty array
//   SC1.4  — mixed snapshots (some with hourly fields, some without) → only valid contribute
//   SC1.5  — hours at boundaries (h=0, h=23) correctly averaged
//   SC1.6  — hourlySlots[h]=0 for a week → that week excluded from avgIntensity[h] (NaN if all zero)
//   SC1.7  — all avgSlots < 0.5 → activeWindow defaults to [0, 23]
//   SC1.8  — all returned arrays are exactly 24 elements
//   SC1.9  — weeksCovered = count of valid snapshots (not total)
//
// FR2: inferFocusWindow(profile) pure function
//   SC2.1  — hour 9 at 90, hours 8+10 at 60 → peakRange=[8,10], peakIntensity=70
//   SC2.2  — expansion capped at 4 hours
//   SC2.3  — hours 8–11 all at identical intensity → range exactly [8,11]
//   SC2.4  — peak intensity < 20 → returns null
//   SC2.5  — only 1 valid hour in activeWindow → peakRange=[h,h]
//   SC2.6  — all intensities NaN → returns null
//   SC2.7  — expansion clipped to activeWindow boundaries
//   SC2.8  — weeksCovered matches profile.weeksCovered
//
// FR3: inferAIHotZone(profile) pure function
//   SC3.1  — hour 10 at 0.8, hour 11 at 0.6 (75% >= 70%) → hotRange=[10,11]
//   SC3.2  — hour 10 at 0.8, hour 11 at 0.5 (62% < 70%) → hotRange=[10,10]
//   SC3.3  — both neighbors qualify → only stronger side expanded (range <= 2 hours)
//   SC3.4  — max AI rate < 0.10 → returns null
//   SC3.5  — all hours NaN → returns null
//   SC3.6  — aiRate = mean of avgAIRate over hotRange
//   SC3.7  — weeksCovered matches profile.weeksCovered
//
// FR4: formatHour(h) utility
//   SC4.1  — 0 → "12am"
//   SC4.2  — 12 → "12pm"
//   SC4.3  — 1→"1am", 11→"11am" (no leading zeros)
//   SC4.4  — 13→"1pm", 23→"11pm"
//   SC4.5  — 9 → "9am"
//
// Strategy: Pure functions — no mocks needed.

import type { WeeklySnapshot } from '../weeklyHistory';
import {
  computeHourlyProfile,
  inferFocusWindow,
  inferAIHotZone,
  formatHour,
} from '../hourlyInsights';
import type { HourlyProfile } from '../hourlyInsights';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make a WeeklySnapshot with all 4 hourly arrays filled. */
function makeSnap(
  overrides: {
    hourlySlots?: number[];
    hourlyIntensity?: number[];
    hourlyAISlots?: number[];
    hourlyProductiveSlots?: number[];
  },
  weekStart = '2025-01-06',
): WeeklySnapshot {
  return {
    weekStart,
    hours: 40,
    earnings: 1000,
    aiPct: 75,
    brainliftHours: 5,
    ...overrides,
  };
}

/** Build 4 identical valid snapshots where only hour `h` is active. */
function fourWeeksHourOnly(
  h: number,
  slots = 5,
  intensity = 80,
  aiSlots = 5,
  productiveSlots = 5,
): WeeklySnapshot[] {
  const hourlySlots = new Array(24).fill(0);
  hourlySlots[h] = slots;
  const hourlyIntensity = new Array(24).fill(0);
  hourlyIntensity[h] = intensity * slots; // sum (divided by slots at read time → 80)
  const hourlyAISlots = new Array(24).fill(0);
  hourlyAISlots[h] = aiSlots;
  const hourlyProductiveSlots = new Array(24).fill(0);
  hourlyProductiveSlots[h] = productiveSlots;

  return Array.from({ length: 4 }, (_, i) =>
    makeSnap({ hourlySlots, hourlyIntensity, hourlyAISlots, hourlyProductiveSlots }, `2025-0${i + 1}-06`),
  );
}

/** Build a minimal HourlyProfile with 24 NaN arrays and specified overrides. */
function makeProfile(overrides: Partial<HourlyProfile>): HourlyProfile {
  return {
    avgSlots: new Array(24).fill(0),
    avgIntensity: new Array(24).fill(NaN),
    avgAIRate: new Array(24).fill(NaN),
    avgProductiveRate: new Array(24).fill(NaN),
    weeksCovered: 4,
    activeWindow: [0, 23],
    ...overrides,
  };
}

// ─── FR1: computeHourlyProfile ────────────────────────────────────────────────

describe('computeHourlyProfile — SC1.1 — happy path: only hour 9 active', () => {
  it('avgSlots[9]=5, avgIntensity[9]=80, avgAIRate[9]=1.0, avgProductiveRate[9]=1.0', () => {
    const snaps = fourWeeksHourOnly(9, 5, 80, 5, 5);
    const result = computeHourlyProfile(snaps);
    expect(result).not.toBeNull();
    expect(result!.avgSlots[9]).toBeCloseTo(5);
    expect(result!.avgIntensity[9]).toBeCloseTo(80);
    expect(result!.avgAIRate[9]).toBeCloseTo(1.0);
    expect(result!.avgProductiveRate[9]).toBeCloseTo(1.0);
  });

  it('all other hours have NaN intensity, aiRate, productiveRate', () => {
    const snaps = fourWeeksHourOnly(9);
    const result = computeHourlyProfile(snaps)!;
    for (let h = 0; h < 24; h++) {
      if (h === 9) continue;
      expect(isNaN(result.avgIntensity[h])).toBe(true);
      expect(isNaN(result.avgAIRate[h])).toBe(true);
      expect(isNaN(result.avgProductiveRate[h])).toBe(true);
    }
  });

  it('activeWindow=[9,9], weeksCovered=4', () => {
    const snaps = fourWeeksHourOnly(9);
    const result = computeHourlyProfile(snaps)!;
    expect(result.activeWindow).toEqual([9, 9]);
    expect(result.weeksCovered).toBe(4);
  });
});

describe('computeHourlyProfile — SC1.2 — returns null for < 4 valid weeks', () => {
  it('returns null with 3 valid snapshots', () => {
    const hourlySlots = new Array(24).fill(0);
    hourlySlots[9] = 5;
    const hourlyIntensity = new Array(24).fill(0);
    hourlyIntensity[9] = 400;
    const hourlyAISlots = new Array(24).fill(0);
    hourlyAISlots[9] = 5;
    const hourlyProductiveSlots = new Array(24).fill(0);
    hourlyProductiveSlots[9] = 5;
    const snaps = Array.from({ length: 3 }, (_, i) =>
      makeSnap({ hourlySlots, hourlyIntensity, hourlyAISlots, hourlyProductiveSlots }, `2025-0${i + 1}-06`),
    );
    expect(computeHourlyProfile(snaps)).toBeNull();
  });
});

describe('computeHourlyProfile — SC1.3 — returns null for empty array', () => {
  it('returns null for []', () => {
    expect(computeHourlyProfile([])).toBeNull();
  });
});

describe('computeHourlyProfile — SC1.4 — mixed snapshots: only valid ones contribute', () => {
  it('ignores snapshots missing any of the 4 hourly arrays', () => {
    // 3 valid + 2 invalid = still null (valid < 4)
    const hourlySlots = new Array(24).fill(0);
    hourlySlots[9] = 5;
    const hourlyIntensity = new Array(24).fill(400);
    const hourlyAISlots = new Array(24).fill(5);
    const hourlyProductiveSlots = new Array(24).fill(5);
    const valid = Array.from({ length: 3 }, (_, i) =>
      makeSnap({ hourlySlots, hourlyIntensity, hourlyAISlots, hourlyProductiveSlots }, `2025-0${i + 1}-06`),
    );
    // missing hourlyIntensity
    const invalid = makeSnap({ hourlySlots, hourlyAISlots, hourlyProductiveSlots }, '2025-05-06');
    // missing all hourly arrays
    const bareSnap: WeeklySnapshot = { weekStart: '2025-06-06', hours: 40, earnings: 0, aiPct: 0, brainliftHours: 0 };
    expect(computeHourlyProfile([...valid, invalid, bareSnap])).toBeNull();
  });

  it('returns non-null when exactly 4 valid snapshots among mixed set', () => {
    const hourlySlots = new Array(24).fill(0);
    hourlySlots[9] = 5;
    const arr = new Array(24).fill(0);
    arr[9] = 5;
    const valid = Array.from({ length: 4 }, (_, i) =>
      makeSnap(
        { hourlySlots: arr, hourlyIntensity: [...arr].map((v, h) => (h === 9 ? 400 : 0)), hourlyAISlots: arr, hourlyProductiveSlots: arr },
        `2025-0${i + 1}-06`,
      ),
    );
    const bareSnap: WeeklySnapshot = { weekStart: '2025-06-06', hours: 40, earnings: 0, aiPct: 0, brainliftHours: 0 };
    expect(computeHourlyProfile([...valid, bareSnap])).not.toBeNull();
  });
});

describe('computeHourlyProfile — SC1.5 — boundary hours h=0 and h=23', () => {
  it('correctly averages hour 0', () => {
    const snaps = fourWeeksHourOnly(0, 3, 60, 2, 3);
    const result = computeHourlyProfile(snaps)!;
    expect(result.avgSlots[0]).toBeCloseTo(3);
    expect(result.avgIntensity[0]).toBeCloseTo(60);
  });

  it('correctly averages hour 23', () => {
    const snaps = fourWeeksHourOnly(23, 3, 50, 1, 2);
    const result = computeHourlyProfile(snaps)!;
    expect(result.avgSlots[23]).toBeCloseTo(3);
    expect(result.avgIntensity[23]).toBeCloseTo(50);
  });
});

describe('computeHourlyProfile — SC1.6 — hourlySlots[h]=0 → NaN for that hour', () => {
  it('hour with all-zero slots produces NaN intensity', () => {
    // 4 valid snaps, all hours zero, only h=9 has activity
    const snaps = fourWeeksHourOnly(9);
    const result = computeHourlyProfile(snaps)!;
    // h=10 has zero slots in all weeks → NaN
    expect(isNaN(result.avgIntensity[10])).toBe(true);
    expect(isNaN(result.avgAIRate[10])).toBe(true);
  });

  it('partial weeks: some weeks have slots at h=9, some do not → NaN excluded from average', () => {
    // Weeks 1-4: h=9 active. Weeks 5-6: h=9 zero. Weeks 5-6 still valid (have all 4 arrays)
    const baseSlots = new Array(24).fill(0);
    baseSlots[9] = 5;
    const baseIntensity = new Array(24).fill(0);
    baseIntensity[9] = 400; // 80 per slot
    const baseAI = new Array(24).fill(0);
    baseAI[9] = 5;
    const baseProd = new Array(24).fill(0);
    baseProd[9] = 5;

    const zeroSlots = new Array(24).fill(0); // h=9 is zero
    const zeroOther = new Array(24).fill(0);

    const activeWeeks = Array.from({ length: 4 }, (_, i) =>
      makeSnap({ hourlySlots: baseSlots, hourlyIntensity: baseIntensity, hourlyAISlots: baseAI, hourlyProductiveSlots: baseProd }, `2025-0${i + 1}-06`),
    );
    const zeroWeeks = Array.from({ length: 2 }, (_, i) =>
      makeSnap({ hourlySlots: zeroSlots, hourlyIntensity: zeroOther, hourlyAISlots: zeroOther, hourlyProductiveSlots: zeroOther }, `2025-0${i + 5}-06`),
    );
    const result = computeHourlyProfile([...activeWeeks, ...zeroWeeks])!;
    // Only the 4 active weeks contribute to avgIntensity[9] (zeroWeeks excluded for that hour)
    expect(result.avgIntensity[9]).toBeCloseTo(80);
    // avgSlots[9] = mean across all 6 valid weeks = (5*4 + 0*2)/6
    expect(result.avgSlots[9]).toBeCloseTo((5 * 4) / 6);
  });
});

describe('computeHourlyProfile — SC1.7 — all avgSlots < 0.5 → activeWindow=[0,23]', () => {
  it('falls back to [0,23] when no hour meets 0.5 threshold', () => {
    // Use very small slot counts (< 0.5 average) for all hours
    const slots = new Array(24).fill(0);
    slots[9] = 0; // zero everywhere → avgSlots=0 everywhere
    const zeros = new Array(24).fill(0);
    const snaps = Array.from({ length: 4 }, (_, i) =>
      makeSnap({ hourlySlots: slots, hourlyIntensity: zeros, hourlyAISlots: zeros, hourlyProductiveSlots: zeros }, `2025-0${i + 1}-06`),
    );
    const result = computeHourlyProfile(snaps)!;
    // avgSlots[h]=0 for all h < 0.5 → fallback
    expect(result.activeWindow).toEqual([0, 23]);
  });
});

describe('computeHourlyProfile — SC1.8 — all arrays exactly 24 elements', () => {
  it('each returned array has length 24', () => {
    const snaps = fourWeeksHourOnly(9);
    const result = computeHourlyProfile(snaps)!;
    expect(result.avgSlots).toHaveLength(24);
    expect(result.avgIntensity).toHaveLength(24);
    expect(result.avgAIRate).toHaveLength(24);
    expect(result.avgProductiveRate).toHaveLength(24);
  });
});

describe('computeHourlyProfile — SC1.9 — weeksCovered = count of valid snapshots', () => {
  it('with 5 total but 4 valid, weeksCovered=4', () => {
    const arr = new Array(24).fill(0);
    arr[9] = 5;
    const valid = Array.from({ length: 4 }, (_, i) =>
      makeSnap({ hourlySlots: arr, hourlyIntensity: arr, hourlyAISlots: arr, hourlyProductiveSlots: arr }, `2025-0${i + 1}-06`),
    );
    const invalid: WeeklySnapshot = { weekStart: '2025-06-06', hours: 40, earnings: 0, aiPct: 0, brainliftHours: 0 };
    const result = computeHourlyProfile([...valid, invalid])!;
    expect(result.weeksCovered).toBe(4);
  });
});

// ─── FR2: inferFocusWindow ────────────────────────────────────────────────────

describe('inferFocusWindow — SC2.1 — peak with qualifying shoulders', () => {
  it('hour 9 at 90, hours 8+10 at 60 → peakRange=[8,10], peakIntensity≈70', () => {
    const avgIntensity = new Array(24).fill(NaN);
    avgIntensity[8] = 60;
    avgIntensity[9] = 90;
    avgIntensity[10] = 60;
    const avgSlots = new Array(24).fill(0);
    avgSlots[8] = 3; avgSlots[9] = 5; avgSlots[10] = 3;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [8, 10] });
    const result = inferFocusWindow(profile);
    expect(result).not.toBeNull();
    expect(result!.peakRange).toEqual([8, 10]);
    expect(result!.peakIntensity).toBeCloseTo((60 + 90 + 60) / 3);
  });
});

describe('inferFocusWindow — SC2.2 — expansion capped at 4 hours', () => {
  it('5 qualifying hours → capped at 4', () => {
    // hours 8-12 all at same intensity 80 → all qualify (100% >= 60%)
    const avgIntensity = new Array(24).fill(NaN);
    for (let h = 8; h <= 12; h++) avgIntensity[h] = 80;
    const avgSlots = new Array(24).fill(0);
    for (let h = 8; h <= 12; h++) avgSlots[h] = 4;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [8, 12] });
    const result = inferFocusWindow(profile)!;
    const rangeSize = result.peakRange[1] - result.peakRange[0] + 1;
    // Exactly 4 hours (cap), not just "at most 4"
    expect(rangeSize).toBe(4);
  });
});

describe('inferFocusWindow — SC2.3 — hours 8–11 all at identical intensity → range=[8,11]', () => {
  it('exactly 4 identical hours → range is [8,11]', () => {
    const avgIntensity = new Array(24).fill(NaN);
    for (let h = 8; h <= 11; h++) avgIntensity[h] = 75;
    const avgSlots = new Array(24).fill(0);
    for (let h = 8; h <= 11; h++) avgSlots[h] = 4;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [8, 11] });
    const result = inferFocusWindow(profile)!;
    // Argmax picks hour 8 (first, tie-broken by iteration order), then expands right to [8,11].
    expect(result.peakRange).toEqual([8, 11]);
  });
});

describe('inferFocusWindow — SC2.4 — peak intensity < 20 → null', () => {
  it('returns null when peak avgIntensity < 20', () => {
    const avgIntensity = new Array(24).fill(NaN);
    avgIntensity[9] = 15; // < 20
    const avgSlots = new Array(24).fill(0);
    avgSlots[9] = 3;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [9, 9] });
    expect(inferFocusWindow(profile)).toBeNull();
  });
});

describe('inferFocusWindow — SC2.5 — only 1 valid hour → single-hour range', () => {
  it('single valid hour produces peakRange=[h,h]', () => {
    const avgIntensity = new Array(24).fill(NaN);
    avgIntensity[10] = 50;
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 3;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [10, 10] });
    const result = inferFocusWindow(profile)!;
    expect(result.peakRange).toEqual([10, 10]);
  });
});

describe('inferFocusWindow — SC2.6 — all intensities NaN → null', () => {
  it('returns null when all avgIntensity values are NaN', () => {
    const profile = makeProfile({ activeWindow: [0, 23] });
    expect(inferFocusWindow(profile)).toBeNull();
  });
});

describe('inferFocusWindow — SC2.7 — expansion clipped to activeWindow', () => {
  it('does not expand beyond activeWindow boundaries', () => {
    // activeWindow=[10,12], hours 9+13 might qualify but are outside window
    const avgIntensity = new Array(24).fill(NaN);
    avgIntensity[9] = 90;   // outside window
    avgIntensity[10] = 90;  // lo boundary
    avgIntensity[11] = 90;
    avgIntensity[12] = 90;  // hi boundary
    avgIntensity[13] = 90;  // outside window
    const avgSlots = new Array(24).fill(0);
    for (let h = 9; h <= 13; h++) avgSlots[h] = 4;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [10, 12] });
    const result = inferFocusWindow(profile)!;
    expect(result.peakRange[0]).toBeGreaterThanOrEqual(10);
    expect(result.peakRange[1]).toBeLessThanOrEqual(12);
  });
});

describe('inferFocusWindow — SC2.8 — weeksCovered matches profile', () => {
  it('weeksCovered = profile.weeksCovered', () => {
    const avgIntensity = new Array(24).fill(NaN);
    avgIntensity[9] = 70;
    const avgSlots = new Array(24).fill(0);
    avgSlots[9] = 3;
    const profile = makeProfile({ avgIntensity, avgSlots, activeWindow: [9, 9], weeksCovered: 7 });
    const result = inferFocusWindow(profile)!;
    expect(result.weeksCovered).toBe(7);
  });
});

// ─── FR3: inferAIHotZone ──────────────────────────────────────────────────────

describe('inferAIHotZone — SC3.1 — qualifying right neighbor expands range', () => {
  it('hour 10 at 0.8, hour 11 at 0.6 (75% >= 70%) → hotRange=[10,11]', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[10] = 0.8;
    avgAIRate[11] = 0.6;
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 4; avgSlots[11] = 4;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [10, 11] });
    const result = inferAIHotZone(profile)!;
    expect(result.hotRange).toEqual([10, 11]);
  });
});

describe('inferAIHotZone — SC3.2 — non-qualifying neighbor stays single hour', () => {
  it('hour 10 at 0.8, hour 11 at 0.5 (62% < 70%) → hotRange=[10,10]', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[10] = 0.8;
    avgAIRate[11] = 0.5;
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 4; avgSlots[11] = 4;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [10, 11] });
    const result = inferAIHotZone(profile)!;
    expect(result.hotRange).toEqual([10, 10]);
  });
});

describe('inferAIHotZone — SC3.3 — both neighbors qualify → only stronger side', () => {
  it('both qualify: left=0.65, right=0.62 → expands to stronger (left)', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[9] = 0.65;   // 81% of 0.8 >= 70% — qualifies
    avgAIRate[10] = 0.8;   // peak
    avgAIRate[11] = 0.62;  // 77% of 0.8 >= 70% — also qualifies
    const avgSlots = new Array(24).fill(0);
    avgSlots[9] = 3; avgSlots[10] = 5; avgSlots[11] = 3;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [9, 11] });
    const result = inferAIHotZone(profile)!;
    const size = result.hotRange[1] - result.hotRange[0] + 1;
    expect(size).toBeLessThanOrEqual(2);
    // left (0.65) is stronger than right (0.62) → expands left → hotRange=[9,10]
    expect(result.hotRange).toEqual([9, 10]);
  });
});

describe('inferAIHotZone — SC3.4 — max AI rate < 0.10 → null', () => {
  it('returns null when no hour reaches 10% AI', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[10] = 0.05; // < 0.10
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 3;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [10, 10] });
    expect(inferAIHotZone(profile)).toBeNull();
  });
});

describe('inferAIHotZone — SC3.5 — all hours NaN → null', () => {
  it('returns null when all avgAIRate are NaN', () => {
    const profile = makeProfile({ activeWindow: [0, 23] });
    expect(inferAIHotZone(profile)).toBeNull();
  });
});

describe('inferAIHotZone — SC3.6 — aiRate is mean over hotRange', () => {
  it('aiRate = mean(avgAIRate) over hotRange', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[10] = 0.8;
    avgAIRate[11] = 0.6; // qualifies (75% >= 70%)
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 4; avgSlots[11] = 4;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [10, 11] });
    const result = inferAIHotZone(profile)!;
    expect(result.aiRate).toBeCloseTo((0.8 + 0.6) / 2);
  });
});

describe('inferAIHotZone — SC3.7 — weeksCovered matches profile', () => {
  it('weeksCovered = profile.weeksCovered', () => {
    const avgAIRate = new Array(24).fill(NaN);
    avgAIRate[10] = 0.5;
    const avgSlots = new Array(24).fill(0);
    avgSlots[10] = 4;
    const profile = makeProfile({ avgAIRate, avgSlots, activeWindow: [10, 10], weeksCovered: 12 });
    const result = inferAIHotZone(profile)!;
    expect(result.weeksCovered).toBe(12);
  });
});

// ─── FR4: formatHour ──────────────────────────────────────────────────────────

describe('formatHour — SC4.1 — midnight', () => {
  it('0 → "12am"', () => {
    expect(formatHour(0)).toBe('12am');
  });
});

describe('formatHour — SC4.2 — noon', () => {
  it('12 → "12pm"', () => {
    expect(formatHour(12)).toBe('12pm');
  });
});

describe('formatHour — SC4.3 — AM hours, no leading zeros', () => {
  it('1 → "1am"', () => {
    expect(formatHour(1)).toBe('1am');
  });
  it('11 → "11am"', () => {
    expect(formatHour(11)).toBe('11am');
  });
});

describe('formatHour — SC4.4 — PM hours', () => {
  it('13 → "1pm"', () => {
    expect(formatHour(13)).toBe('1pm');
  });
  it('23 → "11pm"', () => {
    expect(formatHour(23)).toBe('11pm');
  });
});

describe('formatHour — SC4.5 — typical morning hour', () => {
  it('9 → "9am"', () => {
    expect(formatHour(9)).toBe('9am');
  });
});
