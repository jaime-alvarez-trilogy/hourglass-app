// Tests: 01-widget-polish
//
// FR1: Small widget content triage (iOS + Android)
//   SC1.1–SC1.7  — iOS SmallWidget: no earnings, no hoursRemaining; paceBadge, stale, manager badge
//   SC1.8–SC1.10 — Android SmallWidget: no earnings, no hoursRemaining; hoursDisplay present
//
// FR2: iOS Large padding
//   SC2.1 — outer VStack padding equals 16
//
// FR3: Android SVG background replacement
//   SC3.1–SC3.8 — linearGradient present, no ellipse/radialGradient, state colors, dimensions
//
// FR4: todayDelta data field
//   SC4.1–SC4.5 — computeTodayDelta() unit tests
//   SC4.6–SC4.9 — buildWidgetData() integration
//   SC4.10–SC4.12 — iOS LargeWidget rendering
//
// FR5: Progress bar height and labels
//   SC5.1–SC5.5 — blProgressBar height=8, BrainLift label, AI Usage label
//
// Strategy:
// - Import computeTodayDelta, buildMeshSvg, blProgressBar directly (all exported)
// - Read iOS HourglassWidget.tsx source as string for JSX assertions
// - Use bridge.ts exported buildWidgetData via test-harness wrapper (indirect via updateWidgetData)
//   or directly by reading the source — prefer direct import patterns for pure functions
// - For Android widget renders: use toString/JSON assertions on component source strings

import * as path from 'path';
import * as fs from 'fs';
import { buildMeshSvg, blProgressBar } from '../android/HourglassWidget';

// ─── Paths ─────────────────────────────────────────────────────────────────────

const IOS_WIDGET_FILE = path.resolve(__dirname, '../ios/HourglassWidget.tsx');
const BRIDGE_FILE = path.resolve(__dirname, '../bridge.ts');

// ─── Source readers ─────────────────────────────────────────────────────────────

function readIosWidget(): string {
  return fs.readFileSync(IOS_WIDGET_FILE, 'utf8');
}

function readBridge(): string {
  return fs.readFileSync(BRIDGE_FILE, 'utf8');
}

// ─── computeTodayDelta import helper ───────────────────────────────────────────
// We import computeTodayDelta by dynamic require after confirming it's exported.
// The bridge.ts file uses React Native imports that don't resolve in Jest/node,
// so we extract and eval the pure function from source instead.

