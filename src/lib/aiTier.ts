/**
 * aiTier.ts — AI usage percentage tier classification (10-mesh-color-overhaul FR3)
 *
 * Extracted from app/(tabs)/ai.tsx so both screen files and components can import it.
 * Previously, classifyAIPct lived in ai.tsx, which components cannot import from.
 *
 * Color tokens use the desaturated mesh palette from 10-mesh-color-overhaul:
 *   AI Leader:           infoBlue     (#60A5FA)  — was cyan #00C2FF
 *   Consistent Progress: successGreen (#4ADE80)  — was success #10B981
 *   Building Momentum:   warnAmber    (#FCD34D)  — was warning #F59E0B
 *   Getting Started:     textMuted    (#757575)  — unchanged
 */

import { colors } from './colors';

export interface AITier {
  label: string;
  color: string;
}

/**
 * Classifies an AI usage percentage into a performance tier.
 * Returns the tier label and associated UI accent color.
 *
 * @param avg - rolling average AI% (0–100)
 *
 * Tiers:
 *   >= 75 → 'AI Leader'           (infoBlue #60A5FA)
 *   >= 50 → 'Consistent Progress' (successGreen #4ADE80)
 *   >= 30 → 'Building Momentum'   (warnAmber #FCD34D)
 *    < 30 → 'Getting Started'     (textMuted #757575)
 */
export function classifyAIPct(avg: number): AITier {
  if (avg >= 75) return { label: 'AI Leader',           color: colors.infoBlue };
  if (avg >= 50) return { label: 'Consistent Progress', color: colors.successGreen };
  if (avg >= 30) return { label: 'Building Momentum',   color: colors.warnAmber };
  return             { label: 'Getting Started',        color: colors.textMuted };
}
