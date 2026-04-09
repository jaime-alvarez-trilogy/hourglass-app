/**
 * ScrubCursor — pure utility for building Skia cursor geometry.
 *
 * Used inside Skia Canvas components to render a scrub cursor:
 * - A vertical line from (scrubX, topPadding) to (scrubX, chartHeight - topPadding)
 * - A filled dot at the snapped data point (scrubX, scrubY)
 *
 * Usage inside a Canvas:
 *   const cursor = buildScrubCursor(scrubX, scrubY, chartHeight, padding);
 *   <Path path={cursor.linePath} color={colors.textMuted} opacity={0.5} strokeWidth={1} style="stroke" />
 *   <Circle cx={cursor.dotX} cy={cursor.dotY} r={cursor.dotRadius} color={seriesColor} />
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

export interface ScrubCursorResult {
  /** Vertical line path from top to bottom of chart drawable area */
  linePath: SkPath;
  /** X pixel of the snapped data point (equals scrubX) */
  dotX: number;
  /** Y pixel of the snapped data point (equals scrubY) */
  dotY: number;
  /** Fixed dot radius: always 4 */
  dotRadius: number;
}

/**
 * buildScrubCursor — compute cursor geometry for a given scrub position.
 *
 * @param scrubX       - pixel X of the snapped data point
 * @param scrubY       - pixel Y of the snapped data point
 * @param chartHeight  - total canvas height in pixels
 * @param topPadding   - top (and bottom) padding inside the chart
 */
export function buildScrubCursor(
  scrubX: number,
  scrubY: number,
  chartHeight: number,
  topPadding: number,
): ScrubCursorResult {
  const linePath = Skia.Path.Make();
  linePath.moveTo(scrubX, topPadding);
  linePath.lineTo(scrubX, chartHeight - topPadding);

  return {
    linePath,
    dotX: scrubX,
    dotY: scrubY,
    dotRadius: 4,
  };
}