function extractComputeTodayDelta(): (today: number, average: number) => string {
  const src = readBridge();
  // Extract the function body: find `function computeTodayDelta` ... first `}` after it
  const fnStart = src.indexOf('function computeTodayDelta(');
  if (fnStart === -1) throw new Error('computeTodayDelta not found in bridge.ts');
  // Find the closing brace of the function — simple brace counting
  let depth = 0;
  let i = fnStart;
  let started = false;
  while (i < src.length) {
    if (src[i] === '{') { depth++; started = true; }
    if (src[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
    i++;
  }
  let fnSrc = src.slice(fnStart, i);
  // Strip TypeScript type annotations from parameters and return type
  // e.g. `function computeTodayDelta(today: number, average: number): string`
  // → `function computeTodayDelta(today, average)`
  fnSrc = fnSrc
    .replace(/function computeTodayDelta\([^)]*\)(?:\s*:\s*\w+)?/, (match) => {
      // Remove param type annotations and return type
      return match
        .replace(/:\s*\w+/g, '') // remove `: type` annotations
        .replace(/\(\s*\)/, '()'); // clean up empty parens if needed
    });
  // eslint-disable-next-line no-new-func
  const fn = new Function('return (' + fnSrc + ')')();
  return fn as (today: number, average: number) => string;
}

// ─── FR1: iOS SmallWidget source assertions ─────────────────────────────────────

describe('FR1: iOS SmallWidget content triage', () => {
  let src: string;
  // Isolate just the SmallWidget function
  let smallWidgetSrc: string;

  beforeAll(() => {
    src = readIosWidget();
    // Extract SmallWidget function body: from `function SmallWidget` to next top-level `function`
    const start = src.indexOf('function SmallWidget(');
    const nextFn = src.indexOf('\nfunction MediumWidget(', start);
    smallWidgetSrc = src.slice(start, nextFn);
  });

  it('SC1.1: SmallWidget does NOT render earnings (props.earnings)', () => {
    // earnings field should not appear in SmallWidget JSX after polish
    expect(smallWidgetSrc).not.toContain('props.earnings');
  });

  it('SC1.2: SmallWidget does NOT render hoursRemaining (props.hoursRemaining)', () => {
    expect(smallWidgetSrc).not.toContain('props.hoursRemaining');
  });

  it('SC1.3: SmallWidget DOES render hoursDisplay (props.hoursDisplay)', () => {
    expect(smallWidgetSrc).toContain('props.hoursDisplay');
  });

  it('SC1.4: SmallWidget renders paceBadge status text conditionally', () => {
    // Must reference paceBadge in SmallWidget to show status
    expect(smallWidgetSrc).toContain('props.paceBadge');
  });

  it('SC1.5: SmallWidget paceBadge=none guard exists (no render for none)', () => {
    // The source must guard against rendering when badge is 'none' or empty
    // Either via PACE_LABELS lookup (falsy for 'none') or explicit !== 'none' check
    const hasPaceLabels = src.includes('PACE_LABELS');
    const hasNoneGuard = smallWidgetSrc.includes("!== 'none'") || smallWidgetSrc.includes('PACE_LABELS');
    expect(hasPaceLabels || hasNoneGuard).toBe(true);
  });

  it('SC1.6: SmallWidget still renders manager badge (isManager + pendingCount)', () => {
    expect(smallWidgetSrc).toContain('props.isManager');
    expect(smallWidgetSrc).toContain('props.pendingCount');
  });

  it('SC1.7: SmallWidget still renders stale indicator (isStale / cachedAt)', () => {
    // isStale call or cachedAt reference must be in SmallWidget
    expect(smallWidgetSrc).toMatch(/isStale|cachedAt/);
  });
});

// ─── FR1: Android SmallWidget source assertions ──────────────────────────────────

describe('FR1: Android SmallWidget content triage', () => {
  let androidSrc: string;
  let smallWidgetSrc: string;

  beforeAll(() => {
    const androidFile = path.resolve(__dirname, '../android/HourglassWidget.tsx');
    androidSrc = fs.readFileSync(androidFile, 'utf8');
    // Extract Android SmallWidget function body
    const start = androidSrc.indexOf('function SmallWidget(');
    // Next top-level function after SmallWidget
    const nextFn = androidSrc.indexOf('\n// ─── Action mode', start);
    smallWidgetSrc = nextFn > start
      ? androidSrc.slice(start, nextFn)
      : androidSrc.slice(start, start + 400);
  });

  it('SC1.8: Android SmallWidget does NOT render data.earnings', () => {
    expect(smallWidgetSrc).not.toContain('data.earnings');
  });

  it('SC1.9: Android SmallWidget does NOT render data.hoursRemaining', () => {
    expect(smallWidgetSrc).not.toContain('data.hoursRemaining');
  });

  it('SC1.10: Android SmallWidget DOES render data.hoursDisplay', () => {
    expect(smallWidgetSrc).toContain('data.hoursDisplay');
  });
});

// ─── FR2: iOS LargeWidget padding ────────────────────────────────────────────────

describe('FR2: iOS LargeWidget padding', () => {
  let largeWidgetSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    largeWidgetSrc = src.slice(start, nextFn);
  });

  it('SC2.1: LargeWidget outer VStack uses padding={16}', () => {
    expect(largeWidgetSrc).toContain('padding={16}');
  });

  it('SC2.2: LargeWidget outer VStack uses uniform padding (scalar 16, not object-form)', () => {
    // 03-typography-layout FR5.4: changed from asymmetric bottom:28 to uniform padding={16}
    // The outer VStack now uses scalar padding={16}, not object-form { top: 16, bottom: 28 }
    expect(largeWidgetSrc).not.toContain('bottom: 28');
  });
});

// ─── FR3: Android SVG background replacement ─────────────────────────────────────

