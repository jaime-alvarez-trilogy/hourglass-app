// payments.ts — FR2 (05-hours-dashboard)
// Utilities for aggregating Crossover payment records into weekly totals.
//
// `Payment` represents a raw record from GET /api/v3/users/current/payments
// when called with a date range (from/to spanning multiple weeks).

export interface Payment {
  amount: number;           // Total payment amount for the period
  periodStartDate: string;  // YYYY-MM-DD Monday (week start)
  periodEndDate: string;    // YYYY-MM-DD Sunday (week end)
  paidHours: number;        // "Payment hours" — hours paid for (capped at weekly limit unless approved OT)
  workedHours: number;      // Uncapped total hours worked (logged + manual); "Actual Overtime" = workedHours - paidHours
  status: string;           // "CURRENT" | "PENDING" | "PAID" etc.
}

/**
 * Aggregates an array of payment records into a weekly earnings trend.
 *
 * Payments in the same week (identified by `from` date) are summed.
 * Returns an array of exactly `numWeeks` numbers in chronological order
 * (oldest first, most recent last). If fewer than `numWeeks` distinct weeks
 * have data, the result is padded with zeros at the start.
 * If more weeks of data than `numWeeks`, only the most recent `numWeeks` are kept.
 *
 * @param payments  Raw payment records from the Crossover API
 * @param numWeeks  Number of weeks to include (default: 4)
 * @returns         Array of length `numWeeks` with weekly totals
 */
export function getWeeklyEarningsTrend(
  payments: Payment[],
  numWeeks: number = 4,
): number[] {
  // Group and sum by `from` date (week key)
  const weekMap = new Map<string, number>();
  for (const p of payments) {
    const key = p.periodStartDate;
    weekMap.set(key, (weekMap.get(key) ?? 0) + p.amount);
  }

  // Sort weeks chronologically (ISO date strings sort correctly lexicographically)
  const sortedWeeks = Array.from(weekMap.keys()).sort();

  // Take only the most recent numWeeks
  const recentWeeks = sortedWeeks.slice(-numWeeks);

  // Build result array of exactly numWeeks, padding zeros at start
  const result: number[] = new Array(numWeeks).fill(0);
  const offset = numWeeks - recentWeeks.length;
  for (let i = 0; i < recentWeeks.length; i++) {
    result[offset + i] = weekMap.get(recentWeeks[i]) ?? 0;
  }

  return result;
}
