// prescription.ts — 03-pace-prescription
// Pure functions for computing a per-day hours prescription from remaining weekly hours.
// No side effects — safe for useMemo.

import type { HoursData } from './hours';
import { REST_DAY_THRESHOLD } from './workPattern';
import type { WorkPattern } from './workPattern';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrescriptionStatus = 'done' | 'active' | 'insufficient_data';

export interface DayPrescription {
  /** 0=Mon … 6=Sun */
  dayIndex: number;
  /** 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' */
  dayLabel: string;
  /** Hours still needed this day (0 if already met or rest day) */
  hoursNeeded: number;
  isToday: boolean;
}

export interface Prescription {
  status: PrescriptionStatus;
  /** Only remaining work days (today → last work day this week). Empty when done. */
  days: DayPrescription[];
  /** Max(0, weeklyLimit - hoursData.total) */
  totalRemaining: number;
  /** true when WorkPattern was used; false when fell back to equal Mon–Fri weight */
  patternBased: boolean;
  /** e.g. "Need 5.2h today · 3.1h Tue" or "You're done for the week" */
  summaryLine: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DONE_PRESCRIPTION: Prescription = {
  status: 'done',
  days: [],
  totalRemaining: 0,
  patternBased: false,
  summaryLine: "You're done for the week",
};

// ─── computePrescription ─────────────────────────────────────────────────────

/**
 * Distributes remaining weekly hours across the user's remaining work days,
 * weighted by their personal day pattern (or equal Mon–Fri when unavailable).
 * `now` is injectable for deterministic tests; defaults to new Date().
 * Returns status 'done' at/over target or when no actionable days remain.
 */
export function computePrescription(
  hoursData: HoursData,
  pattern: WorkPattern,
  weeklyLimit: number,
  now: Date = new Date(),
): Prescription {
  // Step 1: total remaining hours (clamped ≥ 0)
  const hoursRemaining = Math.max(0, weeklyLimit - hoursData.total);
  if (hoursRemaining === 0) {
    return DONE_PRESCRIPTION;
  }

  // Step 2: today-index using LOCAL weekday (Mon=0 … Sun=6)
  // CRITICAL: must use local day — hoursData.today is keyed off local YYYY-MM-DD
  const todayIndex = (now.getDay() + 6) % 7;

  // Horizon: today through Sunday (indices todayIndex … 6)
  const horizon: number[] = [];
  for (let i = todayIndex; i <= 6; i++) {
    horizon.push(i);
  }

  // Step 3: determine surviving work days
  // - ready:           use per-day weights (pattern fully trained)
  // - partial history: use avgDailyHours threshold (detects weekend workers after 1+ weeks)
  // - zero history:    fall back to Mon–Fri (no data at all)
  const patternBased = pattern.status === 'ready';
  const survivingDays = patternBased
    ? horizon.filter(i => pattern.dayWeights[i] > 0)
    : pattern.avgDailyHours.length > 0
      ? horizon.filter(i => (pattern.avgDailyHours[i] ?? 0) >= REST_DAY_THRESHOLD)
      : horizon.filter(i => i <= 4);

  if (survivingDays.length === 0) {
    return {
      status: 'done',
      days: [],
      totalRemaining: hoursRemaining,
      patternBased,
      summaryLine: "You're done for the week",
    };
  }

  // Step 4: compute and renormalize weights across surviving days
  const rawWeights: Record<number, number> = {};
  for (const i of survivingDays) {
    rawWeights[i] = patternBased ? pattern.dayWeights[i] : 1;
  }
  const sumW = survivingDays.reduce((s, i) => s + rawWeights[i], 0);
  const normW: Record<number, number> = {};
  for (const i of survivingDays) {
    normW[i] = rawWeights[i] / sumW;
  }

  // Step 5 + 6: build DayPrescription[] for surviving days
  const days: DayPrescription[] = survivingDays.map(i => {
    const rawHours = hoursRemaining * normW[i];
    const isToday = i === todayIndex;
    const hoursNeeded = isToday
      ? Math.max(0, rawHours - hoursData.today)
      : rawHours;
    return {
      dayIndex: i,
      dayLabel: DAY_LABELS[i],
      hoursNeeded,
      isToday,
    };
  });

  // Step 7: build summaryLine from top-2 days by hoursNeeded
  const summaryLine = buildSummaryLine(days);

  // Step 8: return active prescription
  return {
    status: 'active',
    days,
    totalRemaining: hoursRemaining,
    patternBased,
    summaryLine,
  };
}

// ─── buildSummaryLine ─────────────────────────────────────────────────────────

function buildSummaryLine(days: DayPrescription[]): string {
  // Collect days with positive hours, sorted by hoursNeeded descending
  const withHours = days
    .filter(d => d.hoursNeeded > 0)
    .sort((a, b) => b.hoursNeeded - a.hoursNeeded);

  if (withHours.length === 0) {
    // All days met (e.g. today already done, no later days)
    return "You're done for the week";
  }

  // Put today first if it appears in top-2
  const todayEntry = withHours.find(d => d.isToday);
  const otherEntries = withHours.filter(d => !d.isToday);

  // Build ordered top-2: today (if any) then highest remaining
  const ordered: DayPrescription[] = [];
  if (todayEntry) ordered.push(todayEntry);
  if (otherEntries.length > 0) ordered.push(otherEntries[0]);
  const top2 = ordered.slice(0, 2);

  const parts = top2.map(d => {
    const hrs = d.hoursNeeded.toFixed(1);
    return d.isToday ? `${hrs}h today` : `${hrs}h ${d.dayLabel}`;
  });

  return `Need ${parts.join(' · ')}`;
}
