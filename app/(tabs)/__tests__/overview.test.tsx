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
const STICKY_BAR_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'OverviewStickyBar.tsx');

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
  it('SC5.1 — useSharedValue present in OverviewStickyBar (panel animation delegated)', () => {
    const source = fs.readFileSync(STICKY_BAR_FILE, 'utf8');
    expect(source).toMatch(/useSharedValue/);
  });

  it('SC5.2 — translateY present in OverviewStickyBar (panel slide animation)', () => {
    const source = fs.readFileSync(STICKY_BAR_FILE, 'utf8');
    expect(source).toMatch(/translateY|barTranslateY/);
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

  it('SC5.5 — OverviewStickyBar uses springSnappy for animation', () => {
    const source = fs.readFileSync(STICKY_BAR_FILE, 'utf8');
    expect(source).toMatch(/springSnappy/);
  });

  it('SC5.5 — OverviewStickyBar uses withSpring from reanimated', () => {
    const source = fs.readFileSync(STICKY_BAR_FILE, 'utf8');
    expect(source).toMatch(/withSpring/);
  });

  it('SC5.6 — OverviewStickyBar uses useAnimatedStyle (panel always rendered, opacity-driven)', () => {
    const source = fs.readFileSync(STICKY_BAR_FILE, 'utf8');
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

  it('overview.tsx imports OverviewStickyBar (panel animation delegated to component)', () => {
    // FAILS in red phase, PASSES after implementation
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*OverviewStickyBar/);
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

  it('SC5.2 — OverviewHeroCard appears before OverviewStickyBar in render', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const heroIdx = source.indexOf('<OverviewHeroCard');
    // OverviewStickyBar is the floating panel that replaced the inline Animated.View panel
    const stickyIdx = source.indexOf('<OverviewStickyBar');
    expect(heroIdx).toBeGreaterThan(-1);
    expect(stickyIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeLessThan(stickyIdx);
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

// ─── 04-overview-integration: HourlyPatternCard wiring ───────────────────────
//
// FR1: imports HourlyPatternCard and useHourlyInsights
// FR2: stagger count incremented from 7 to 8
// FR3: useHourlyInsights() called unconditionally at top level
// FR4: HourlyPatternCard rendered conditionally after WORK PATTERN block
//   SC4.a — when profile null → HourlyPatternCard JSX absent
//   SC4.b — when profile non-null → HourlyPatternCard JSX present
//   SC4.c — patternCardWidth passed as width
//   SC4.d — no double Card wrap (component self-wraps)
//
// Strategy: source-level static analysis (consistent with other tests in this file).
// Tests will FAIL (red) until the 4 FRs are wired into overview.tsx.

describe('OverviewScreen (04-overview-integration) — FR1: imports', () => {
  it('FR1 — imports HourlyPatternCard from @/src/components/HourlyPatternCard', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*HourlyPatternCard.*from.*src\/components\/HourlyPatternCard/);
  });

  it('FR1 — imports useHourlyInsights from @/src/hooks/useHourlyInsights', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import.*useHourlyInsights.*from.*src\/hooks\/useHourlyInsights/);
  });
});

describe('OverviewScreen (04-overview-integration) — FR2: stagger count', () => {
  it('FR2 — useStaggeredEntry count is 8 (incremented from 7)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*8\s*\}\s*\)/);
  });

  it('FR2 — stagger count 7 is no longer used (replaced by 8)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // count: 7 should not appear after increment
    expect(source).not.toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*7\s*\}\s*\)/);
  });
});

describe('OverviewScreen (04-overview-integration) — FR3: hook call', () => {
  it('FR3 — calls useHourlyInsights() and destructures profile, focusWindow, aiHotZone', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Must destructure profile (aliased to hourlyProfile) from useHourlyInsights()
    expect(source).toMatch(/useHourlyInsights\s*\(\s*\)/);
  });

  it('FR3 — hourlyProfile variable declared via destructuring from useHourlyInsights', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // profile aliased as hourlyProfile: { profile: hourlyProfile, ... } = useHourlyInsights()
    expect(source).toMatch(/profile\s*:\s*hourlyProfile/);
  });

  it('FR3 — focusWindow destructured from useHourlyInsights', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/focusWindow/);
  });

  it('FR3 — aiHotZone destructured from useHourlyInsights', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/aiHotZone/);
  });
});

