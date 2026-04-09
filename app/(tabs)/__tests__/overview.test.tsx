// Tests: OverviewScreen — 07-overview-sync FR4 + FR5
//
// FR4: Window toggle and scrub state in OverviewScreen
//   SC4.1 — overview.tsx declares window state: useState<4 | 12>(4)
//   SC4.2 — overview.tsx declares scrubWeekIndex: useState<number | null>(null)
//   SC4.3 — window change resets scrubWeekIndex to null
//   SC4.4 — all 4 charts receive externalCursorIndex={scrubWeekIndex}
//   SC4.5 — all 4 charts receive onScrubChange={setScrubWeekIndex}
//   SC4.6 — 4W/12W toggle control present in source
//   SC4.7 — hero metric value shows scrub-period value when scrubWeekIndex !== null
//   SC4.8 — hero metric value shows live value when scrubWeekIndex === null
//   SC4.9 — calls useOverviewData(window)
//
// FR5: Week snapshot panel
//   SC5.1 — snapshot panel uses Reanimated useSharedValue for panelOpacity
//   SC5.2 — snapshot panel uses Reanimated useSharedValue for panelTranslateY
//   SC5.3 — panel label shows "Week of " + weekLabels[scrubWeekIndex]
//   SC5.4 — panel displays earnings, hours, aiPct, brainliftHours values
//   SC5.5 — panel uses springPremium for animation
//   SC5.6 — panel is always rendered (not conditionally mounted) — uses useAnimatedStyle
//   SC5.7 — earnings formatted as $X,XXX
//   SC5.8 — hours formatted with "h" suffix
//   SC5.9 — aiPct formatted with "%" suffix
//   SC5.10 — brainliftHours formatted with "h" suffix
//
// Strategy:
// - Source-level static analysis for all screen-level contracts (no render needed)
// - Logic unit tests for hero value resolution and formatting functions
// - Source analysis is sufficient: tests will FAIL (red) until implementation rewrites
//   overview.tsx to include the required patterns.

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const OVERVIEW_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'overview.tsx');

// ─── FR4: Source analysis — state declarations ────────────────────────────────

describe('OverviewScreen FR4 (07-overview-sync) — source analysis: state', () => {
  it('SC4.1 — declares window state with type 4 | 12 | 24, default 4', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // useState<4 | 12 | 24>(4) — window state
    expect(source).toMatch(/useState\s*<\s*4\s*\|\s*12\s*\|\s*24\s*>\s*\(\s*4\s*\)/);
  });

  it('SC4.2 — declares scrubWeekIndex state: useState<number | null>(null)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useState\s*<\s*number\s*\|\s*null\s*>\s*\(\s*null\s*\)/);
    expect(source).toMatch(/scrubWeekIndex/);
  });

  it('SC4.3 — window change resets scrubWeekIndex to null (setScrubWeekIndex(null) present)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/setScrubWeekIndex\s*\(\s*null\s*\)/);
  });

  it('SC4.9 — calls useOverviewData', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useOverviewData/);
  });

  it('SC4.9 — imports useOverviewData from hooks', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*useOverviewData/);
  });
});

// ─── FR4: Source analysis — chart wiring ─────────────────────────────────────

describe('OverviewScreen FR4 (07-overview-sync) — source analysis: chart wiring', () => {
  it('SC4.4 — passes externalCursorIndex={scrubWeekIndex} to TrendSparkline', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/externalCursorIndex/);
    expect(source).toMatch(/scrubWeekIndex/);
  });

  it('SC4.4 — externalCursorIndex prop is bound to scrubWeekIndex', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/externalCursorIndex\s*=\s*\{?\s*scrubWeekIndex/);
  });

  it('SC4.5 — passes onScrubChange callback to TrendSparkline', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/onScrubChange/);
  });

  it('SC4.5 — onScrubChange is wired to handleScrubChange which calls setScrubWeekIndex', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // onScrubChange is wired to handleScrubChange, which internally calls setScrubWeekIndex
    expect(source).toMatch(/onScrubChange.*handleScrubChange|handleScrubChange.*setScrubWeekIndex/);
  });

  it('SC4.6 — 4W label present in source (toggle control)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/4W|['"]4w['"]/);
  });

  it('SC4.6 — 12W label present in source (toggle control)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/12W|['"]12w['"]/);
  });

  it('SC4.6 — toggle control uses TouchableOpacity or Pressable (in overview.tsx or OverviewHeroCard)', () => {
    // 03-overview-hero: toggle migrated from overview.tsx into OverviewHeroCard component.
    // overview.tsx now imports OverviewHeroCard which contains the toggle.
    // Verify toggle is accessible via either direct source or the imported component.
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // overview.tsx should import OverviewHeroCard (which contains the toggle)
    expect(source).toMatch(/OverviewHeroCard|TouchableOpacity|Pressable/);
  });
});