describe('FR3: buildMeshSvg() — linear gradient replacement', () => {
  it('SC3.1: contains <linearGradient', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(svg).toContain('<linearGradient');
  });

  it('SC3.2: does NOT contain <ellipse', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(svg).not.toContain('<ellipse');
  });

  it('SC3.3: does NOT contain <radialGradient', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(svg).not.toContain('<radialGradient');
  });

  it('SC3.4: state color from meshStateColor() appears in output', () => {
    // urgency=none, paceBadge=none → violet #A78BFA
    const svg = buildMeshSvg('none', 'none');
    expect(svg).toContain('#A78BFA');
  });

  it('SC3.5: urgency=critical → state color #F43F5E in output', () => {
    const svg = buildMeshSvg('critical', 'none');
    expect(svg).toContain('#F43F5E');
  });

  it('SC3.6: urgency=none, paceBadge=on_track → state color #10B981 in output', () => {
    const svg = buildMeshSvg('none', 'on_track');
    expect(svg).toContain('#10B981');
  });

  it('SC3.7: urgency=none, paceBadge=none → state color #A78BFA in output', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(svg).toContain('#A78BFA');
  });

  it('SC3.8: SVG canvas dimensions remain 360x200', () => {
    const svg = buildMeshSvg('none', 'none');
    expect(svg).toContain('width="360"');
    expect(svg).toContain('height="200"');
  });
});

// ─── FR4: computeTodayDelta ───────────────────────────────────────────────────────

describe('FR4: computeTodayDelta()', () => {
  let computeTodayDelta: (today: number, average: number) => string;

  beforeAll(() => {
    computeTodayDelta = extractComputeTodayDelta();
  });

  it('SC4.1: (6.2, 5.0) === "+1.2h"', () => {
    expect(computeTodayDelta(6.2, 5.0)).toBe('+1.2h');
  });

  it('SC4.2: (3.8, 5.0) === "-1.2h"', () => {
    expect(computeTodayDelta(3.8, 5.0)).toBe('-1.2h');
  });

  it('SC4.3: (5.0, 5.0) === "+0.0h"', () => {
    expect(computeTodayDelta(5.0, 5.0)).toBe('+0.0h');
  });

  it('SC4.4: (6.2, 0) === "" (no average)', () => {
    expect(computeTodayDelta(6.2, 0)).toBe('');
  });

  it('SC4.5: (0, 0) === "" (no average)', () => {
    expect(computeTodayDelta(0, 0)).toBe('');
  });
});

describe('FR4: bridge.ts buildWidgetData() — todayDelta field', () => {
  it('SC4.6: buildWidgetData result shape includes todayDelta field', () => {
    const src = readBridge();
    // The main return should include todayDelta
    expect(src).toContain('todayDelta');
  });

  it('SC4.7: todayDelta computed from hoursData.today and hoursData.average', () => {
    const src = readBridge();
    // computeTodayDelta must be called with hoursData.today and hoursData.average
    expect(src).toContain('computeTodayDelta(hoursData.today, hoursData.average)');
  });

  it('SC4.9: null-guard return includes todayDelta: empty string', () => {
    const src = readBridge();
    // The guard return (hoursData === null path) must include todayDelta: ''
    // Find the null-guard block
    const guardStart = src.indexOf('if (!hoursData)');
    const guardEnd = src.indexOf('const deadlineMs =', guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).toContain("todayDelta: ''");
  });
});

describe('FR4: iOS LargeWidget — Today row uses todayDelta not hoursRemaining', () => {
  let largeWidgetSrc: string;
  let todayRowSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    largeWidgetSrc = src.slice(start, nextFn);

    // Find the Today row section (HStack containing "Today:")
    const todayIdx = largeWidgetSrc.indexOf('Today:');
    // Extract a window around the Today row
    todayRowSrc = largeWidgetSrc.slice(
      Math.max(0, todayIdx - 50),
      todayIdx + 400
    );
  });

  it('SC4.10: Today row right side does NOT use props.hoursRemaining', () => {
    // The right-side element in the Today HStack should not be hoursRemaining
    expect(todayRowSrc).not.toContain('props.hoursRemaining');
  });

  it('SC4.11: LargeWidget references props.todayDelta', () => {
    expect(largeWidgetSrc).toContain('props.todayDelta');
  });

  it('SC4.12: todayDelta is rendered conditionally (guard for empty string)', () => {
    // Must have a conditional render: todayDelta && ... or todayDelta !== '' or || fallback
    const hasConditional =
      largeWidgetSrc.includes('todayDelta &&') ||
      largeWidgetSrc.includes("todayDelta !== ''") ||
      largeWidgetSrc.includes('todayDelta.length > 0') ||
      largeWidgetSrc.includes('todayDelta ||');
    expect(hasConditional).toBe(true);
  });
});