describe('OverviewScreen (04-overview-integration) — FR4: conditional render', () => {
  it('FR4 — HourlyPatternCard JSX element present in source', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/<HourlyPatternCard/);
  });

  it('FR4 — HourlyPatternCard render guarded by hourlyProfile truthiness', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // Pattern: {hourlyProfile && ( or {hourlyProfile ? (
    expect(source).toMatch(/hourlyProfile\s*&&|hourlyProfile\s*\?/);
  });

  it('FR4 — HourlyPatternCard rendered at stagger index 7 (getEntryStyle(7))', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/getEntryStyle\s*\(\s*7\s*\)/);
  });

  it('FR4 — HourlyPatternCard receives profile={hourlyProfile}', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/profile\s*=\s*\{hourlyProfile\}/);
  });

  it('FR4 — HourlyPatternCard receives focusWindow prop', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/focusWindow\s*=\s*\{focusWindow\}/);
  });

  it('FR4 — HourlyPatternCard receives aiHotZone prop', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/aiHotZone\s*=\s*\{aiHotZone\}/);
  });

  it('FR4 — HourlyPatternCard receives width={patternCardWidth} (reuses existing measurement)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/width\s*=\s*\{patternCardWidth\}/);
  });

  it('FR4 — HourlyPatternCard placed after WORK PATTERN block (DayPatternChart appears before HourlyPatternCard in source)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const dayPatternIdx = source.indexOf('<DayPatternChart');
    const hourlyCardIdx = source.indexOf('<HourlyPatternCard');
    expect(dayPatternIdx).toBeGreaterThan(-1);
    expect(hourlyCardIdx).toBeGreaterThan(-1);
    expect(dayPatternIdx).toBeLessThan(hourlyCardIdx);
  });

  it('FR4 — no double Card wrap: Card not present as direct parent of HourlyPatternCard in source', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    // HourlyPatternCard self-wraps with Card. Verify integration does not add <Card> immediately before it.
    // Extract a window around <HourlyPatternCard and verify <Card> is not in the preceding 200 chars
    const idx = source.indexOf('<HourlyPatternCard');
    if (idx === -1) {
      // Component not yet rendered — test will effectively pass this check; the presence test above catches the missing element
      return;
    }
    const preceding = source.slice(Math.max(0, idx - 200), idx);
    // Must NOT have an unclosed <Card> immediately before HourlyPatternCard
    expect(preceding).not.toMatch(/<Card[^>]*>\s*$/);
  });
});

// ─── 04-team-view-content: FR1 — scope gate for managers ─────────────────────
//
// FR1: useIsManager() replaces the inline manager expression; scope state is
// added; OverviewStickyBar receives scope/onScopeChange/orgTierEnabled only
// for managers.
//
// Strategy: source-level static analysis, consistent with the rest of this file.

describe('OverviewScreen FR1 (04-team-view-content) — useIsManager adoption', () => {
  it('imports useIsManager from @/src/hooks/useIsManager', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/import\s*\{\s*useIsManager\s*\}\s*from\s*['"]@\/src\/hooks\/useIsManager['"]/);
  });

  it('isManager is derived from useIsManager(), not the inline expression', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/isManager\s*=\s*useIsManager\s*\(\s*\)/);
    // The old duplicated expression must be gone from overview.tsx
    expect(source).not.toMatch(
      /config\?\.isManager\s*===\s*true\s*\|\|\s*config\?\.devManagerView\s*===\s*true/,
    );
  });

  it('still calls useConfig() (personal settings + orgTierEnabled still needed)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/const\s*\{\s*config\s*\}\s*=\s*useConfig\s*\(\s*\)/);
  });
});

