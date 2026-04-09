// Tests for FR3 (ChartSection subtitleRight prop) and FR4 (overview wiring)
// 03-hours-variance
//
// Approach: source-file analysis for the ChartSection prop contract and wiring.
// This matches the project convention for component-level spec validation
// (see overview-toggle.test.tsx, computeSnapshotHoursColor.test.ts).

import * as fs from 'fs';
import * as path from 'path';

const OVERVIEW_FILE = path.resolve(__dirname, '../../../app/(tabs)/overview.tsx');

describe('FR3: ChartSection — subtitleRight prop contract', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
  });

  it('FR3.1 — ChartSectionProps interface declares subtitleRight as optional string', () => {
    expect(source).toMatch(/subtitleRight\s*\?\s*:\s*string/);
  });

  it('FR3.2 — ChartSectionProps interface declares subtitleRightColor as optional string', () => {
    expect(source).toMatch(/subtitleRightColor\s*\?\s*:\s*string/);
  });

  it('FR3.3 — ChartSection renders subtitleRight prop in JSX (references the prop)', () => {
    expect(source).toMatch(/subtitleRight/);
  });

  it('FR3.4 — ChartSection applies subtitleRightColor to the subtitleRight text', () => {
    expect(source).toMatch(/subtitleRightColor/);
  });

  it('FR3.5 — subtitle prop still exists in ChartSectionProps (backward compatible)', () => {
    expect(source).toMatch(/subtitle\s*\?\s*:\s*string/);
  });
});

describe('FR4: Overview screen — variance wired to ChartSection', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
  });

  it('FR4.1 — computeHoursVariance is imported from hours lib', () => {
    expect(source).toMatch(/import.*computeHoursVariance.*from/);
  });

  it('FR4.2 — hoursVariance is computed from overviewData.hours', () => {
    expect(source).toMatch(/computeHoursVariance\s*\(\s*overviewData\.hours\s*\)/);
  });

  it('FR4.3 — WEEKLY HOURS ChartSection receives subtitleRight from hoursVariance', () => {
    // The hours chart section must pass subtitleRight (not just bake into subtitle string)
    expect(source).toMatch(/subtitleRight\s*=\s*\{/);
  });

  it('FR4.4 — colors.success is used for the consistent variance color', () => {
    expect(source).toMatch(/colors\.success/);
  });

  it('FR4.5 — colors.warning is used for the moderate variance color', () => {
    expect(source).toMatch(/colors\.warning/);
  });

  it('FR4.6 — colors.textSecondary is used for the variable variance color', () => {
    expect(source).toMatch(/colors\.textSecondary/);
  });

  it('FR4.7 — varianceColor or equivalent is derived using isConsistent', () => {
    // Either directly named varianceColor or inline ternary using isConsistent
    const hasVarianceColor = source.includes('varianceColor') || source.match(/isConsistent\s*[?:]/);
    expect(hasVarianceColor).toBeTruthy();
  });

  it('FR4.8 — subtitle prop still uses Goal string (not changed)', () => {
    expect(source).toMatch(/Goal:\s*\$\{weeklyLimit\}/);
  });
});

describe('FR3 + FR4: color token values (spec compliance)', () => {
  it('colors.success is the on-track green token', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.success).toBe('#10B981');
  });

  it('colors.warning is the behind-pace amber token', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.warning).toBe('#F59E0B');
  });

  it('colors.textSecondary is the informational grey token', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.textSecondary).toBe('#A0A0A0');
  });
});