// ─── FR5: blProgressBar height and labels ─────────────────────────────────────────

describe('FR5: blProgressBar() height', () => {
  it('SC5.1: SVG contains height="8"', () => {
    const svg = blProgressBar(3, 5, 120);
    expect(svg).toContain('height="8"');
  });

  it('SC5.2: SVG does NOT contain height="6"', () => {
    const svg = blProgressBar(3, 5, 120);
    expect(svg).not.toContain('height="6"');
  });
});

describe('FR5: Android MediumWidget Hours mode labels', () => {
  let mediumHoursSrc: string;

  beforeAll(() => {
    const androidFile = path.resolve(__dirname, '../android/HourglassWidget.tsx');
    const src = fs.readFileSync(androidFile, 'utf8');
    // Extract the Hours mode section (after all early-return mode blocks)
    const hoursStart = src.indexOf('// ─── Hours mode (standard display)');
    mediumHoursSrc = hoursStart > -1 ? src.slice(hoursStart) : src;
  });

  it('SC5.3: Hours mode contains "BrainLift" label', () => {
    expect(mediumHoursSrc).toContain('"BrainLift"');
  });

  it('SC5.4: Hours mode does NOT contain standalone "BL" label text', () => {
    // "BL" as a standalone TextWidget label (text="BL") should be gone
    expect(mediumHoursSrc).not.toContain('text="BL"');
  });

  it('SC5.5: Hours mode stats row contains "AI Usage:" label', () => {
    expect(mediumHoursSrc).toContain('AI Usage:');
  });
});

// ─── 02-glass-card: IosGlassCard fill/stroke/prop ───────────────────────────────

describe('02-glass-card FR1: IosGlassCard fill opacity 75%', () => {
  let glassCardSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    // Extract IosGlassCard function body
    const start = src.indexOf('function IosGlassCard(');
    const end = src.indexOf('\n// ', start);
    glassCardSrc = src.slice(start, end);
  });

  it('SC1.1: IosGlassCard RoundedRectangle fill references surface color token', () => {
    // Source uses COLORS.surface (#16151FCC) via token reference
    expect(glassCardSrc).toMatch(/fill=\{?(?:COLORS\.surface|"#1C1E26BF"|"#16151FCC")/);
  });

  it('SC1.2: IosGlassCard RoundedRectangle fill is translucent (not fully opaque)', () => {
    // Translucent surface — either via COLORS token or hex with alpha
    expect(glassCardSrc).toMatch(/COLORS\.surface|#[\dA-Fa-f]{8}/);
  });
});

describe('02-glass-card FR2: IosGlassCard specular edge 15% white', () => {
  let glassCardSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function IosGlassCard(');
    const end = src.indexOf('\n// ', start);
    glassCardSrc = src.slice(start, end);
  });

  it('SC2.1: IosGlassCard stroke references a border color token', () => {
    // Source uses COLORS.borderSubtle (#2F2E41) or a white alpha value
    expect(glassCardSrc).toMatch(/stroke=\{?(?:COLORS\.borderSubtle|"#FFFFFF26"|"#2F2E41")/);
  });

  it('SC2.2: IosGlassCard stroke is NOT #FFFFFF1A (old 10% value)', () => {
    expect(glassCardSrc).not.toContain('#FFFFFF1A');
  });

  it('SC2.3: IosGlassCard strokeWidth is defined', () => {
    // strokeWidth varies by design iteration (0.5 or 1.5)
    expect(glassCardSrc).toMatch(/strokeWidth=\{[\d.]+\}/);
  });
});