describe('OverviewScreen FR1 (04-team-view-content) — scope state', () => {
  it('declares scope state: useState<\'personal\' | \'team\'>(\'personal\')', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(
      /useState\s*<\s*['"]personal['"]\s*\|\s*['"]team['"]\s*>\s*\(\s*['"]personal['"]\s*\)/,
    );
  });

  it('scope state is not persisted (no AsyncStorage/SecureStore reference near scope declaration)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const idx = source.search(/\[\s*scope\s*,\s*setScope\s*\]/);
    expect(idx).toBeGreaterThan(-1);
    // A 200-char window around the declaration must not reference persistence APIs —
    // FR1 requires scope to remain local, non-persisted state.
    const windowStart = Math.max(0, idx - 100);
    const nearby = source.slice(windowStart, idx + 100);
    expect(nearby).not.toMatch(/AsyncStorage|SecureStore/);
  });
});

describe('OverviewScreen FR1 (04-team-view-content) — OverviewStickyBar scope wiring', () => {
  it('passes scope prop conditioned on isManager', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/scope\s*=\s*\{\s*isManager\s*\?\s*scope\s*:\s*undefined\s*\}/);
  });

  it('passes onScopeChange prop conditioned on isManager', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/onScopeChange\s*=\s*\{\s*isManager\s*\?\s*setScope\s*:\s*undefined\s*\}/);
  });

  it('passes orgTierEnabled from config', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/orgTierEnabled\s*=\s*\{\s*config\?\.orgTierEnabled\s*\}/);
  });
});

// ─── 04-team-view-content: FR2 — personal/team scope branch ──────────────────
//
// FR2: scope === 'personal' renders the six pre-existing personal elements
// unchanged; scope === 'team' replaces them with TeamViewContent, which
// renders exactly three ChartSections sourced from useTeamAggregateData().

describe('OverviewScreen FR2 (04-team-view-content) — scope branching', () => {
  it('personal content is wrapped in a scope === \'personal\' conditional', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/scope\s*===\s*['"]personal['"]/);
  });

  it('WEEKLY EARNINGS chart appears after the personal-scope guard', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const guardIdx = source.search(/scope\s*===\s*['"]personal['"]/);
    const earningsIdx = source.indexOf('WEEKLY EARNINGS');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(earningsIdx).toBeGreaterThan(guardIdx);
  });

  it('defines a local TeamViewContent component', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/function\s+TeamViewContent/);
  });

  it('TeamViewContent is not exported (stays local per spec-research decision)', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).not.toMatch(/export\s+function\s+TeamViewContent/);
  });

  it('renders TeamViewContent only when isManager && scope === \'team\'', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(/isManager\s*&&\s*scope\s*===\s*['"]team['"][\s\S]{0,80}<TeamViewContent/);
  });

  it('TeamViewContent calls useTeamAggregateData() itself', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const idx = source.indexOf('function TeamViewContent');
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 4000);
    expect(body).toMatch(/useTeamAggregateData\s*\(\s*\)/);
  });

  it('imports useTeamAggregateData from @/src/hooks/useTeamAggregateData', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    expect(source).toMatch(
      /import\s*\{\s*useTeamAggregateData\s*\}\s*from\s*['"]@\/src\/hooks\/useTeamAggregateData['"]/,
    );
  });
});

