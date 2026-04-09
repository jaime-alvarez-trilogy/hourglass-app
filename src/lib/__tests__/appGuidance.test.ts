// Tests: generateGuidance() pure function (12-app-breakdown-ui FR2)
// FR2: Produces 0–3 GuidanceChip objects from aggregated and current-week app breakdown data.
//
// Rules (in order, max 3 chips):
//   Rule 1 — Top opportunity: highest nonAiSlots AND nonAiSlots/(ai+non) > 0.5 → warning
//   Rule 2 — AI leader app: aiSlots/(ai+non) >= 0.8 AND aiSlots >= 5 → cyan
//   Rule 3 — BrainLift highlight: highest brainliftSlots AND >= 3 → violet
//   Rule 4 — Weekly progress: currentWeek AI% vs 12w aggregate AI% ± 5 → success/warning
//
// Note: GuidanceChip is a plain interface — no mocks needed (pure function).

import type { AppBreakdownEntry } from '../aiAppBreakdown';

let generateGuidance: (agg: AppBreakdownEntry[], week: AppBreakdownEntry[]) => any[];
let GuidanceChipColors: { warning: string; cyan: string; violet: string; success: string };

beforeAll(() => {
  const mod = require('../appGuidance');
  generateGuidance = mod.generateGuidance;
  // Pull color values from the colors module for assertion
  const colorsMod = require('../colors');
  GuidanceChipColors = {
    warning: colorsMod.colors.warning,
    cyan: colorsMod.colors.cyan,
    violet: colorsMod.colors.violet,
    success: colorsMod.colors.success,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  appName: string,
  aiSlots: number,
  brainliftSlots: number,
  nonAiSlots: number,
): AppBreakdownEntry {
  return { appName, aiSlots, brainliftSlots, nonAiSlots };
}

// ─── FR2: Empty / no-match cases ─────────────────────────────────────────────

describe('generateGuidance — FR2: empty and no-match cases', () => {
  it('FR2.1 — empty aggregated returns []', () => {
    expect(generateGuidance([], [])).toEqual([]);
  });

  it('FR2.2 — no app qualifies any rule returns []', () => {
    // App with 50% nonAi (not > 50%), low AI%, no brainlift, empty currentWeek
    const agg = [makeEntry('Chrome', 5, 0, 5)]; // exactly 50% nonAi — does NOT trigger rule 1
    expect(generateGuidance(agg, [])).toEqual([]);
  });

  it('FR2.3 — returns array (not null or undefined) in all cases', () => {
    expect(Array.isArray(generateGuidance([], []))).toBe(true);
    expect(Array.isArray(generateGuidance([makeEntry('App', 10, 0, 2)], []))).toBe(true);
  });
});

// ─── FR2: Rule 1 — Top opportunity ───────────────────────────────────────────

describe('generateGuidance — FR2 Rule 1: top opportunity chip', () => {
  it('FR2-R1.1 — app with >50% nonAi triggers opportunity chip naming the app', () => {
    const agg = [makeEntry('Slack', 3, 0, 7)]; // 70% nonAi
    const chips = generateGuidance(agg, []);
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(chips[0].text).toContain('Slack');
  });

  it('FR2-R1.2 — opportunity chip has warning color', () => {
    const agg = [makeEntry('Slack', 3, 0, 7)];
    const chips = generateGuidance(agg, []);
    const rule1Chip = chips.find((c: any) => c.text.includes('Slack'));
    expect(rule1Chip).toBeDefined();
    expect(rule1Chip.color).toBe(GuidanceChipColors.warning);
  });

  it('FR2-R1.3 — opportunity chip text contains the expected phrase', () => {
    const agg = [makeEntry('Chrome', 2, 0, 8)]; // 80% nonAi
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.text.includes('Chrome'));
    expect(chip).toBeDefined();
    expect(chip.text).toMatch(/top untagged app|try using AI/i);
  });

  it('FR2-R1.4 — app at exactly 50.1% nonAi triggers rule 1 (boundary check)', () => {
    // nonAiSlots / (aiSlots + nonAiSlots) > 0.5
    // 501 / (499 + 501) = 501/1000 = 0.501 > 0.5 ✓
    const agg = [makeEntry('Figma', 499, 0, 501)];
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.text.includes('Figma'));
    expect(chip).toBeDefined();
  });

  it('FR2-R1.5 — app at exactly 50% nonAi does NOT trigger rule 1', () => {
    // 50 / (50 + 50) = 0.5, not > 0.5
    const agg = [makeEntry('Figma', 50, 0, 50)];
    const chips = generateGuidance(agg, []);
    expect(chips.length).toBe(0);
  });

  it('FR2-R1.6 — selects app with highest nonAiSlots when multiple qualify', () => {
    const agg = [
      makeEntry('Chrome', 2, 0, 8),   // high nonAi
      makeEntry('Slack', 1, 0, 20),   // even higher nonAi
      makeEntry('VSCode', 3, 0, 5),
    ];
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.warning);
    expect(chip).toBeDefined();
    expect(chip.text).toContain('Slack'); // highest nonAiSlots
  });
});

