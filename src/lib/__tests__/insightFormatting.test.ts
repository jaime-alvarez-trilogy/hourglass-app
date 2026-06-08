// Tests: insightFormatting — 05-insights-ui FR1
//
// FR1: InsightChipData type and formatter functions
//   formatPrescriptionChip: handles done / active / insufficient_data status
//   formatTrendChip: handles up / down / flat direction, null self-guard
//   formatCorrelationChip: BrainLift → AI delta chip
//
// Strategy: Pure function unit tests — no mocks needed.
// Fixture objects built from actual type definitions in prescription.ts / aiInsights.ts.

import { colors } from '../colors';
import type { Prescription } from '../prescription';
import type {
  AITrendInsight,
  AIBestInsight,
  BrainLiftCorrelationInsight,
} from '../aiInsights';

// These will fail until insightFormatting.ts is created (red phase).
import {
  formatPrescriptionChip,
  formatTrendChip,
  formatCorrelationChip,
} from '../insightFormatting';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DONE_PRESCRIPTION: Prescription = {
  status: 'done',
  days: [],
  totalRemaining: 0,
  patternBased: false,
  summaryLine: "You're done for the week",
};

const ACTIVE_PATTERN_PRESCRIPTION: Prescription = {
  status: 'active',
  days: [
    { dayIndex: 0, dayLabel: 'Mon', hoursNeeded: 5.2, isToday: true },
    { dayIndex: 1, dayLabel: 'Tue', hoursNeeded: 3.1, isToday: false },
  ],
  totalRemaining: 8.3,
  patternBased: true,
  summaryLine: 'Need 5.2h today · 3.1h Tue',
};

const ACTIVE_STANDARD_PRESCRIPTION: Prescription = {
  status: 'active',
  days: [
    { dayIndex: 2, dayLabel: 'Wed', hoursNeeded: 6.0, isToday: true },
  ],
  totalRemaining: 6.0,
  patternBased: false,
  summaryLine: 'Need 6.0h today',
};

const INSUFFICIENT_PRESCRIPTION: Prescription = {
  status: 'insufficient_data',
  days: [],
  totalRemaining: 12,
  patternBased: false,
  summaryLine: '',
};

const TREND_UP: AITrendInsight = {
  slopePts: 12.4,
  weeksUsed: 8,
  direction: 'up',
};

const TREND_DOWN: AITrendInsight = {
  slopePts: -8.1,
  weeksUsed: 6,
  direction: 'down',
};

const TREND_FLAT: AITrendInsight = {
  slopePts: 1.1,
  weeksUsed: 8,
  direction: 'flat',
};

const BEST_INSIGHT: AIBestInsight = {
  peakPct: 94,
  weekLabel: 'Apr 7',
  currentPct: 82,
  ptsBelowBest: 12,
};

const CORRELATION: BrainLiftCorrelationInsight = {
  r: 0.62,
  highBLAvgAIPct: 91,
  lowBLAvgAIPct: 74,
  pairsUsed: 10,
};

// ─── formatPrescriptionChip ───────────────────────────────────────────────────

