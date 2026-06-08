import type { PanelState } from './reanimated-presets';
import type { Prescription } from './prescription';
export type { PanelState };

/** Fraction of expected pace considered "on track" (within 15% of pace). */
export const PACING_ON_TRACK_THRESHOLD = 0.85;

/** Fraction of expected pace considered "recoverable behind" (60–84% of pace). */
export const PACING_BEHIND_THRESHOLD = 0.60;

/** Fraction of expected pace considered "crushing it" ahead of schedule (≥125% of pace). */
export const PACING_CRUSHING_THRESHOLD = 1.25;

/**
 * Computes which of the 7 Hourglass panel states applies to the current week.
 *
 * Panel states (in evaluation priority):
 *   idle         — No work started yet, or contractual limit is zero.
 *   overtime     — Hours worked strictly exceed the weekly limit (hours > limit).
 *   crushedIt    — Hours worked exactly meet the weekly limit (hours === limit).
 *   aheadOfPace  — Pacing at ≥ 125% of expected hours mid-week ("CRUSHING IT").
 *   onTrack      — Pacing at ≥ 85% of expected hours for the days elapsed.
 *   behind       — Pacing at 60–84% of expected hours (recoverable).
 *   critical     — Pacing below 60% of expected hours (severe deficit).
 *
 * @param hoursWorked  Hours logged so far this week (e.g. 28.5).
 * @param weeklyLimit  Contractual weekly hour target (e.g. 40).
 * @param daysElapsed  Fractional work days elapsed Mon–Fri (0.0–5.0). 0.0 =
 *                     Monday midnight; 1.292 = Tuesday 7am; 5.0 = Friday or
 *                     weekend. Values outside [0, 5] are clamped.
 *
 * @returns One of: "onTrack" | "behind" | "critical" | "crushedIt" | "idle" | "overtime" | "aheadOfPace"
 */
export function computePanelState(
  hoursWorked: number,
  weeklyLimit: number,
  daysElapsed: number,
): PanelState {
  // Guard: zero or negative limit means no target — nothing to pace against.
  if (weeklyLimit <= 0) return 'idle';

  // Clamp inputs to valid ranges.
  const days = Math.max(0, Math.min(5, daysElapsed));
  const hours = Math.max(0, hoursWorked);

  // Strictly exceeded — overtime celebration (higher priority than crushedIt).
  if (hours > weeklyLimit) return 'overtime';

  // Goal exactly met — crushed it.
  if (hours >= weeklyLimit) return 'crushedIt';

  // All of Monday (days < 1) with nothing logged — fresh week, getting started.
  if (days < 1 && hours === 0) return 'idle';

  // Compute expected hours. If days is exactly 0 (Monday midnight) with hours
  // already logged, expectedHours is 0 — treat as on track to avoid division
  // by zero.
  const expectedHours = (days / 5) * weeklyLimit;
  if (expectedHours === 0) return 'onTrack';

  const pacingRatio = hours / expectedHours;

  // Significantly ahead of pace — positive mid-week signal.
  if (pacingRatio >= PACING_CRUSHING_THRESHOLD) return 'aheadOfPace';

  if (pacingRatio >= PACING_ON_TRACK_THRESHOLD) return 'onTrack';
  if (pacingRatio >= PACING_BEHIND_THRESHOLD) return 'behind';
  return 'critical';
}

// Urgency thresholds — reciprocals of the pacing thresholds so both functions
// agree on what "on track", "behind", and "crushing it" mean.
const URGENCY_CRUSHING = 1 / PACING_CRUSHING_THRESHOLD; // ≤ 0.80
const URGENCY_ON_TRACK = 1 / PACING_ON_TRACK_THRESHOLD; // ≤ 1.176
const URGENCY_BEHIND   = 1 / PACING_BEHIND_THRESHOLD;   // ≤ 1.667

/**
 * Derives panel state from the current Prescription (03-pace-prescription).
 * Uses remaining hours / remaining work-day capacity as the urgency signal,
 * which respects the user's 5-day pattern and today's partial hours.
 * Falls back to computePanelState when prescription.status === 'insufficient_data'.
 */
export function computePrescriptionPanelState(
  prescription: Prescription,
  hoursWorked: number,
  weeklyLimit: number,
): PanelState {
  if (weeklyLimit <= 0) return 'idle';
  if (hoursWorked === 0) return 'idle';
  if (hoursWorked > weeklyLimit) return 'overtime';
  if (hoursWorked >= weeklyLimit) return 'crushedIt';

  // Week ended
  if (prescription.status === 'done') {
    return prescription.totalRemaining > 0 ? 'behind' : 'crushedIt';
  }

  // Not enough history for pattern — fall back to linear model
  if (prescription.status === 'insufficient_data') {
    return computePanelState(hoursWorked, weeklyLimit, computeDaysElapsed());
  }

  // Active: urgency = remaining hours / remaining day capacity
  const daysLeft = prescription.days.length;
  if (daysLeft === 0) return 'onTrack';

  const normalDailyHours = weeklyLimit / 5;
  const urgency = prescription.totalRemaining / (daysLeft * normalDailyHours);

  if (urgency <= URGENCY_CRUSHING) return 'aheadOfPace';
  if (urgency <= URGENCY_ON_TRACK) return 'onTrack';
  if (urgency <= URGENCY_BEHIND)   return 'behind';
  return 'critical';
}

/**
 * Returns the fractional number of work days elapsed in the current week
 * (Mon–Fri), using local timezone.
 *
 * Returns 0.0–5.0:
 *   0.0   — Monday at exactly 00:00:00 (week just started)
 *   0.333 — Monday at 08:00 (one-third of the first day elapsed)
 *   1.292 — Tuesday at 07:00 (one day plus 7/24 of the second day)
 *   5.0   — Friday (any time), Saturday, or Sunday (clamped to full week)
 *
 * Uses local timezone (getDay / getHours / getMinutes / getSeconds).
 * This is intentional: users experience their workweek in local time.
 * The hoursWorked value from the Crossover API uses UTC — the mismatch is
 * expected and correct.
 *
 * @param now  Optional Date to use (defaults to new Date()).
 */
export function computeDaysElapsed(now?: Date): number {
  const d = now ?? new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

  // Weekend — clamp to 5
  if (day === 0 || day === 6) return 5;

  // Friday — full week elapsed, clamp to 5
  if (day === 5) return 5;

  // Mon–Thu (day 1–4): return fractional days elapsed.
  // dayIndex: 0=Mon, 1=Tue, 2=Wed, 3=Thu
  // Monday midnight: dayIndex=0, hourOfDay=0 → returns 0.0 naturally.
  const dayIndex = day - 1;
  const hourOfDay = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return dayIndex + hourOfDay / 24;
}