// ─── FR2: Rule 2 — AI leader app ─────────────────────────────────────────────

describe('generateGuidance — FR2 Rule 2: AI leader chip', () => {
  it('FR2-R2.1 — app with >=80% AI and >=5 aiSlots triggers leader chip', () => {
    const agg = [makeEntry('Cursor', 9, 0, 1)]; // 90% AI, 9 aiSlots
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.cyan);
    expect(chip).toBeDefined();
    expect(chip.text).toContain('Cursor');
  });

  it('FR2-R2.2 — AI leader chip has cyan color', () => {
    const agg = [makeEntry('Cursor', 8, 0, 2)]; // 80% AI, 8 aiSlots
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.cyan);
    expect(chip).toBeDefined();
    expect(chip.color).toBe(GuidanceChipColors.cyan);
  });

  it('FR2-R2.3 — AI leader chip text contains percentage', () => {
    const agg = [makeEntry('Cursor', 9, 0, 1)]; // 90% AI
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.cyan);
    expect(chip.text).toMatch(/\d+%/);
  });

  it('FR2-R2.4 — app with <5 aiSlots does NOT trigger rule 2 even if 100% AI', () => {
    const agg = [makeEntry('Cursor', 4, 0, 0)]; // 100% AI but only 4 slots
    const chips = generateGuidance(agg, []);
    const cyChip = chips.find((c: any) => c.color === GuidanceChipColors.cyan);
    expect(cyChip).toBeUndefined();
  });

  it('FR2-R2.5 — app with <80% AI does NOT trigger rule 2', () => {
    const agg = [makeEntry('Chrome', 7, 0, 3)]; // 70% AI — below threshold
    const chips = generateGuidance(agg, []);
    const cyChip = chips.find((c: any) => c.color === GuidanceChipColors.cyan);
    expect(cyChip).toBeUndefined();
  });
});

// ─── FR2: Rule 3 — BrainLift highlight ───────────────────────────────────────

describe('generateGuidance — FR2 Rule 3: BrainLift highlight chip', () => {
  it('FR2-R3.1 — app with highest brainliftSlots >= 3 triggers BrainLift chip', () => {
    const agg = [makeEntry('Obsidian', 10, 5, 2)]; // 5 brainlift slots
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.violet);
    expect(chip).toBeDefined();
    expect(chip.text).toContain('Obsidian');
  });

  it('FR2-R3.2 — BrainLift chip has violet color', () => {
    const agg = [makeEntry('Obsidian', 10, 4, 2)];
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.violet);
    expect(chip).toBeDefined();
    expect(chip.color).toBe(GuidanceChipColors.violet);
  });

  it('FR2-R3.3 — BrainLift chip text contains "BrainLift"', () => {
    const agg = [makeEntry('Notion', 8, 3, 1)];
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.violet);
    expect(chip.text).toMatch(/BrainLift/i);
  });

  it('FR2-R3.4 — app with brainliftSlots < 3 does NOT trigger rule 3', () => {
    const agg = [makeEntry('Notion', 5, 2, 1)]; // only 2 brainlift slots
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.violet);
    expect(chip).toBeUndefined();
  });

  it('FR2-R3.5 — selects app with highest brainliftSlots when multiple qualify', () => {
    const agg = [
      makeEntry('Obsidian', 12, 8, 2),
      makeEntry('Notion', 6, 3, 1),
    ];
    const chips = generateGuidance(agg, []);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.violet);
    expect(chip.text).toContain('Obsidian'); // highest brainliftSlots
  });
});

// ─── FR2: Rule 4 — Weekly AI progress ────────────────────────────────────────

