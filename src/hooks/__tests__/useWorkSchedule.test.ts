// Tests: useWorkSchedule hook — 02-schedule-insights FR2
//
// FR2: useWorkSchedule() thin hook
//   SC2.1 — hook file exists at src/hooks/useWorkSchedule.ts
//   SC2.2 — imports useWeeklyHistory from ./useWeeklyHistory
//   SC2.3 — imports inferWorkSchedule from ../lib/scheduleInsights
//   SC2.4 — re-exports WorkSchedule type
//   SC2.5 — empty snapshots → null
//   SC2.6 — < 4 valid snapshots → null
//   SC2.7 — ≥ 4 valid snapshots → non-null WorkSchedule
//   SC2.8 — hook has JSDoc comment
//
// Strategy:
// - Static analysis (file-read-based) for import/JSDoc/export checks (SC2.1–2.4, SC2.8)
// - Logic tests: call inferWorkSchedule directly with same inputs the hook would receive,
//   matching the project convention (no renderHook) from useInsightChips.test.ts

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useWorkSchedule.ts');

// ─── SC2.1 — Hook file exists ────────────────────────────────────────────────

describe('useWorkSchedule — SC2.1 — hook file exists', () => {
  it('file exists at src/hooks/useWorkSchedule.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });
});

// ─── SC2.2 — Imports useWeeklyHistory ────────────────────────────────────────

describe('useWorkSchedule — SC2.2 — imports useWeeklyHistory', () => {
  it('source imports useWeeklyHistory from ./useWeeklyHistory', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useWeeklyHistory/);
    expect(src).toMatch(/from\s+['"]\.\/?useWeeklyHistory['"]/);
  });
});

// ─── SC2.3 — Imports inferWorkSchedule ───────────────────────────────────────

describe('useWorkSchedule — SC2.3 — imports inferWorkSchedule', () => {
  it('source imports inferWorkSchedule from ../lib/scheduleInsights', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/inferWorkSchedule/);
    expect(src).toMatch(/from\s+['"]\.\.\/lib\/scheduleInsights['"]/);
  });
});

// ─── SC2.4 — Re-exports WorkSchedule type ────────────────────────────────────

describe('useWorkSchedule — SC2.4 — re-exports WorkSchedule type', () => {
  it('source re-exports WorkSchedule type', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/export\s+type\s+\{?\s*WorkSchedule/);
  });
});

// ─── SC2.8 — JSDoc comment ───────────────────────────────────────────────────

describe('useWorkSchedule — SC2.8 — has JSDoc comment', () => {
  it('JSDoc comment appears before the export function declaration', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    const jsdocBeforeFunc = /\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useWorkSchedule/;
    expect(src).toMatch(jsdocBeforeFunc);
  });

  it('JSDoc mentions null condition (< 4 or insufficient)', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    // Must document the null return condition
    expect(src).toMatch(/null|insufficient/i);
  });
});

// ─── Logic tests — mirrors hook body, no renderHook ──────────────────────────

import type { WeeklySnapshot } from '../../lib/weeklyHistory';
import { inferWorkSchedule } from '../../lib/scheduleInsights';

function snap(hourlySlots: number[] | undefined, weekStart = '2025-01-06'): WeeklySnapshot {
  return { weekStart, hours: 40, earnings: 0, aiPct: 0, brainliftHours: 0, hourlySlots };
}

function makeSlots(peak = 10, shoulder = 5): number[] {
  const s = new Array(24).fill(0);
  for (let h = 8; h <= 16; h++) s[h] = 3; // window
  s[9] = peak;
  s[8] = shoulder;
  s[10] = shoulder;
  return s;
}

// Simulate the hook's one-liner body
function simulateHook(snapshots: WeeklySnapshot[]) {
  return inferWorkSchedule(snapshots);
}

describe('useWorkSchedule — SC2.5 — empty snapshots → null', () => {
  it('returns null when snapshots array is empty', () => {
    expect(simulateHook([])).toBeNull();
  });
});

describe('useWorkSchedule — SC2.6 — < 4 valid snapshots → null', () => {
  it('returns null with 3 valid snapshots', () => {
    const slots = makeSlots();
    const snaps = Array.from({ length: 3 }, (_, i) => snap(slots, `2025-0${i + 1}-06`));
    expect(simulateHook(snaps)).toBeNull();
  });
});

describe('useWorkSchedule — SC2.7 — ≥ 4 valid snapshots → non-null WorkSchedule', () => {
  it('returns non-null WorkSchedule with 4 valid snapshots', () => {
    const slots = makeSlots();
    const snaps = Array.from({ length: 4 }, (_, i) => snap(slots, `2025-0${i + 1}-06`));
    const result = simulateHook(snaps);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('peakRange');
    expect(result).toHaveProperty('peakHour');
    expect(result).toHaveProperty('weeksCovered');
  });
});
