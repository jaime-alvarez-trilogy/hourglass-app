// Tests: useHourlyInsights hook — 02-hourly-pattern-insights FR5
//
// FR5: useHourlyInsights() hook
//   SC5.1 — hook file exists at src/hooks/useHourlyInsights.ts
//   SC5.2 — imports useWeeklyHistory from ./useWeeklyHistory
//   SC5.3 — imports computeHourlyProfile, inferFocusWindow, inferAIHotZone from ../lib/hourlyInsights
//   SC5.4 — has JSDoc comment
//   SC5.5 — returns { profile: null, focusWindow: null, aiHotZone: null } when snapshots is empty
//   SC5.6 — returns { profile: null, focusWindow: null, aiHotZone: null } when < 4 valid weeks
//   SC5.7 — returns populated HourlyInsights when ≥4 valid snapshots
//   SC5.8 — re-computes when snapshots reference changes
//   SC5.9 — stable reference when snapshots unchanged
//
// Strategy:
// - Static analysis (file-read-based) for import/JSDoc/export checks (SC5.1–5.4)
// - Logic tests: call computeHourlyProfile + inferFocusWindow + inferAIHotZone directly
//   (same pattern as useWorkSchedule.test.ts — no renderHook)

import * as path from 'path';
import * as fs from 'fs';
import type { WeeklySnapshot } from '../../lib/weeklyHistory';
import {
  computeHourlyProfile,
  inferFocusWindow,
  inferAIHotZone,
} from '../../lib/hourlyInsights';

// ─── File paths ───────────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useHourlyInsights.ts');

// ─── SC5.1 — Hook file exists ─────────────────────────────────────────────────

describe('useHourlyInsights — SC5.1 — hook file exists', () => {
  it('file exists at src/hooks/useHourlyInsights.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });
});

// ─── SC5.2 — Imports useWeeklyHistory ────────────────────────────────────────

describe('useHourlyInsights — SC5.2 — imports useWeeklyHistory', () => {
  it('source imports useWeeklyHistory from ./useWeeklyHistory', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useWeeklyHistory/);
    expect(src).toMatch(/from\s+['"]\.\/?useWeeklyHistory['"]/);
  });
});

// ─── SC5.3 — Imports from hourlyInsights lib ──────────────────────────────────

describe('useHourlyInsights — SC5.3 — imports from ../lib/hourlyInsights', () => {
  it('imports computeHourlyProfile', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/computeHourlyProfile/);
    expect(src).toMatch(/from\s+['"]\.\.\/lib\/hourlyInsights['"]/);
  });

  it('imports inferFocusWindow', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/inferFocusWindow/);
  });

  it('imports inferAIHotZone', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/inferAIHotZone/);
  });
});

// ─── SC5.4 — JSDoc comment ───────────────────────────────────────────────────

describe('useHourlyInsights — SC5.4 — has JSDoc comment', () => {
  it('JSDoc comment appears before export function declaration', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    const jsdocBeforeFunc = /\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useHourlyInsights/;
    expect(src).toMatch(jsdocBeforeFunc);
  });

  it('JSDoc mentions null condition', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/null|insufficient/i);
  });
});

// ─── Logic tests — mirror hook body, no renderHook ───────────────────────────

/** Build a valid WeeklySnapshot with all 4 hourly arrays. */
function makeValidSnap(weekStart: string): WeeklySnapshot {
  const hourlySlots = new Array(24).fill(0);
  hourlySlots[9] = 5;
  const hourlyIntensity = new Array(24).fill(0);
  hourlyIntensity[9] = 400; // 80 avg when divided by 5 slots
  const hourlyAISlots = new Array(24).fill(0);
  hourlyAISlots[9] = 5;
  const hourlyProductiveSlots = new Array(24).fill(0);
  hourlyProductiveSlots[9] = 5;
  return {
    weekStart,
    hours: 40,
    earnings: 1000,
    aiPct: 75,
    brainliftHours: 5,
    hourlySlots,
    hourlyIntensity,
    hourlyAISlots,
    hourlyProductiveSlots,
  };
}

/** Simulate what the hook body does. */
function simulateHook(snapshots: WeeklySnapshot[]) {
  const profile = computeHourlyProfile(snapshots);
  const focusWindow = profile ? inferFocusWindow(profile) : null;
  const aiHotZone = profile ? inferAIHotZone(profile) : null;
  return { profile, focusWindow, aiHotZone };
}

// ─── SC5.5 — Empty snapshots → all null ──────────────────────────────────────

describe('useHourlyInsights — SC5.5 — empty snapshots → all null', () => {
  it('returns { profile: null, focusWindow: null, aiHotZone: null } for []', () => {
    const result = simulateHook([]);
    expect(result.profile).toBeNull();
    expect(result.focusWindow).toBeNull();
    expect(result.aiHotZone).toBeNull();
  });
});

// ─── SC5.6 — < 4 valid weeks → all null ──────────────────────────────────────

describe('useHourlyInsights — SC5.6 — < 4 valid weeks → all null', () => {
  it('returns all null with 3 valid snapshots', () => {
    const snaps = Array.from({ length: 3 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));
    const result = simulateHook(snaps);
    expect(result.profile).toBeNull();
    expect(result.focusWindow).toBeNull();
    expect(result.aiHotZone).toBeNull();
  });
});

// ─── SC5.7 — ≥4 valid snapshots → populated result ───────────────────────────

describe('useHourlyInsights — SC5.7 — ≥4 valid snapshots → populated HourlyInsights', () => {
  it('returns non-null profile with 4 valid snapshots', () => {
    const snaps = Array.from({ length: 4 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));
    const result = simulateHook(snaps);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.weeksCovered).toBe(4);
  });

  it('result satisfies HourlyInsights interface shape', () => {
    const snaps = Array.from({ length: 4 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));
    const result = simulateHook(snaps);
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('focusWindow');
    expect(result).toHaveProperty('aiHotZone');
  });
});

// ─── SC5.8 — Re-computes when snapshots change ───────────────────────────────

describe('useHourlyInsights — SC5.8 — re-computes when snapshots changes', () => {
  it('old snapshot set (3 weeks) → null, new set (4 weeks) → non-null', () => {
    const threeWeeks = Array.from({ length: 3 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));
    const fourWeeks = Array.from({ length: 4 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));

    const result1 = simulateHook(threeWeeks);
    const result2 = simulateHook(fourWeeks);

    expect(result1.profile).toBeNull();
    expect(result2.profile).not.toBeNull();
  });
});

// ─── SC5.9 — Stable reference when snapshots unchanged ────────────────────────

describe('useHourlyInsights — SC5.9 — stable reference with same inputs', () => {
  it('same snapshot array reference produces same profile content', () => {
    const snaps = Array.from({ length: 4 }, (_, i) => makeValidSnap(`2025-0${i + 1}-06`));
    const result1 = simulateHook(snaps);
    const result2 = simulateHook(snaps);
    // Structural equality — both runs on same array produce same weeksCovered
    expect(result1.profile?.weeksCovered).toBe(result2.profile?.weeksCovered);
    expect(result1.profile?.activeWindow).toEqual(result2.profile?.activeWindow);
  });
});