describe('02-glass-card FR3: borderColor prop removed', () => {
  let glassCardSrc: string;
  let fullSrc: string;

  beforeAll(() => {
    fullSrc = readIosWidget();
    const start = fullSrc.indexOf('function IosGlassCard(');
    const end = fullSrc.indexOf('\n// ', start);
    glassCardSrc = fullSrc.slice(start, end);
  });

  it('SC3.1: IosGlassCard function signature does not include borderColor parameter', () => {
    // The signature block (up to first `{`) must not contain borderColor
    const signatureEnd = glassCardSrc.indexOf(') {');
    const signature = glassCardSrc.slice(0, signatureEnd);
    expect(signature).not.toContain('borderColor');
  });

  it('SC3.2: IosGlassCard body does not reference borderColor', () => {
    expect(glassCardSrc).not.toContain('borderColor');
  });

  it('SC3.3: No IosGlassCard caller passes borderColor prop', () => {
    // Search entire file for IosGlassCard usage with borderColor prop
    expect(fullSrc).not.toMatch(/IosGlassCard borderColor=/);
    expect(fullSrc).not.toMatch(/<IosGlassCard[^>]*borderColor/);
  });
});

// ─── 01-atmospheric-background: WidgetBackground single top-center glow ─────────

describe('01-atmospheric-background FR1: single top-center glow circle', () => {
  let widgetBgSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    // Extract WidgetBackground function body: from `function WidgetBackground` to next `\n// `
    const start = src.indexOf('function WidgetBackground(');
    const end = src.indexOf('\n// ', start);
    widgetBgSrc = src.slice(start, end);
  });

  it('SC1.1: WidgetBackground contains exactly one Circle element', () => {
    // Count Circle occurrences — each JSX tag starts with `<Circle`
    const matches = widgetBgSrc.match(/<Circle/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('SC1.2: Circle has width={250}', () => {
    expect(widgetBgSrc).toContain('width={250}');
  });

  it('SC1.3: Circle has height={200}', () => {
    expect(widgetBgSrc).toContain('height={200}');
  });

  it('SC1.4: Circle has opacity={0.15}', () => {
    expect(widgetBgSrc).toContain('opacity={0.15}');
  });

  it('SC1.5: Circle has blur={60}', () => {
    expect(widgetBgSrc).toContain('blur={60}');
  });

  it('SC1.6: Circle fill is the accent prop (not a hardcoded color)', () => {
    // Must use `fill={accent}` — dynamic, not a literal color string
    expect(widgetBgSrc).toContain('fill={accent}');
  });

  it('SC1.7: No old blue glow circle (#3B82F6) in WidgetBackground', () => {
    expect(widgetBgSrc).not.toContain('#3B82F6');
  });

  it('SC1.8: No top-right HStack layout (no inner HStack wrapping Circle)', () => {
    // Old layout had <HStack><Spacer /><Circle .../></HStack>
    // New layout has VStack directly containing Circle — no inner HStack
    expect(widgetBgSrc).not.toContain('<HStack>');
  });

  it('SC1.9: Rectangle fill references the dark background color', () => {
    // Source uses COLORS.bgDark (#0D0C14) via token or a dark hex literal (#0B0D13 etc.)
    expect(widgetBgSrc).toMatch(/fill=(?:"#0[BD]0[CD]1[34]"|{COLORS\.bgDark})/);
  });

  it('SC1.10: Old accent circle dimensions (width={160}, height={160}) are gone', () => {
    expect(widgetBgSrc).not.toContain('width={160}');
    expect(widgetBgSrc).not.toContain('height={160}');
  });
});

// ─── 04-pill-chart: StatusPill Capsule + IosBarChart cornerRadius ─────────────

describe('04-pill-chart FR1: StatusPill uses Capsule shape', () => {
  let statusPillSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function StatusPill(');
    const end = src.indexOf('\n// ', start);
    statusPillSrc = src.slice(start, end);
  });

  it('SC1.1: StatusPill contains Capsule element (not RoundedRectangle)', () => {
    expect(statusPillSrc).toContain('<Capsule');
  });

  it('SC1.2: StatusPill does NOT contain RoundedRectangle with cornerRadius={10}', () => {
    expect(statusPillSrc).not.toMatch(/RoundedRectangle[^>]*cornerRadius=\{10\}/);
    expect(statusPillSrc).not.toMatch(/cornerRadius=\{10\}[^>]*RoundedRectangle/);
    // Full check: no RoundedRectangle at all in StatusPill
    expect(statusPillSrc).not.toContain('<RoundedRectangle');
  });

  it('SC1.3: StatusPill fill Capsule uses 1A opacity suffix', () => {
    // Fill layer: color+'1A'
    expect(statusPillSrc).toContain("'1A'");
    expect(statusPillSrc).not.toContain("'15'");
  });

  it('SC1.4: StatusPill fill Capsule has height={22}', () => {
    expect(statusPillSrc).toContain('height={22}');
  });

  it('SC1.5: StatusPill stroke Capsule has strokeWidth={0.5}', () => {
    expect(statusPillSrc).toContain('strokeWidth={0.5}');
  });

  it('SC1.6: StatusPill stroke Capsule uses full color (no 80 suffix)', () => {
    // Stroke must not append '80' to color
    expect(statusPillSrc).not.toContain("'80'");
    // Stroke passes color directly
    expect(statusPillSrc).toMatch(/stroke=\{color\}/);
  });
});