describe('formatPrescriptionChip — status: done', () => {
  it('SC1.1 — boldLine is "You\'re done for the week"', () => {
    const chip = formatPrescriptionChip(DONE_PRESCRIPTION);
    expect(chip.boldLine).toBe("You're done for the week");
  });

  it('SC1.2 — mutedLine is "40h hit — rest or keep going"', () => {
    const chip = formatPrescriptionChip(DONE_PRESCRIPTION);
    expect(chip.mutedLine).toBe('40h hit — rest or keep going');
  });

  it('SC1.3 — dotColor is colors.success', () => {
    const chip = formatPrescriptionChip(DONE_PRESCRIPTION);
    expect(chip.dotColor).toBe(colors.success);
  });

  it('SC1.4 — key is "pace"', () => {
    const chip = formatPrescriptionChip(DONE_PRESCRIPTION);
    expect(chip.key).toBe('pace');
  });

  it('SC1.4b — done with totalRemaining > 0 (week ended short): boldLine "Week complete"', () => {
    const chip = formatPrescriptionChip({ ...DONE_PRESCRIPTION, totalRemaining: 1.5 });
    expect(chip.boldLine).toBe('Week complete');
  });

  it('SC1.4c — done with totalRemaining > 0: mutedLine shows hours short', () => {
    const chip = formatPrescriptionChip({ ...DONE_PRESCRIPTION, totalRemaining: 1.5 });
    expect(chip.mutedLine).toBe('1.5h short of goal');
  });

  it('SC1.4d — done with totalRemaining > 0: dotColor is textSecondary', () => {
    const chip = formatPrescriptionChip({ ...DONE_PRESCRIPTION, totalRemaining: 1.5 });
    expect(chip.dotColor).toBe(colors.textSecondary);
  });
});

describe('formatPrescriptionChip — status: active, patternBased: true', () => {
  it('SC1.5 — boldLine equals prescription summaryLine', () => {
    const chip = formatPrescriptionChip(ACTIVE_PATTERN_PRESCRIPTION);
    expect(chip.boldLine).toBe('Need 5.2h today · 3.1h Tue');
  });

  it('SC1.6 — mutedLine is "based on your pattern"', () => {
    const chip = formatPrescriptionChip(ACTIVE_PATTERN_PRESCRIPTION);
    expect(chip.mutedLine).toBe('based on your pattern');
  });

  it('SC1.7 — dotColor is colors.success (on-track pace)', () => {
    const chip = formatPrescriptionChip(ACTIVE_PATTERN_PRESCRIPTION);
    expect(chip.dotColor).toBe(colors.success);
  });

  it('SC1.8 — key is "pace"', () => {
    const chip = formatPrescriptionChip(ACTIVE_PATTERN_PRESCRIPTION);
    expect(chip.key).toBe('pace');
  });
});

describe('formatPrescriptionChip — status: active, patternBased: false', () => {
  it('SC1.9 — mutedLine is "based on standard schedule"', () => {
    const chip = formatPrescriptionChip(ACTIVE_STANDARD_PRESCRIPTION);
    expect(chip.mutedLine).toBe('based on standard schedule');
  });
});

describe('formatPrescriptionChip — status: insufficient_data', () => {
  it('SC1.10 — dotColor is colors.textSecondary', () => {
    const chip = formatPrescriptionChip(INSUFFICIENT_PRESCRIPTION);
    expect(chip.dotColor).toBe(colors.textSecondary);
  });

  it('SC1.11 — mutedLine includes "Building your work pattern…"', () => {
    const chip = formatPrescriptionChip(INSUFFICIENT_PRESCRIPTION);
    expect(chip.mutedLine).toContain('Building your work pattern');
  });

  it('SC1.12 — key is "pace"', () => {
    const chip = formatPrescriptionChip(INSUFFICIENT_PRESCRIPTION);
    expect(chip.key).toBe('pace');
  });
});

// ─── formatTrendChip ──────────────────────────────────────────────────────────

describe('formatTrendChip — null guard', () => {
  it('SC1.13 — returns null when both trend and best are null', () => {
    expect(formatTrendChip(null, null)).toBeNull();
  });
});

describe('formatTrendChip — trend up, best non-null', () => {
  let chip: ReturnType<typeof formatTrendChip>;
  beforeEach(() => {
    chip = formatTrendChip(TREND_UP, BEST_INSIGHT);
  });

  it('SC1.14 — boldLine contains "AI up +"', () => {
    expect(chip!.boldLine).toContain('AI up +');
  });

  it('SC1.15 — boldLine contains rounded slopePts (12)', () => {
    expect(chip!.boldLine).toContain('12');
  });

  it('SC1.16 — boldLine contains weeksUsed (8)', () => {
    expect(chip!.boldLine).toContain('8');
  });

  it('SC1.17 — mutedLine contains peakPct (94)', () => {
    expect(chip!.mutedLine).toContain('94');
  });

  it('SC1.18 — mutedLine contains weekLabel (Apr 7)', () => {
    expect(chip!.mutedLine).toContain('Apr 7');
  });

  it('SC1.19 — dotColor is colors.cyan', () => {
    expect(chip!.dotColor).toBe(colors.cyan);
  });

  it('SC1.20 — key is "ai-trend"', () => {
    expect(chip!.key).toBe('ai-trend');
  });
});