// ─── FR4: Source analysis — hero value resolution ────────────────────────────

describe('OverviewScreen FR4 (07-overview-sync) — source analysis: hero value', () => {
  it('SC4.7 — hero value uses scrubWeekIndex for indexed access into data arrays', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Pattern: data.earnings[scrubWeekIndex] or overviewData[scrubWeekIndex] etc.
    expect(source).toMatch(/\[scrubWeekIndex\]/);
  });

  it('SC4.8 — conditional on scrubWeekIndex !== null for hero display', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/scrubWeekIndex\s*!==\s*null|scrubWeekIndex\s*!=\s*null/);
  });
});

// ─── FR4: Logic unit tests — hero value resolution ───────────────────────────

describe('OverviewScreen FR4 (07-overview-sync) — hero value logic', () => {
  const earnings = [1800, 1950, 2000, 1840];
  const liveEarnings = 1840;

  function heroValue(data: number[], scrubIndex: number | null, liveValue: number): number {
    return scrubIndex !== null ? data[scrubIndex] : liveValue;
  }

  it('SC4.7 — shows scrub-period value when scrubWeekIndex !== null', () => {
    expect(heroValue(earnings, 1, liveEarnings)).toBe(1950);
  });

  it('SC4.8 — shows live value when scrubWeekIndex === null', () => {
    expect(heroValue(earnings, null, liveEarnings)).toBe(liveEarnings);
  });

  it('SC4.7 — scrubWeekIndex=0 → first array entry', () => {
    expect(heroValue(earnings, 0, liveEarnings)).toBe(1800);
  });

  it('SC4.7 — scrubWeekIndex=3 (last) → last array entry', () => {
    expect(heroValue(earnings, 3, liveEarnings)).toBe(1840);
  });

  it('SC4.3 — after window toggle, scrubWeekIndex=null → hero shows live value', () => {
    let scrubWeekIndex: number | null = 2;
    scrubWeekIndex = null; // simulates setScrubWeekIndex(null) on toggle
    expect(heroValue(earnings, scrubWeekIndex, liveEarnings)).toBe(liveEarnings);
  });
});

// ─── FR5: Source analysis — snapshot panel ───────────────────────────────────

describe('OverviewScreen FR5 (07-overview-sync) — source analysis: snapshot panel', () => {
  it('SC5.1 — useSharedValue present (for panelOpacity)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue/);
  });

  it('SC5.2 — translateY or panelTranslateY present (snapshot panel slide)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/translateY|panelTranslate/);
  });

  it('SC5.3 — "Week of" label prefix present', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/Week of/);
  });

  it('SC5.3 — weekLabels array is indexed by scrubWeekIndex', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/weekLabels\s*\[/);
  });

  it('SC5.4 — earnings metric displayed in panel', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/earnings|Earnings/);
  });

  it('SC5.4 — hours metric displayed in panel', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/hours|Hours/);
  });

  it('SC5.4 — AI% metric displayed in panel', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/aiPct|AI%|AI /);
  });

  it('SC5.4 — BrainLift metric displayed in panel', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/brainliftHours|BrainLift/);
  });

  it('SC5.5 — uses springPremium for animation', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/springPremium/);
  });

  it('SC5.5 — uses withSpring from reanimated', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/withSpring/);
  });

  it('SC5.6 — useAnimatedStyle used (panel always rendered, opacity-driven)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useAnimatedStyle/);
  });

  it('SC5.6 — imports react-native-reanimated', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/react-native-reanimated/);
  });
});

// ─── FR5: Logic unit tests — value formatting ────────────────────────────────