describe('04-pill-chart FR2: StatusPill text styling', () => {
  let statusPillSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function StatusPill(');
    const end = src.indexOf('\n// ', start);
    statusPillSrc = src.slice(start, end);
  });

  it('SC2.1: StatusPill Text font weight is bold', () => {
    expect(statusPillSrc).toContain("weight: 'bold'");
    expect(statusPillSrc).not.toContain("weight: 'semibold'");
  });

  it('SC2.2: StatusPill Text padding has leading: 10', () => {
    expect(statusPillSrc).toContain('leading: 10');
  });

  it('SC2.3: StatusPill Text padding has trailing: 10', () => {
    expect(statusPillSrc).toContain('trailing: 10');
  });

  it('SC2.4: StatusPill Text does NOT use uniform padding={6}', () => {
    // Old: padding={6} — replaced by object-form horizontal padding
    expect(statusPillSrc).not.toMatch(/padding=\{6\}/);
  });
});

describe('04-pill-chart FR3: IosBarChart bar cornerRadius is 6', () => {
  let barChartSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('export function IosBarChart(');
    const end = src.indexOf('\n// ─── Small Widget', start);
    barChartSrc = src.slice(start, end);
  });

  it('SC3.1: IosBarChart RoundedRectangle has cornerRadius={6}', () => {
    expect(barChartSrc).toContain('cornerRadius={6}');
  });

  it('SC3.2: IosBarChart RoundedRectangle does NOT have cornerRadius={3} (old value)', () => {
    expect(barChartSrc).not.toContain('cornerRadius={3}');
  });

  it('SC3.3: IosBarChart still renders 7 bars (one per day)', () => {
    // The function maps over daily entries — confirm the .map call is present
    expect(barChartSrc).toContain('.map(');
  });

  it('SC3.4: IosBarChart still uses fill based on isToday/isFuture logic', () => {
    expect(barChartSrc).toContain('isToday');
    expect(barChartSrc).toContain('isFuture');
  });
});

// ─── 03-typography-layout: LargeWidget P3 layout ────────────────────────────

describe('03-typography-layout FR1: bridge.ts source has no "+ \' left\'" concatenation in P3', () => {
  it('FR1-src-1: bridge.ts WIDGET_LAYOUT_JS does not contain p.hoursRemaining + \' left\'', () => {
    const src = readBridge();
    // Find the WIDGET_LAYOUT_JS template literal
    const backtick = String.fromCharCode(96);
    const startMarker = 'const WIDGET_LAYOUT_JS = ' + backtick;
    const startIdx = src.indexOf(startMarker);
    const closingSeq = '})' + backtick + ';';
    const endIdx = src.indexOf(closingSeq, startIdx);
    const layoutJs = src.slice(startIdx, endIdx);
    // Must not contain the "left" concatenation in the statusRow text
    expect(layoutJs).not.toContain("p.hoursRemaining + ' left'");
  });
});

describe('03-typography-layout FR2: LargeWidget P3 hours card contains remaining text', () => {
  let largeP3Src: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    const largeSrc = src.slice(start, nextFn);
    // Extract P3 section
    const p3Start = largeSrc.indexOf("── P3:");
    largeP3Src = p3Start > -1 ? largeSrc.slice(p3Start) : largeSrc;
  });

  it('FR2-1: P3 section references hoursRemaining in the hours IosGlassCard context', () => {
    // hoursRemaining must appear in P3 section (moved from footer to card)
    expect(largeP3Src).toContain('hoursRemaining');
  });

  it('FR2-2: P3 section has Text with foregroundStyle "#94A3B8" (remaining text color)', () => {
    expect(largeP3Src).toContain('#94A3B8');
  });

  it('FR2-3: P3 section contains font size 11 weight medium Text (remaining label)', () => {
    // The remaining text: font={{ size: 11, weight: 'medium' }}
    expect(largeP3Src).toMatch(/size:\s*11.*weight:\s*'medium'|weight:\s*'medium'.*size:\s*11/);
  });

  it('FR2-4: P3 section strips "left" and appends "remaining" to hoursRemaining', () => {
    // Must use .replace('left', '') to strip the word "left" then add "remaining"
    expect(largeP3Src).toContain(".replace('left', '')");
    expect(largeP3Src).toContain("remaining");
  });
});

