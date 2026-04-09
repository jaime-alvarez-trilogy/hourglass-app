// FR2, FR3, FR4, FR5 (04-ai-brainlift): AI/BrainLift business logic
// Pure functions — no React, no AsyncStorage.

import type { WorkDiarySlot } from '../types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TagData {
  total: number;       // count of ALL slots that day
  aiUsage: number;     // slots with ai_usage OR second_brain (union)
  secondBrain: number; // slots with exact tag "second_brain"
  noTags: number;      // slots with empty tags array
}

export interface DailyTagData {
  date: string;        // YYYY-MM-DD
  total: number;
  aiUsage: number;
  secondBrain: number;
  noTags: number;
  isToday: boolean;    // computed at aggregation time
}

export interface AIWeekData {
  aiPctLow: number;          // Math.max(0, Math.round(aiPct - 2))
  aiPctHigh: number;         // Math.min(100, Math.round(aiPct + 2))
  brainliftHours: number;    // totalSecondBrain * 10 / 60
  totalSlots: number;        // sum of all daily totals
  taggedSlots: number;       // totalSlots - totalNoTags
  workdaysElapsed: number;   // days with total > 0
  dailyBreakdown: DailyTagData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the YYYY-MM-DD string for Monday of the week containing `today`.
 * Uses local timezone (not UTC). Sun=0, Mon=1, ..., Sat=6.
 */
export function getMondayOfWeek(today: string): string {
  // T00:00:00 (no Z) → parsed in local timezone
  const d = new Date(today + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  // Format as YYYY-MM-DD in local timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Returns an array of YYYY-MM-DD strings from `start` to `end` (inclusive).
 */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── FR3: countDiaryTags ─────────────────────────────────────────────────────

/**
 * Counts AI-related tags for one day's array of work diary slots.
 *
 * Rules:
 * - aiUsage: slot has "ai_usage" OR "second_brain" (union — not double-counted)
 * - secondBrain: slot has exact tag "second_brain" (NOT substring match)
 * - noTags: slot has an empty tags array
 * - total: slots.length
 */
export function countDiaryTags(slots: WorkDiarySlot[]): TagData {
  let aiUsage = 0;
  let secondBrain = 0;
  let noTags = 0;

  for (const slot of slots) {
    const tags = slot.tags;

    if (tags.length === 0) {
      noTags++;
      continue;
    }

    // Exact tag includes — not substring
    const hasAi = tags.includes('ai_usage');
    const hasSb = tags.includes('second_brain');

    if (hasAi || hasSb) {
      aiUsage++; // union: counted once regardless of how many AI tags
    }
    if (hasSb) {
      secondBrain++;
    }
  }

  return { total: slots.length, aiUsage, secondBrain, noTags };
}

// ─── FR4: aggregateAICache ───────────────────────────────────────────────────

/**
 * Aggregates per-day cached TagData into a weekly AIWeekData summary.
 *
 * Processes only Mon–today of the current week (local timezone).
 * Applies the validated AI% formula with ±2% display range.
 */
export function aggregateAICache(
  cache: Record<string, TagData>,
  today: string,
): AIWeekData {
  const monday = getMondayOfWeek(today);
  const days = dateRange(monday, today);

  let totalSlots = 0;
  let totalAiUsage = 0;
  let totalSecondBrain = 0;
  let totalNoTags = 0;
  let workdaysElapsed = 0;

  const dailyBreakdown: DailyTagData[] = [];

  for (const date of days) {
    const entry = cache[date];
    if (entry) {
      totalSlots += entry.total;
      totalAiUsage += entry.aiUsage;
      totalSecondBrain += entry.secondBrain;
      totalNoTags += entry.noTags;
      if (entry.total > 0) workdaysElapsed++;
      dailyBreakdown.push({ date, ...entry, isToday: date === today });
    }
    // Days not in cache are omitted from dailyBreakdown
  }

  const taggedSlots = totalSlots - totalNoTags;
  const aiPct = taggedSlots > 0 ? (totalAiUsage / taggedSlots) * 100 : 0;

  // When taggedSlots === 0 (no tagged work yet), show 0%–0% not 0%–2%
  const aiPctLow = taggedSlots > 0 ? Math.max(0, Math.round(aiPct - 2)) : 0;
  const aiPctHigh = taggedSlots > 0 ? Math.min(100, Math.round(aiPct + 2)) : 0;

  return {
    aiPctLow,
    aiPctHigh,
    brainliftHours: totalSecondBrain * 10 / 60,
    totalSlots,
    taggedSlots,
    workdaysElapsed,
    dailyBreakdown,
  };
}

// ─── FR5: shouldRefetchDay ───────────────────────────────────────────────────

/**
 * Determines whether a given day needs a fresh API call.
 *
 * Returns true if:
 * - cached is undefined (day not in cache)
 * - cached.total === 0 (empty — possible transient API failure)
 * - isToday === true (always re-fetch today; tags change throughout the day)
 */
export function shouldRefetchDay(
  _date: string,
  cached: TagData | undefined,
  isToday: boolean,
): boolean {
  if (cached === undefined) return true;
  if (cached.total === 0) return true;
  if (isToday) return true;
  return false;
}