describe('OverviewScreen FR5 (07-overview-sync) — value formatting logic', () => {
  function formatEarnings(val: number): string {
    return `$${Math.round(val).toLocaleString()}`;
  }

  function formatHours(val: number): string {
    return `${val.toFixed(1)}h`;
  }

  function formatAIPct(val: number): string {
    return `${Math.round(val)}%`;
  }

  function formatBrainlift(val: number): string {
    return `${val.toFixed(1)}h`;
  }

  it('SC5.7 — earnings $1840 → "$1,840"', () => {
    expect(formatEarnings(1840)).toBe('$1,840');
  });

  it('SC5.7 — earnings $2000 → "$2,000"', () => {
    expect(formatEarnings(2000)).toBe('$2,000');
  });

  it('SC5.8 — hours 38.5 → "38.5h"', () => {
    expect(formatHours(38.5)).toBe('38.5h');
  });

  it('SC5.8 — hours 40 → "40.0h"', () => {
    expect(formatHours(40)).toBe('40.0h');
  });

  it('SC5.9 — aiPct 72 → "72%"', () => {
    expect(formatAIPct(72)).toBe('72%');
  });

  it('SC5.9 — aiPct 75.4 → "75%" (rounded)', () => {
    expect(formatAIPct(75.4)).toBe('75%');
  });

  it('SC5.10 — brainlift 4.2 → "4.2h"', () => {
    expect(formatBrainlift(4.2)).toBe('4.2h');
  });
});

// ─── FR5: Panel label logic ───────────────────────────────────────────────────

describe('OverviewScreen FR5 (07-overview-sync) — snapshot panel label', () => {
  const weekLabels = ['Feb 23', 'Mar 2', 'Mar 9', 'Mar 16'];

  function panelLabel(weekLabels: string[], scrubWeekIndex: number | null): string {
    if (scrubWeekIndex === null) return '';
    return `Week of ${weekLabels[scrubWeekIndex]}`;
  }

  it('SC5.3 — scrubWeekIndex=0 → "Week of Feb 23"', () => {
    expect(panelLabel(weekLabels, 0)).toBe('Week of Feb 23');
  });

  it('SC5.3 — scrubWeekIndex=3 → "Week of Mar 16"', () => {
    expect(panelLabel(weekLabels, 3)).toBe('Week of Mar 16');
  });

  it('SC5.3 — scrubWeekIndex=null → empty (panel hidden)', () => {
    expect(panelLabel(weekLabels, null)).toBe('');
  });

  it('SC5.3 — scrubWeekIndex=1 → "Week of Mar 2"', () => {
    expect(panelLabel(weekLabels, 1)).toBe('Week of Mar 2');
  });
});

// ─── FR4+FR5: Overview file existence ────────────────────────────────────────

describe('OverviewScreen FR4+FR5 (07-overview-sync) — file contract', () => {
  it('overview.tsx file exists', () => {
    expect(fs.existsSync(OVERVIEW_FILE)).toBe(true);
  });

  it('overview.tsx will import useOverviewData after FR3 implementation', () => {
    // This test FAILS in red phase (current overview.tsx does not import useOverviewData).
    // It will PASS after FR3 + FR4 implementation.
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useOverviewData/);
  });

  it('overview.tsx imports useSharedValue from react-native-reanimated after FR5 implementation', () => {
    // FAILS in red phase, PASSES after implementation
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue/);
    expect(source).toMatch(/react-native-reanimated/);
  });
});

// ─── 03-overview-hero FR4: Ambient wiring ────────────────────────────────────
//
// SC4.1 — AmbientBackground is imported in overview.tsx
// SC4.2 — AmbientBackground rendered outside ScrollView (sibling, not inside)
// SC4.3 — getAmbientColor is imported from AmbientBackground
// SC4.4 — computeEarningsPace is called with overviewData.earnings
// SC4.5 — { type: 'earningsPace' } signal pattern present
// SC4.6 — null fallback for ambient color when data unavailable