describe('formatTrendChip — trend down, best non-null', () => {
  let chip: ReturnType<typeof formatTrendChip>;
  beforeEach(() => {
    chip = formatTrendChip(TREND_DOWN, BEST_INSIGHT);
  });

  it('SC1.21 — boldLine contains "AI down"', () => {
    expect(chip!.boldLine).toContain('AI down');
  });

  it('SC1.22 — boldLine contains abs rounded slopePts (8)', () => {
    expect(chip!.boldLine).toContain('8');
  });

  it('SC1.23 — dotColor is still colors.cyan (no hue change for direction)', () => {
    expect(chip!.dotColor).toBe(colors.cyan);
  });

  it('SC1.24 — mutedLine includes ptsBelowBest and "pts gap" for down trend', () => {
    // BEST_INSIGHT.ptsBelowBest = 12; expect "12pts gap" in mutedLine
    expect(chip!.mutedLine).toContain('12pts gap');
  });
});

describe('formatTrendChip — trend flat', () => {
  it('SC1.25 — boldLine contains "AI holding steady"', () => {
    const chip = formatTrendChip(TREND_FLAT, BEST_INSIGHT);
    expect(chip!.boldLine).toContain('AI holding steady');
  });

  it('SC1.26 — dotColor is colors.cyan', () => {
    const chip = formatTrendChip(TREND_FLAT, null);
    expect(chip!.dotColor).toBe(colors.cyan);
  });
});

describe('formatTrendChip — best is null', () => {
  it('SC1.27 — mutedLine is "building history…"', () => {
    const chip = formatTrendChip(TREND_UP, null);
    expect(chip!.mutedLine).toBe('building history…');
  });
});

// ─── formatCorrelationChip ───────────────────────────────────────────────────

describe('formatCorrelationChip', () => {
  let chip: ReturnType<typeof formatCorrelationChip>;
  beforeEach(() => {
    chip = formatCorrelationChip(CORRELATION);
  });

  it('SC1.28 — boldLine contains "BrainLift weeks →"', () => {
    expect(chip.boldLine).toContain('BrainLift weeks');
  });

  it('SC1.29 — boldLine contains computed delta (91 - 74 = 17)', () => {
    expect(chip.boldLine).toContain('17');
  });

  it('SC1.30 — mutedLine contains "5h+ BL:"', () => {
    expect(chip.mutedLine).toContain('5h+ BL:');
  });

  it('SC1.31 — mutedLine contains rounded highBLAvgAIPct (91)', () => {
    expect(chip.mutedLine).toContain('91');
  });

  it('SC1.32 — mutedLine contains rounded lowBLAvgAIPct (74)', () => {
    expect(chip.mutedLine).toContain('74');
  });

  it('SC1.33 — dotColor is colors.violet', () => {
    expect(chip.dotColor).toBe(colors.violet);
  });

  it('SC1.34 — key is "brainlift"', () => {
    expect(chip.key).toBe('brainlift');
  });

  it('SC1.35 — non-integer averages are rounded in mutedLine', () => {
    const c: BrainLiftCorrelationInsight = {
      r: 0.5,
      highBLAvgAIPct: 88.6,
      lowBLAvgAIPct: 72.4,
      pairsUsed: 8,
    };
    const result = formatCorrelationChip(c);
    // Should round to 89 and 72
    expect(result.mutedLine).toContain('89');
    expect(result.mutedLine).toContain('72');
  });
});
