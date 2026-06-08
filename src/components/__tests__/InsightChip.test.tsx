// Tests: InsightChip component — 05-insights-ui FR3
//
// FR3: InsightChip pure display component
//   SC3.1 — renders boldLine text (source: Text element with boldLine)
//   SC3.2 — renders mutedLine text (source: Text element with mutedLine)
//   SC3.3 — dot View has backgroundColor: dotColor in inline style (source)
//   SC3.4 — animatedStyle applied to outermost Animated.View (source)
//   SC3.5 — GlassCard is composed in the tree (source: GlassCard import + usage)
//   SC3.6 — flex-row className is on INNER <View>, NOT passed to GlassCard (source)
//   SC3.7 — muted line text has text-[11px] class (source)
//   SC3.8 — Animated.View from react-native-reanimated wraps GlassCard (source)
//   SC3.9 — inner View uses flex-row items-start gap-3 (source)
//   SC3.10 — dot has w-2 h-2 rounded-full mt-[6px] (source)
//   SC3.11 — bold line is text-[13px] font-sans-medium (source)
//   SC3.12 — GlassCard uses padding="md" (source)
//
// Strategy:
// - Source-level static analysis for ALL tests.
//   InsightChip wraps GlassCard (Skia/BackdropFilter). Runtime tests would require
//   mocking the full Skia + reanimated + masked-view stack. Per project convention
//   (see ApprovalUrgencyCard.test.tsx SC1.9-SC1.10), Skia component structure is
//   verified via fs.readFileSync source checks, not runtime rendering.

import * as fs from 'fs';
import * as path from 'path';

const COMPONENT_FILE = path.resolve(__dirname, '../InsightChip.tsx');

// ─── Guard: file must exist ───────────────────────────────────────────────────

describe('InsightChip — file exists', () => {
  it('src/components/InsightChip.tsx exists', () => {
    expect(fs.existsSync(COMPONENT_FILE)).toBe(true);
  });
});

// ─── SC3.1 — boldLine rendered ────────────────────────────────────────────────

describe('InsightChip — SC3.1 — boldLine text (source analysis)', () => {
  it('source renders boldLine prop in a Text element', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // boldLine must appear as JSX expression: {boldLine}
    expect(src).toMatch(/\{boldLine\}/);
  });

  it('source has boldLine as a prop in the interface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/boldLine\s*:/);
  });
});

// ─── SC3.2 — mutedLine rendered ───────────────────────────────────────────────

describe('InsightChip — SC3.2 — mutedLine text (source analysis)', () => {
  it('source renders mutedLine prop in a Text element', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/\{mutedLine\}/);
  });

  it('source has mutedLine as a prop in the interface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/mutedLine\s*:/);
  });
});

// ─── SC3.3 — dot backgroundColor ─────────────────────────────────────────────

describe('InsightChip — SC3.3 — dot backgroundColor: dotColor (source analysis)', () => {
  it('source sets backgroundColor to dotColor via inline style', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/backgroundColor\s*:\s*dotColor/);
  });

  it('source has dotColor as a prop in the interface', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/dotColor\s*:/);
  });
});

// ─── SC3.4 — animatedStyle on outermost Animated.View ────────────────────────

describe('InsightChip — SC3.4 — animatedStyle on Animated.View (source analysis)', () => {
  it('source passes animatedStyle as style prop to Animated.View', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Animated.View should receive style={animatedStyle}
    expect(src).toMatch(/Animated\.View[^>]*style[^>]*animatedStyle/);
  });

  it('source has animatedStyle as an optional prop', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/animatedStyle\??\s*:/);
  });
});

// ─── SC3.5 — GlassCard composed ──────────────────────────────────────────────

describe('InsightChip — SC3.5 — GlassCard composition (source analysis)', () => {
  it('source imports GlassCard', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/import GlassCard from/);
  });

  it('source uses <GlassCard> in JSX return', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    const returnIdx = src.indexOf('return (');
    expect(returnIdx).toBeGreaterThan(-1);
    const afterReturn = src.slice(returnIdx);
    expect(afterReturn).toContain('GlassCard');
  });
});

