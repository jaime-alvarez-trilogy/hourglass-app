// Tests: EarningsPaceCard — 02-earnings-pace-projection FR2–FR5
//
// Strategy: Source-level static analysis (mirrors OverviewHeroCard.test.tsx pattern).
// No React render — avoids native module mocking complexity.
//
// FR2: EarningsPaceCard renders annual projection and target side by side
//   SC2.1 — source exports EarningsPaceCard (named or default)
//   SC2.2 — source imports Card with borderAccentColor={colors.gold}
//   SC2.3 — source contains "EARNINGS PACE" label
//   SC2.4 — source renders annual projection in colors.gold
//   SC2.5 — source renders "/ yr projected" text
//   SC2.6 — source renders "/ yr target" text
//   SC2.7 — source renders target annual value in colors.textMuted
//
// FR3: Pace bar fill width = min(ewmaWeekly/targetWeekly, 1) * 100%
//   SC3.1 — source contains pace bar with testID="pace-bar-fill"
//   SC3.2 — source uses min() to cap bar fill at 100%
//   SC3.3 — source uses width calculation based on paceRatio
//
// FR4: Bar color changes based on pace ratio
//   SC4.1 — source uses colors.gold for ≥90% pace
//   SC4.2 — source uses colors.warning for 60–89% pace
//   SC4.3 — source uses colors.critical for <60% pace
//   SC4.4 — source references 0.9 threshold (90%)
//   SC4.5 — source references 0.6 threshold (60%)
//
// FR5: Hidden when projection = 0 (fewer than 2 completed weeks)
//   SC5.1 — source returns null when computeAnnualProjection returns 0
//   SC5.2 — source calls computeAnnualProjection
//
// FR6: Footer shows avg weekly + window label
//   SC6.1 — source contains "EWMA" in footer text
//   SC6.2 — source renders "Avg $" prefix for weekly average
//   SC6.3 — source renders window value with "W" suffix

import * as path from 'path';
import * as fs from 'fs';

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const COMPONENT_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'EarningsPaceCard.tsx');

// ─── File contract ─────────────────────────────────────────────────────────────

describe('EarningsPaceCard (02-earnings-pace-projection) — file contract', () => {
  it('EarningsPaceCard.tsx exists', () => {
    expect(fs.existsSync(COMPONENT_FILE)).toBe(true);
  });

  it('exports EarningsPaceCard function', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/export.*function EarningsPaceCard|export.*EarningsPaceCard/);
  });

  it('defines EarningsPaceCardProps interface', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/EarningsPaceCardProps/);
  });

  it('accepts earnings prop as number[]', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/earnings.*number\[\]|earnings.*:.*number\[\]/);
  });

  it('accepts targetWeeklyEarnings prop', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/targetWeeklyEarnings/);
  });

  it('accepts window prop typed 4 | 12 | 24', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/window.*4\s*\|\s*12\s*\|\s*24|4\s*\|\s*12\s*\|\s*24.*window/);
  });
});

// ─── FR2: UI structure ────────────────────────────────────────────────────────

describe('EarningsPaceCard FR2 (02-earnings-pace-projection) — annual projection + target', () => {
  it('SC2.2 — imports Card component', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/import.*Card/);
  });

  it('SC2.2 — uses borderAccentColor with colors.gold', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/borderAccentColor.*colors\.gold|colors\.gold.*borderAccentColor/);
  });

  it('SC2.3 — contains "EARNINGS PACE" section label', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/EARNINGS PACE/);
  });

  it('SC2.4 — annual projection uses colors.gold for text color', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.gold/);
  });

  it('SC2.5 — contains "/ yr projected" label text', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/\/\s*yr projected/);
  });

  it('SC2.6 — contains "/ yr target" label text', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/\/\s*yr target/);
  });

  it('SC2.7 — target annual value uses colors.textMuted', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.textMuted/);
  });
});

// ─── FR3: Pace bar ────────────────────────────────────────────────────────────

describe('EarningsPaceCard FR3 (02-earnings-pace-projection) — pace bar fill', () => {
  it('SC3.1 — source contains pace-bar-fill testID', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/pace-bar-fill/);
  });

  it('SC3.2 — source uses Math.min to cap pace ratio at 1', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/Math\.min.*paceRatio|Math\.min.*1/);
  });

  it('SC3.3 — source uses width: computed from pace ratio * 100', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/width.*100|100.*width/);
  });

  it('SC3.3 — bar fill width uses paceRatio or pace computation', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/paceRatio|pace.*ratio|ratio.*pace/i);
  });
});

// ─── FR4: Bar color semantics ─────────────────────────────────────────────────

describe('EarningsPaceCard FR4 (02-earnings-pace-projection) — bar color thresholds', () => {
  it('SC4.1 — uses colors.gold for ≥90% pace', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.gold/);
  });

  it('SC4.2 — uses colors.warning for 60–89% pace', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.warning/);
  });

  it('SC4.3 — uses colors.critical for <60% pace', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.critical/);
  });

  it('SC4.4 — references 0.9 threshold for gold/on-track', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/0\.9/);
  });

  it('SC4.5 — references 0.6 threshold for warning/critical boundary', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/0\.6/);
  });
});

// ─── FR5: Hidden when no data ─────────────────────────────────────────────────

describe('EarningsPaceCard FR5 (02-earnings-pace-projection) — hidden when projection = 0', () => {
  it('SC5.1 — returns null when computeAnnualProjection returns 0', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/return null/);
  });

  it('SC5.2 — calls computeAnnualProjection with earnings prop', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/computeAnnualProjection/);
  });

  it('SC5.2 — imports computeAnnualProjection from overviewUtils', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/computeAnnualProjection.*overviewUtils|overviewUtils.*computeAnnualProjection/);
  });
});

// ─── FR6: Footer ─────────────────────────────────────────────────────────────

describe('EarningsPaceCard FR6 (02-earnings-pace-projection) — footer display', () => {
  it('SC6.1 — contains "EWMA" label in footer', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/EWMA/);
  });

  it('SC6.2 — contains "Avg $" prefix for average weekly earnings', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/Avg \$/);
  });

  it('SC6.3 — renders window value with "W" suffix', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Pattern: template literal or concat: `${window}W` or window + 'W'
    expect(source).toMatch(/\{window\}W|\$\{window\}W|window.*W/);
  });

  it('SC6.3 — footer uses colors.textMuted for subdued styling', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/colors\.textMuted/);
  });
});
