// useInsightChips.ts — 05-insights-ui FR2
// Composing hook that assembles up to 3 insight chips in priority order.

import { usePrescription } from './usePrescription';
import { useAIInsights } from './useAIInsights';
import {
  formatPrescriptionChip,
  formatTrendChip,
  formatCorrelationChip,
} from '../lib/insightFormatting';
import type { InsightChipData } from '../lib/insightFormatting';

/**
 * Assembles up to 3 insight chips in priority order (pace → AI trend → BrainLift
 * correlation). Composes usePrescription() + useAIInsights(). Returns [] when no
 * insight is available (caller hides the whole section). Never longer than 3.
 */
export function useInsightChips(): InsightChipData[] {
  const p = usePrescription();
  const ai = useAIInsights();

  const chips: InsightChipData[] = [];

  if (p) chips.push(formatPrescriptionChip(p));

  const t = formatTrendChip(ai.trend, ai.best);
  if (t) chips.push(t);

  if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));

  return chips.slice(0, 3);
}