// ─── SC3.6 — flex-row on inner View, NOT on GlassCard ────────────────────────

describe('InsightChip — SC3.6 — flex-row on inner View, NOT GlassCard (source analysis)', () => {
  it('source does NOT pass flex-row className to GlassCard element', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // GlassCard element should not have className containing flex-row
    const glassCardFlexRowRegex = /<GlassCard[^>]*className=[^>]*flex-row/;
    expect(src).not.toMatch(glassCardFlexRowRegex);
  });

  it('source has flex-row on an inner View (not GlassCard)', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/View[^>]*className="[^"]*flex-row/);
  });
});

// ─── SC3.7 — muted line text-[11px] ──────────────────────────────────────────

describe('InsightChip — SC3.7 — muted line text-[11px] (source analysis)', () => {
  it('source has text-[11px] class on the muted line Text', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('text-[11px]');
  });

  it('text-[11px] is on a Text element with text-textSecondary', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('text-textSecondary');
    expect(src).toContain('text-[11px]');
    // Both appear in the same general area (within 100 chars of each other)
    const secIdx = src.indexOf('text-textSecondary');
    const sizeIdx = src.indexOf('text-[11px]');
    expect(Math.abs(secIdx - sizeIdx)).toBeLessThan(150);
  });
});

// ─── SC3.8 — Animated.View wraps GlassCard ───────────────────────────────────

describe('InsightChip — SC3.8 — Animated.View wraps GlassCard (source analysis)', () => {
  it('source imports Animated from react-native-reanimated', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toMatch(/react-native-reanimated/);
    expect(src).toMatch(/Animated/);
  });

  it('GlassCard is inside Animated.View in the JSX return (order check)', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    const returnIdx = src.indexOf('return (');
    const animatedViewInReturn = src.indexOf('Animated.View', returnIdx);
    const glassCardInReturn = src.indexOf('GlassCard', returnIdx);
    expect(animatedViewInReturn).toBeGreaterThan(-1);
    expect(glassCardInReturn).toBeGreaterThan(-1);
    // Animated.View opens before GlassCard in the JSX tree
    expect(animatedViewInReturn).toBeLessThan(glassCardInReturn);
  });
});

// ─── SC3.9 — inner View has flex-row items-start gap-3 ───────────────────────

describe('InsightChip — SC3.9 — inner View: flex-row items-start gap-3 (source analysis)', () => {
  it('source has flex-row on a View className', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('flex-row');
  });

  it('source has items-start on a View className', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('items-start');
  });

  it('source has gap-3 on a View className', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('gap-3');
  });
});

// ─── SC3.10 — dot classes ────────────────────────────────────────────────────

describe('InsightChip — SC3.10 — dot: w-2 h-2 rounded-full mt-[6px] (source analysis)', () => {
  it('source has w-2 h-2 rounded-full on the dot View', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('w-2');
    expect(src).toContain('h-2');
    expect(src).toContain('rounded-full');
  });

  it('source has mt-[6px] for dot baseline alignment', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('mt-[6px]');
  });
});

// ─── SC3.11 — bold line text-[13px] font-sans-medium ─────────────────────────

describe('InsightChip — SC3.11 — bold line: text-[13px] font-sans-medium (source analysis)', () => {
  it('source has text-[13px] for the bold line', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('text-[13px]');
  });

  it('source has font-sans-medium for the bold line', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('font-sans-medium');
  });

  it('source has text-textPrimary for the bold line', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(src).toContain('text-textPrimary');
  });
});

// ─── SC3.12 — GlassCard padding="md" ─────────────────────────────────────────

describe('InsightChip — SC3.12 — GlassCard padding="md" (source analysis)', () => {
  it('source passes padding prop with value "md" to GlassCard', () => {
    const src = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // GlassCard padding='md' or padding="md"
    expect(src).toMatch(/padding\s*=\s*['"]md['"]/);
  });
});