describe('OverviewScreen FR2 (04-team-view-content) — team aggregate ChartSections', () => {
  function teamViewContentBody(): string {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const idx = source.indexOf('function TeamViewContent');
    expect(idx).toBeGreaterThan(-1);
    // Slice to end of file — TeamViewContent is defined after OverviewScreen's
    // supporting components, so this captures its full body.
    return source.slice(idx);
  }

  it('renders exactly three ChartSection elements', () => {
    const body = teamViewContentBody();
    const matches = body.match(/<ChartSection\b/g) || [];
    expect(matches.length).toBe(3);
  });

  it('TEAM HOURS section uses data={[weekHours]} and gold accent', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/TEAM HOURS/);
    expect(body).toMatch(/data\s*=\s*\{\s*\[\s*weekHours\s*\]\s*\}/);
    expect(body).toMatch(/colors\.gold/);
  });

  it('TEAM AI USAGE section uses data={[weekAiPct]}, cyan accent, maxValue={100}, 75 guide', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/TEAM AI USAGE/);
    expect(body).toMatch(/data\s*=\s*\{\s*\[\s*weekAiPct\s*\]\s*\}/);
    expect(body).toMatch(/colors\.cyan/);
    expect(body).toMatch(/maxValue\s*=\s*\{\s*100\s*\}/);
    expect(body).toMatch(/targetValue\s*=\s*\{\s*75\s*\}/);
  });

  it('TEAM BRAINLIFT section uses data={[weekBrainliftHours]} and violet accent', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/TEAM BRAINLIFT/);
    expect(body).toMatch(/data\s*=\s*\{\s*\[\s*weekBrainliftHours\s*\]\s*\}/);
    expect(body).toMatch(/colors\.violet/);
  });

  it('all three aggregates use weekLabels={[\'This week\']}', () => {
    const body = teamViewContentBody();
    const matches = body.match(/weekLabels\s*=\s*\{\s*\[\s*['"]This week['"]\s*\]\s*\}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('all three aggregates use externalCursorIndex={null} (no scrub interaction)', () => {
    const body = teamViewContentBody();
    const matches = body.match(/externalCursorIndex\s*=\s*\{\s*null\s*\}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('all three aggregates use a stable no-op onScrubChange callback', () => {
    const body = teamViewContentBody();
    const matches = body.match(/onScrubChange\s*=\s*\{[^}]*\}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
    // Must not be wired to the personal handleScrubChange (that would sync team
    // scrubbing into the personal sticky bar / hero snapshot state).
    expect(body).not.toMatch(/onScrubChange\s*=\s*\{\s*handleScrubChange\s*\}/);
  });
});

describe('OverviewScreen FR2 (04-team-view-content) — persistent elements across scopes', () => {
  it('OverviewHeroCard, EarningsPaceCard, ApprovalUrgencyCard, and insight chips are not inside the scope==="personal" block', () => {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const personalGuardIdx = source.search(/scope\s*===\s*['"]personal['"]/);
    const heroIdx = source.indexOf('<OverviewHeroCard');
    const earningsPaceIdx = source.indexOf('<EarningsPaceCard');
    const urgencyIdx = source.indexOf('<ApprovalUrgencyCard');
    const chipsIdx = source.indexOf('insightChips.map');
    expect(personalGuardIdx).toBeGreaterThan(-1);
    // All four must render before the personal-scope guard (i.e. outside/above the branch)
    expect(heroIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeLessThan(personalGuardIdx);
    expect(earningsPaceIdx).toBeGreaterThan(-1);
    expect(earningsPaceIdx).toBeLessThan(personalGuardIdx);
    expect(urgencyIdx).toBeGreaterThan(-1);
    expect(urgencyIdx).toBeLessThan(personalGuardIdx);
    expect(chipsIdx).toBeGreaterThan(-1);
    expect(chipsIdx).toBeLessThan(personalGuardIdx);
  });
});

// ─── 04-team-view-content: FR3 — team member rows and resilient states ───────
//
// FR3: TeamViewContent renders TeamMemberRow per breakdown entry, handles
// loading/empty/all-failed/partial-failure states in precedence order, and
// logs non-null errors via the existing logger.

describe('OverviewScreen FR3 (04-team-view-content) — TeamMemberRow component', () => {
  function fileSource(): string {
    return fs.readFileSync(OVERVIEW_FILE, 'utf8');
  }

  it('defines a local TeamMemberRow component', () => {
    expect(fileSource()).toMatch(/function\s+TeamMemberRow/);
  });

  it('TeamMemberRow is not exported', () => {
    expect(fileSource()).not.toMatch(/export\s+function\s+TeamMemberRow/);
  });

  it('imports log from @/src/lib/log', () => {
    expect(fileSource()).toMatch(/import\s*\{\s*log\s*\}\s*from\s*['"]@\/src\/lib\/log['"]/);
  });

  it('imports SkeletonLoader', () => {
    expect(fileSource()).toMatch(/import\s+SkeletonLoader\s+from\s*['"]@\/src\/components\/SkeletonLoader['"]/);
  });

  it('renders an MGR badge conditioned on member.isManager', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    expect(idx).toBeGreaterThan(-1);
    const body = source.slice(idx, idx + 3000);
    expect(body).toMatch(/member\.isManager/);
    expect(body).toMatch(/MGR/);
  });

  it('renders fetchFailed rows with "Couldn\'t load" label', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    const body = source.slice(idx, idx + 3000);
    expect(body).toMatch(/fetchFailed/);
    expect(body).toMatch(/Couldn't load/);
  });

  it('renders member stats with gold/cyan/violet accents', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    const body = source.slice(idx, idx + 3000);
    expect(body).toMatch(/colors\.gold/);
    expect(body).toMatch(/colors\.cyan/);
    expect(body).toMatch(/colors\.violet/);
  });

  it('uses member.assignmentId as the stable row key (never name or index)', () => {
    const source = fileSource();
    expect(source).toMatch(/key\s*=\s*\{[^}]*\.member\.assignmentId\}/);
  });

  it('imports Image from react-native for member photos', () => {
    expect(fileSource()).toMatch(/import\s*\{[^}]*\bImage\b[^}]*\}\s*from\s*['"]react-native['"]/);
  });

  it('renders member.photoUrl via <Image> when present', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    const body = source.slice(idx, idx + 3000);
    expect(body).toMatch(/member\.photoUrl/);
    expect(body).toMatch(/<Image/);
  });

  it('falls back to an initials avatar when photoUrl is absent (conditional, not always <Image>)', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    const body = source.slice(idx, idx + 3000);
    // Must branch on photoUrl presence rather than unconditionally rendering <Image>
    expect(body).toMatch(/member\.photoUrl\s*\?|!member\.photoUrl|member\.photoUrl\s*&&/);
  });

  it('formats hours and BrainLift with one decimal, AI% as a rounded integer', () => {
    const source = fileSource();
    const idx = source.indexOf('function TeamMemberRow');
    const body = source.slice(idx, idx + 3000);
    expect(body).toMatch(/toFixed\(1\)/);
    expect(body).toMatch(/Math\.round/);
  });
});

// ─── FR3: Logic unit tests — initials-avatar fallback (mirrors spec.md Edge Cases) ──
//
// Spec's Edge Cases section: "Missing, blank, or single-word name: initials
// fallback uses up to the first two non-empty words; if no initial can be
// derived, render `?`." Tested as pure logic, matching the established
// pattern of reimplementing the intended algorithm for direct verification.

describe('OverviewScreen FR3 (04-team-view-content) — initials fallback logic', () => {
  function getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  }

  it('returns two-letter initials for a normal two-word name', () => {
    expect(getInitials('Jane Doe')).toBe('JD');
  });

  it('returns a single-letter initial for a single-word name', () => {
    expect(getInitials('Madonna')).toBe('M');
  });

  it('uses only the first two words for a three-or-more-word name', () => {
    expect(getInitials('Mary Jane Watson')).toBe('MJ');
  });

  it('returns "?" for a blank/whitespace-only name', () => {
    expect(getInitials('   ')).toBe('?');
  });

  it('returns "?" for an empty name', () => {
    expect(getInitials('')).toBe('?');
  });
});

describe('OverviewScreen FR3 (04-team-view-content) — state precedence', () => {
  function teamViewContentBody(): string {
    const source = fs.readFileSync(OVERVIEW_FILE, 'utf8');
    const idx = source.indexOf('function TeamViewContent');
    expect(idx).toBeGreaterThan(-1);
    return source.slice(idx);
  }

  it('checks isLoading && data === null before other branches (skeleton state)', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/isLoading\s*&&\s*data\s*===\s*null/);
  });

  it('renders SkeletonLoader in the loading branch', () => {
    const body = teamViewContentBody();
    const loadingIdx = body.search(/isLoading\s*&&\s*data\s*===\s*null/);
    expect(loadingIdx).toBeGreaterThan(-1);
    const window = body.slice(loadingIdx, loadingIdx + 1500);
    expect(window).toMatch(/<SkeletonLoader/);
  });

  it('checks data === null for the error-card branch', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/data\s*===\s*null/);
  });

  it('checks breakdown.length === 0 for the empty-roster message', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/breakdown\.length\s*===\s*0/);
    expect(body).toMatch(/No direct reports found/);
  });

  it('checks reportCount === 0 with non-empty breakdown for the all-failed branch', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/reportCount\s*===\s*0/);
    expect(body).toMatch(/Unable to load team metrics/);
  });

  it('logs a non-null error via log.error regardless of data validity', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/log\.error\s*\(/);
  });

  it('logs error via a useEffect keyed on `error` (fires independent of data-based render branch)', () => {
    // Spec.md: "error is logged... independent of this rendering precedence —
    // including the case where a background refetch error arrives alongside
    // still-valid cached data." A log.error(...) call gated behind an `if
    // (data === null)` render branch would NOT fire in that scenario, since
    // step 5 (data.reportCount > 0) renders the loaded content instead and
    // never reaches the data===null branch. A useEffect keyed on `error`
    // (not `data`) runs regardless of which render branch is active. Require
    // that shape rather than a log.error call embedded in the data===null
    // JSX branch.
    const body = teamViewContentBody();
    const effectPattern = /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\berror\b[^\]]*\]\s*\)/;
    const match = body.match(effectPattern);
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/log\.error\s*\(/);
    expect(match![0]).toMatch(/if\s*\(\s*error\s*\)/);
  });

  it('maps breakdown entries to TeamMemberRow', () => {
    const body = teamViewContentBody();
    expect(body).toMatch(/breakdown\.map/);
    expect(body).toMatch(/<TeamMemberRow/);
  });
});