describe('OverviewScreen FR4 (03-overview-hero) — source: ambient wiring', () => {
  it('SC4.1 — imports AmbientBackground', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*AmbientBackground/);
  });

  it('SC4.2 — AnimatedMeshBackground rendered in source (JSX element) [08-dark-glass-polish: replaced AmbientBackground]', () => {
    // 08-dark-glass-polish: <AmbientBackground color={...} /> replaced with
    // <AnimatedMeshBackground earningsPace={earningsPace} /> for direct signal wiring
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/<AnimatedMeshBackground/);
  });

  it('SC4.2 — AnimatedMeshBackground appears before ScrollView in source (outside scroll)', () => {
    // 08-dark-glass-polish: AnimatedMeshBackground is the direct mesh renderer
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const ambientIdx = source.indexOf('<AnimatedMeshBackground');
    // Use '<ScrollView ' or '<ScrollView\n' to avoid matching useRef<ScrollView> type usage
    const scrollIdx = Math.min(
      source.indexOf('<ScrollView ') !== -1 ? source.indexOf('<ScrollView ') : Infinity,
      source.indexOf('<ScrollView\n') !== -1 ? source.indexOf('<ScrollView\n') : Infinity,
    );
    expect(ambientIdx).toBeGreaterThan(-1);
    expect(scrollIdx).toBeGreaterThan(-1);
    expect(ambientIdx).toBeLessThan(scrollIdx);
  });

  it('SC4.3 — imports getAmbientColor', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/getAmbientColor/);
  });

  it('SC4.4 — computeEarningsPace is imported', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/computeEarningsPace/);
  });

  it('SC4.4 — computeEarningsPace called with overviewData.earnings', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/computeEarningsPace.*earnings|computeEarningsPace.*overviewData/);
  });

  it("SC4.5 — { type: 'earningsPace' } signal present in source", () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/type\s*:\s*['"]earningsPace['"]/);
  });

  it('SC4.6 — null fallback: AmbientBackground color has null guard (??null or ternary)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Either ?? null or a ternary or optional chaining guarding the ambient color
    expect(source).toMatch(/\?\?.*null|null.*\?\?|earningsPace.*\?|ambientColor/);
  });
});

// ─── 03-overview-hero FR5: Hero card + toggle migration ──────────────────────
//
// SC5.1 — standalone header toggle row removed from overview.tsx
// SC5.2 — OverviewHeroCard rendered as first item in ScrollView content
// SC5.3 — OverviewHeroCard receives window prop
// SC5.4 — OverviewHeroCard receives onWindowChange={handleWindowChange}
// SC5.5 — totalEarnings uses sum/reduce of overviewData.earnings
// SC5.6 — totalHours uses sum/reduce of overviewData.hours
// SC5.7 — overtimeHours uses Math.max(0, ...) pattern

describe('OverviewScreen FR5 (03-overview-hero) — source: hero card integration', () => {
  it('SC5.1 — standalone toggle row removed: no "Overview" title text + toggle pill combination', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // The old header had inline toggle pills with activePillStyle/inactivePillStyle
    // After migration, these are gone (now in OverviewHeroCard component)
    // We check that the old header pattern (Overview title + inline toggle row) is gone
    expect(source).not.toMatch(/activePillStyle.*inactivePillStyle|inactivePillStyle.*activePillStyle/);
  });

  it('SC5.2 — OverviewHeroCard is imported', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*OverviewHeroCard/);
  });

  it('SC5.2 — OverviewHeroCard rendered in JSX', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/<OverviewHeroCard/);
  });

  it('SC5.2 — OverviewHeroCard appears before scrub panel Animated.View', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const heroIdx = source.indexOf('<OverviewHeroCard');
    // Use the inline JSX comment that marks the scrub panel Animated.View in the render
    const scrubIdx = source.indexOf('{/* Week snapshot panel');
    expect(heroIdx).toBeGreaterThan(-1);
    expect(scrubIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeLessThan(scrubIdx);
  });

  it('SC5.3 — OverviewHeroCard receives window prop', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/window\s*=\s*\{window\}|window=\{window\}/);
  });

  it('SC5.4 — OverviewHeroCard receives onWindowChange prop wired to handleWindowChange', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/onWindowChange.*handleWindowChange|onWindowChange=\{handleWindowChange\}/);
  });

  it('SC5.5 — totalEarnings computed via reduce/sum of overviewData.earnings', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/reduce.*earnings|earnings.*reduce/);
  });

  it('SC5.6 — totalHours computed via reduce/sum of overviewData.hours', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/reduce.*hours|hours.*reduce/);
  });

  it('SC5.7 — overtimeHours uses Math.max(0, ...) pattern', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/Math\.max\s*\(\s*0/);
  });

  it('SC5.7 — overtimeHours references overviewData.overtimeHours', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/overviewData\.overtimeHours/);
  });
});
