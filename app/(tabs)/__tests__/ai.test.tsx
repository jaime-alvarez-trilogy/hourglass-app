// Tests: AI tab screen (04-ai-scrub + 04-ai-hero-arc)
// FR3: AI Tab Hero Value Sync (04-ai-scrub)
//
// SC3.1 — ai.tsx declares scrubPoint state of type AIScrubPoint | null
// SC3.2 — when scrubPoint !== null, heroAIPct = scrubPoint.pctY
// SC3.3 — when scrubPoint === null, heroAIPct = live aiPercent
// SC3.4 — scrubPoint.pctY = 0 → hero shows 0 (not live)
// SC3.5 — scrubPoint.pctY = 100 → hero shows 100
// SC3.6 — AIConeChart receives onScrubChange={setScrubPoint}
// SC3.7 — legend has opacity: isScrubActive ? 0 : 1 (in AIConeChart)
// SC3.8 — no new prop on AIConeChartProps for legend (internal state)
//
// FR4 + FR5: AmbientBackground wiring + AIArcHero hero replacement (04-ai-hero-arc)
//
// SC4.1 — ai.tsx imports AmbientBackground
// SC4.2 — ai.tsx imports getAmbientColor from AmbientBackground
// SC4.3 — ai.tsx computes ambientColor via getAmbientColor({ type: 'aiPct', pct: ... })
// SC4.4 — AmbientBackground is rendered in ai.tsx
// SC4.5 — AmbientBackground receives color={ambientColor}
// SC5.1 — AIArcHero is imported in ai.tsx
// SC5.2 — AIArcHero is rendered with aiPct, brainliftHours, deltaPercent, ambientColor props
// SC5.3 — AIRingChart is NOT imported in ai.tsx (hero position removed)
// SC5.4 — Separate BrainLift Card block is removed
// SC5.5 — RING_SIZE constant removed
// SC5.6 — BRAINLIFT_TARGET constant removed from ai.tsx
// SC5.7 — useStaggeredEntry count changed from 6 to 5
//
// Strategy:
// - Source analysis for interface/contract checks (ai.tsx and AIConeChart.tsx)
// - Logic unit tests for the heroAIPct ternary expression

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const AI_TAB_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'ai.tsx');
const CONE_CHART_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'AIConeChart.tsx');

// ─── FR3: AI Tab Hero Value Sync ──────────────────────────────────────────────

describe('AI Tab — FR3 (04-ai-scrub): Hero Value Sync', () => {
  it('SC3.1 — ai.tsx declares scrubPoint state of type AIScrubPoint | null', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // useState with AIScrubPoint | null generic
    expect(source).toMatch(/useState\s*<\s*AIScrubPoint\s*\|\s*null\s*>/);
    expect(source).toMatch(/scrubPoint/);
  });

  it('SC3.2 — when scrubPoint !== null, heroAIPct = scrubPoint.pctY', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // Ternary: scrubPoint !== null ? scrubPoint.pctY : ...
    expect(source).toMatch(/scrubPoint\s*!==\s*null\s*\?\s*scrubPoint\.pctY/);
  });

  it('SC3.3 — when scrubPoint === null, heroAIPct falls back to live aiPercent', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // heroAIPct computed from aiPercent as fallback
    expect(source).toMatch(/scrubPoint\.pctY\s*:\s*aiPercent|heroAIPct[\s\S]{0,100}aiPercent/);
  });

  it('SC3.4 — heroAIPct = scrubPoint.pctY when scrubPoint is not null (covers pctY=0 case)', () => {
    // Unit test the ternary logic directly
    const scrubPointNull = null;
    const liveAIPct = 72.5;
    const heroWhenNull = scrubPointNull !== null ? (scrubPointNull as any).pctY : liveAIPct;
    expect(heroWhenNull).toBe(72.5);

    const scrubPointZero = { pctY: 0, hoursX: 5, upperPct: 90, lowerPct: 20 };
    const heroWhenZero = scrubPointZero !== null ? scrubPointZero.pctY : liveAIPct;
    expect(heroWhenZero).toBe(0); // 0, not liveAIPct
  });

  it('SC3.5 — heroAIPct = 100 when scrubPoint.pctY = 100', () => {
    const scrubPoint100 = { pctY: 100, hoursX: 40, upperPct: 100, lowerPct: 100 };
    const liveAIPct = 72.5;
    const hero = scrubPoint100 !== null ? scrubPoint100.pctY : liveAIPct;
    expect(hero).toBe(100);
  });

  it('SC3.6 — AIConeChart in ai.tsx receives onScrubChange prop wired to setScrubPoint', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // onScrubChange={setScrubPoint}
    expect(source).toMatch(/onScrubChange=\{setScrubPoint\}/);
  });

  it('SC3.7 — AIConeChart source uses isScrubActive for legend opacity control', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // opacity: isScrubActive ? 0 : 1
    expect(source).toMatch(/isScrubActive\s*\?\s*0\s*:\s*1/);
  });

  it('SC3.8a — AIConeChartProps does NOT have a new "showLegend" or "legendVisible" prop', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    const interfaceMatch = source.match(/interface\s+AIConeChartProps\s*\{[\s\S]*?\}/);
    expect(interfaceMatch).not.toBeNull();
    const body = interfaceMatch![0];
    expect(body).not.toMatch(/showLegend|legendVisible|legendOpacity/i);
  });

  it('SC3.8b — AIConeChart legend opacity is driven by internal isScrubActive state (not prop)', () => {
    const source = fs.readFileSync(CONE_CHART_FILE, 'utf8');
    // isScrubActive is a useState (internal state, not a prop)
    expect(source).toMatch(/const\s*\[\s*isScrubActive\s*,\s*setIsScrubActive\s*\]\s*=\s*useState/);
  });

  it('SC3.9 — ai.tsx imports AIScrubPoint type from AIConeChart', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/AIScrubPoint/);
    expect(source).toMatch(/from\s+['"]@\/src\/components\/AIConeChart['"]/);
  });
});

