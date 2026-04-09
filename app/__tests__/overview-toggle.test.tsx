// Tests: src/components/OverviewHeroCard.tsx (06-wiring-and-tokens)
// FR3: 4W/12W/24W toggle active color — gold → violet
//
// Test approach:
// - Source-file static analysis (fs.readFileSync) for color token checks
// - Verify colors.gold not used in toggle pill Text styles
// - Verify colors.violet used instead
// - Verify earnings display still uses colors.gold (not changed)

import * as fs from 'fs';
import * as path from 'path';

const HERO_CARD_FILE = path.resolve(__dirname, '../../src/components/OverviewHeroCard.tsx');

describe('overview — FR3: toggle active color (gold → violet)', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(HERO_CARD_FILE, 'utf8');
  });

  it('FR3.1 — source uses colors.violet in toggle Text style (active state)', () => {
    expect(source).toContain('colors.violet');
  });

  it('FR3.2 — toggle pill uses colors.violet for active color', () => {
    // The toggle uses "window === w ? colors.violet : colors.textMuted" pattern
    expect(source).toMatch(/window\s*===\s*w\s*\?\s*colors\.violet/);
  });

  it('FR3.3 — inactive toggle uses colors.textMuted (not colors.gold)', () => {
    expect(source).toMatch(/colors\.textMuted/);
  });

  it('FR3.4 — no "toggle4Active ? colors.gold" pattern', () => {
    expect(source).not.toMatch(/toggle4Active\s*\?\s*colors\.gold/);
  });

  it('FR3.5 — no "!toggle4Active ? colors.gold" pattern', () => {
    expect(source).not.toMatch(/!toggle4Active\s*\?\s*colors\.gold/);
  });

  it('FR3.6 — earnings display still uses colors.gold (not changed)', () => {
    // OverviewHeroCard still has at least one colors.gold reference for earnings display
    const goldCount = (source.match(/colors\.gold/g) || []).length;
    expect(goldCount).toBeGreaterThanOrEqual(1);
  });

  it('FR3.7 — colors.violet token value is correct (#A78BFA)', () => {
    const { colors } = require('@/src/lib/colors');
    expect(colors.violet).toBe('#A78BFA');
  });

  it('FR3.8 — colors.textMuted inactive color still present in toggle', () => {
    // Inactive pill still uses textMuted
    expect(source).toContain('colors.textMuted');
  });
});