describe('generateGuidance — FR2 Rule 4: weekly AI progress chip', () => {
  it('FR2-R4.1 — current week AI% > 12w avg + 5 triggers above-average chip (success color)', () => {
    // 12w aggregate: 50 AI out of 100 total = 50%
    const agg = [makeEntry('Chrome', 50, 0, 50)];
    // Current week: 60 AI out of 80 total = 75% → 75 - 50 = 25 > 5
    const week = [makeEntry('Chrome', 60, 0, 20)];
    const chips = generateGuidance(agg, week);
    const chip = chips.find((c: any) => c.color === GuidanceChipColors.success);
    expect(chip).toBeDefined();
    expect(chip.text).toMatch(/above.*12-week average|12-week average/i);
  });

  it('FR2-R4.2 — current week AI% < 12w avg - 5 triggers slower-week chip (warning color)', () => {
    // 12w aggregate: 70 AI out of 100 = 70%
    const agg = [makeEntry('Chrome', 70, 0, 30)];
    // Current week: 20 AI out of 60 = ~33% → 33 - 70 = -37 < -5
    const week = [makeEntry('Chrome', 20, 0, 40)];
    const chips = generateGuidance(agg, week);
    // Warning color chip from rule 4 (not rule 1 — Chrome here is 40% nonAi)
    const r4WarningChips = chips.filter((c: any) => c.color === GuidanceChipColors.warning);
    // At least one warning chip present
    expect(r4WarningChips.length).toBeGreaterThanOrEqual(1);
    const slowerChip = r4WarningChips.find((c: any) => c.text.match(/slower|gap|close/i));
    expect(slowerChip).toBeDefined();
  });

  it('FR2-R4.3 — currentWeek empty → rule 4 not evaluated', () => {
    const agg = [makeEntry('Chrome', 70, 0, 30)];
    // With empty currentWeek, rule 4 should produce no chip
    const chips = generateGuidance(agg, []);
    const r4Chips = chips.filter((c: any) =>
      c.text && (c.text.includes('12-week') || c.text.includes('average') || c.text.includes('gap')),
    );
    expect(r4Chips.length).toBe(0);
  });

  it('FR2-R4.4 — currentWeek with 0 AI slots → rule 4 not evaluated', () => {
    const agg = [makeEntry('Chrome', 70, 0, 30)];
    const week = [makeEntry('Chrome', 0, 0, 20)]; // 0 AI slots this week
    const chips = generateGuidance(agg, week);
    const r4Chips = chips.filter((c: any) =>
      c.text && (c.text.includes('above') || c.text.includes('12-week')),
    );
    expect(r4Chips.length).toBe(0);
  });
});

// ─── FR2: Max 3 chips cap ─────────────────────────────────────────────────────

describe('generateGuidance — FR2: max 3 chips', () => {
  it('FR2.cap.1 — returns at most 3 chips when all rules trigger', () => {
    // Rule 1: Slack high nonAi
    // Rule 2: Cursor high AI (>=80%, >=5 slots)
    // Rule 3: Obsidian high brainlift
    // Rule 4: current week above 12w avg
    const agg = [
      makeEntry('Slack', 3, 0, 10),      // Rule 1: 77% nonAi
      makeEntry('Cursor', 9, 0, 1),      // Rule 2: 90% AI, 9 slots
      makeEntry('Obsidian', 10, 5, 2),   // Rule 3: 5 brainlift
    ];
    const week = [makeEntry('Cursor', 90, 0, 10)]; // Rule 4: current >> agg

    const chips = generateGuidance(agg, week);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it('FR2.cap.2 — chips array length is 0–3 (never exceeds 3)', () => {
    // Multiple qualifying apps
    const agg = [
      makeEntry('App1', 2, 0, 8),
      makeEntry('App2', 9, 0, 1),
      makeEntry('App3', 10, 5, 2),
      makeEntry('App4', 5, 4, 3),
    ];
    const week = [makeEntry('App2', 50, 0, 5)];
    const chips = generateGuidance(agg, week);
    expect(chips.length).toBeGreaterThanOrEqual(0);
    expect(chips.length).toBeLessThanOrEqual(3);
  });
});

// ─── FR2: GuidanceChip shape ──────────────────────────────────────────────────

describe('generateGuidance — FR2: chip shape', () => {
  it('FR2.shape.1 — each chip has text (string) and color (string)', () => {
    const agg = [makeEntry('Slack', 2, 0, 8)];
    const chips = generateGuidance(agg, []);
    if (chips.length > 0) {
      chips.forEach((chip: any) => {
        expect(typeof chip.text).toBe('string');
        expect(chip.text.length).toBeGreaterThan(0);
        expect(typeof chip.color).toBe('string');
        expect(chip.color.length).toBeGreaterThan(0);
      });
    }
  });

  it('FR2.shape.2 — chip text is reasonable length (<= 100 chars)', () => {
    const agg = [makeEntry('AReasonablyLongAppNameForTesting', 2, 0, 8)];
    const chips = generateGuidance(agg, []);
    if (chips.length > 0) {
      chips.forEach((chip: any) => {
        expect(chip.text.length).toBeLessThanOrEqual(100);
      });
    }
  });
});