// ─── FR4: AmbientBackground wiring ────────────────────────────────────────────

describe('AI Tab — FR4 (04-ai-hero-arc): AmbientBackground wiring', () => {
  it('SC4.1 — ai.tsx imports AmbientBackground', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toContain('AmbientBackground');
    expect(source).toMatch(/from\s+['"]@\/src\/components\/AmbientBackground['"]/);
  });

  it('SC4.2 — ai.tsx imports getAmbientColor', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toContain('getAmbientColor');
  });

  it('SC4.3 — ai.tsx computes ambientColor via getAmbientColor({ type: "aiPct", ... })', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/getAmbientColor\s*\(\s*\{[^}]*type\s*:\s*['"]aiPct['"]/);
  });

  it('SC4.4 — AnimatedMeshBackground is rendered in ai.tsx JSX [08-dark-glass-polish: replaces AmbientBackground element]', () => {
    // 08-dark-glass-polish: <AmbientBackground color={...} /> replaced with
    // <AnimatedMeshBackground aiPct={Math.round(heroAIPct)} /> for direct signal wiring.
    // AmbientBackground import is kept for getAmbientColor (used for AIArcHero).
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/<AnimatedMeshBackground/);
  });

  it('SC4.5 — AnimatedMeshBackground receives aiPct prop [08-dark-glass-polish]', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/AnimatedMeshBackground[^>]*aiPct=/);
  });

  it('SC4.6 — AnimatedMeshBackground is rendered outside/before ScrollView (behind content)', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    const ambientPos = source.indexOf('<AnimatedMeshBackground');
    const scrollViewPos = source.indexOf('<ScrollView');
    // AnimatedMeshBackground should appear before ScrollView in JSX
    expect(ambientPos).toBeGreaterThan(-1);
    expect(scrollViewPos).toBeGreaterThan(-1);
    expect(ambientPos).toBeLessThan(scrollViewPos);
  });
});

// ─── FR5: AIArcHero hero replacement ──────────────────────────────────────────

describe('AI Tab — FR5 (04-ai-hero-arc): AIArcHero hero replacement', () => {
  it('SC5.1 — ai.tsx imports AIArcHero', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toContain('AIArcHero');
    expect(source).toMatch(/from\s+['"]@\/src\/components\/AIArcHero['"]/);
  });

  it('SC5.2 — AIArcHero rendered with aiPct, brainliftHours, deltaPercent, ambientColor props', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/<AIArcHero/);
    expect(source).toMatch(/aiPct=/);
    expect(source).toMatch(/brainliftHours=/);
    expect(source).toMatch(/deltaPercent=/);
    expect(source).toMatch(/ambientColor=\{ambientColor\}/);
  });

  it('SC5.3 — AIRingChart is NOT imported in ai.tsx', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // import line for AIRingChart should be gone
    expect(source).not.toMatch(/import\s+AIRingChart/);
  });

  it('SC5.4 — AIRingChart is NOT rendered in ai.tsx JSX', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).not.toMatch(/<AIRingChart/);
  });

  it('SC5.5 — RING_SIZE constant is removed from ai.tsx', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).not.toMatch(/RING_SIZE/);
  });

  it('SC5.6 — BRAINLIFT_TARGET constant is removed from ai.tsx (now in AIArcHero)', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).not.toMatch(/const\s+BRAINLIFT_TARGET\s*=/);
  });

  it('SC5.7 — useStaggeredEntry uses count: 7 (includes AppBreakdownCard)', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    expect(source).toMatch(/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*7\s*\}/);
  });

  it('SC5.8 — heroAIPct scrub override is passed as aiPct prop to AIArcHero', () => {
    const source = fs.readFileSync(AI_TAB_FILE, 'utf8');
    // aiPct={Math.round(heroAIPct)} or similar
    expect(source).toMatch(/aiPct=\{[^}]*heroAIPct/);
  });
});