// ─── FR3: Logic unit tests — state precedence order (mirrors spec.md) ────────
//
// Pure re-implementation of the five-branch precedence described in spec.md's
// "State Rendering Order" section, tested independently of React rendering.

describe('OverviewScreen FR3 (04-team-view-content) — precedence logic', () => {
  type Breakdown = { fetchFailed: boolean };
  type TeamData = { reportCount: number; breakdown: Breakdown[] } | null;

  type RenderState =
    | 'skeleton'
    | 'error'
    | 'empty'
    | 'all-failed'
    | 'loaded';

  function resolveState(isLoading: boolean, data: TeamData): RenderState {
    if (isLoading && data === null) return 'skeleton';
    if (data === null) return 'error';
    if (data.breakdown.length === 0) return 'empty';
    if (data.reportCount === 0 && data.breakdown.length > 0) return 'all-failed';
    return 'loaded';
  }

  it('isLoading=true, data=null → skeleton', () => {
    expect(resolveState(true, null)).toBe('skeleton');
  });

  it('isLoading=false, data=null → error', () => {
    expect(resolveState(false, null)).toBe('error');
  });

  it('data.breakdown=[] → empty (even if isLoading is stale-true from background refetch)', () => {
    expect(resolveState(false, { reportCount: 0, breakdown: [] })).toBe('empty');
  });

  it('reportCount=0 with non-empty breakdown → all-failed', () => {
    expect(
      resolveState(false, { reportCount: 0, breakdown: [{ fetchFailed: true }, { fetchFailed: true }] }),
    ).toBe('all-failed');
  });

  it('reportCount>0 with mixed breakdown → loaded (partial failure still renders normally)', () => {
    expect(
      resolveState(false, { reportCount: 1, breakdown: [{ fetchFailed: true }, { fetchFailed: false }] }),
    ).toBe('loaded');
  });

  it('reportCount>0 with all-success breakdown → loaded', () => {
    expect(
      resolveState(false, { reportCount: 2, breakdown: [{ fetchFailed: false }, { fetchFailed: false }] }),
    ).toBe('loaded');
  });

  it('isLoading=true with cached non-null data → loaded, not skeleton (background refetch)', () => {
    expect(
      resolveState(true, { reportCount: 1, breakdown: [{ fetchFailed: false }] }),
    ).toBe('loaded');
  });
});