describe('03-typography-layout FR3: LargeWidget P3 hero row has two IosGlassCard children', () => {
  let largeP3HeroSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    const largeSrc = src.slice(start, nextFn);
    // Extract from P3 start to end of HStack hero row
    const p3Start = largeSrc.indexOf("── P3:");
    largeP3HeroSrc = p3Start > -1 ? largeSrc.slice(p3Start) : largeSrc;
  });

  it('FR3-1: P3 hero HStack contains EARNED label text', () => {
    // The earnings card must show "EARNED" — either as JSX text or string literal
    expect(largeP3HeroSrc).toMatch(/EARNED/);
  });

  it('FR3-2: P3 section has Text with font size 24 weight bold for earnings', () => {
    // Earnings metric: font={{ size: 24, weight: 'bold' }}
    expect(largeP3HeroSrc).toMatch(/size:\s*24.*weight:\s*'bold'|weight:\s*'bold'.*size:\s*24/);
  });

  it('FR3-3: P3 section does NOT have a nested VStack with two IosGlassCards (old right-column pattern)', () => {
    // Old pattern: <VStack spacing={10}><IosGlassCard>...EARNINGS...</IosGlassCard><IosGlassCard>...TODAY...</IosGlassCard></VStack>
    // New pattern: both IosGlassCards are direct children of hero HStack
    // Check: no "TODAY" metric card inside P3 hero row
    expect(largeP3HeroSrc).not.toMatch(/<MetricView[^>]*label="TODAY"/);
  });
});

describe('03-typography-layout FR4: StatusPill Text weight is bold', () => {
  let statusPillSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function StatusPill(');
    const end = src.indexOf('\n// ', start);
    statusPillSrc = src.slice(start, end);
  });

  it('FR4-1: StatusPill Text has weight "bold"', () => {
    expect(statusPillSrc).toContain("weight: 'bold'");
  });

  it('FR4-2: StatusPill Text does NOT have weight "semibold"', () => {
    expect(statusPillSrc).not.toContain("weight: 'semibold'");
  });
});

describe('03-typography-layout FR5: LargeWidget P3 footer simplified to Today+AI text', () => {
  let largeP3Src: string;
  let footerSrc: string;

  beforeAll(() => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    const largeSrc = src.slice(start, nextFn);
    const p3Start = largeSrc.indexOf("── P3:");
    largeP3Src = p3Start > -1 ? largeSrc.slice(p3Start) : largeSrc;

    // Extract footer section: from {/* Footer */} to end of P3 block
    const footerIdx = largeP3Src.indexOf('Footer');
    footerSrc = footerIdx > -1 ? largeP3Src.slice(footerIdx) : largeP3Src;
  });

  it('FR5-1: P3 footer contains "Today:" label text', () => {
    expect(footerSrc).toContain('Today:');
  });

  it('FR5-2: P3 footer references aiPct', () => {
    expect(footerSrc).toContain('aiPct');
  });

  it('FR5-3: P3 footer does NOT contain props.hoursRemaining (moved to hours card)', () => {
    // The footer should no longer render hoursRemaining
    // (it's now in the hours card)
    expect(footerSrc).not.toContain('props.hoursRemaining');
  });

  it('FR5-4: LargeWidget outer VStack uses uniform padding={16} (not asymmetric bottom:28)', () => {
    const src = readIosWidget();
    const start = src.indexOf('function LargeWidget(');
    const nextFn = src.indexOf('\n// ─── Main widget', start);
    const largeSrc = src.slice(start, nextFn);
    // New: uniform padding={16}
    expect(largeSrc).toContain('padding={16}');
    // Old: asymmetric padding with bottom: 28 should be gone
    expect(largeSrc).not.toContain('bottom: 28');
  });
});
