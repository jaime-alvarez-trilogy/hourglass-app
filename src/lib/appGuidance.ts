// appGuidance.ts — 12-app-breakdown-ui FR2
// Pure function: generateGuidance(aggregated, currentWeek) → GuidanceChip[]
//
// Rules (evaluated in order, max 3 chips):
//   Rule 1 — Top opportunity: highest nonAiSlots AND nonAiSlots/(ai+non) > 0.5 → warning
//   Rule 2 — AI leader app: aiSlots/(ai+non) >= 0.8 AND aiSlots >= 5 → cyan
//   Rule 3 — BrainLift highlight: highest brainliftSlots AND >= 3 → violet
//   Rule 4 — Weekly AI% progress: currentWeek vs 12w aggregate ± 5 → success/warning
//
// No side effects. No hooks. No I/O.

import type { AppBreakdownEntry } from './aiAppBreakdown';
import { colors } from './colors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuidanceChip {
  /** Short sentence, max ~60 chars. */
  text: string;
  /** Hex color for dot indicator. */
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute overall AI% across a list of entries. Returns 0 when no total slots. */
function computeAIPct(entries: AppBreakdownEntry[]): number {
  let totalAi = 0;
  let totalAll = 0;
  for (const e of entries) {
    totalAi += e.aiSlots;
    totalAll += e.aiSlots + e.nonAiSlots;
  }
  if (totalAll === 0) return 0;
  return (totalAi / totalAll) * 100;
}

// ─── generateGuidance ─────────────────────────────────────────────────────────

/**
 * Generates 0–3 guidance chips from aggregated 12-week and current-week app breakdown data.
 * Rules are evaluated in order; at most 3 chips are returned.
 * Pure function — safe to call in render.
 */
export function generateGuidance(
  aggregated: AppBreakdownEntry[],
  currentWeek: AppBreakdownEntry[],
): GuidanceChip[] {
  if (aggregated.length === 0) return [];

  const chips: GuidanceChip[] = [];

  // ── Rule 1: Top opportunity ────────────────────────────────────────────────
  // Find app with highest nonAiSlots where nonAiSlots/(aiSlots+nonAiSlots) > 0.5
  if (chips.length < 3) {
    const candidates = aggregated
      .filter(e => {
        const total = e.aiSlots + e.nonAiSlots;
        return total > 0 && e.nonAiSlots / total > 0.5;
      })
      .sort((a, b) => b.nonAiSlots - a.nonAiSlots);

    if (candidates.length > 0) {
      const top = candidates[0];
      chips.push({
        text: `${top.appName} is your top untagged app — try using AI tools there`,
        color: colors.warning,
      });
    }
  }

  // ── Rule 2: AI leader app ──────────────────────────────────────────────────
  // Find app with aiSlots/(aiSlots+nonAiSlots) >= 0.8 AND aiSlots >= 5
  if (chips.length < 3) {
    const candidates = aggregated
      .filter(e => {
        const total = e.aiSlots + e.nonAiSlots;
        return total > 0 && e.aiSlots >= 5 && e.aiSlots / total >= 0.8;
      })
      .sort((a, b) => b.aiSlots - a.aiSlots);

    if (candidates.length > 0) {
      const top = candidates[0];
      const pct = Math.round((top.aiSlots / (top.aiSlots + top.nonAiSlots)) * 100);
      chips.push({
        text: `${top.appName} is your strongest AI app — ${pct}% AI-credited`,
        color: colors.cyan,
      });
    }
  }

  // ── Rule 3: BrainLift app highlight ───────────────────────────────────────
  // Find app with highest brainliftSlots AND brainliftSlots >= 3
  if (chips.length < 3) {
    const candidates = aggregated
      .filter(e => e.brainliftSlots >= 3)
      .sort((a, b) => b.brainliftSlots - a.brainliftSlots);

    if (candidates.length > 0) {
      const top = candidates[0];
      chips.push({
        text: `${top.appName} drives most of your BrainLift time — keep it up`,
        color: colors.violet,
      });
    }
  }

  // ── Rule 4: AI progress this week ─────────────────────────────────────────
  // Only evaluate if currentWeek has total AI slots > 0
  if (chips.length < 3 && currentWeek.length > 0) {
    const weekTotalAi = currentWeek.reduce((sum, e) => sum + e.aiSlots, 0);
    if (weekTotalAi > 0) {
      const weekPct = computeAIPct(currentWeek);
      const aggPct = computeAIPct(aggregated);

      if (weekPct > aggPct + 5) {
        chips.push({
          text: `You're above your 12-week average this week`,
          color: colors.success,
        });
      } else if (weekPct < aggPct - 5) {
        chips.push({
          text: `Slower AI week — still time to close the gap`,
          color: colors.warning,
        });
      }
    }
  }

  return chips;
}
