// Tests: aiTier.ts — FR3 (10-mesh-color-overhaul)
// classifyAIPct: maps AI usage percentage to performance tier label + accent color
//
// Color tokens used (from src/lib/colors.ts):
//   infoBlue:    '#60A5FA'  — AI Leader (>= 75%)
//   successGreen:'#4ADE80'  — Consistent Progress (>= 50%)
//   warnAmber:   '#FCD34D'  — Building Momentum (>= 30%)
//   textMuted:   '#757575'  — Getting Started (< 30%)
//   NOTE: textMuted is '#757575', not '#A0A0A0' (textSecondary).
//   The spec-research references '#A0A0A0' as the color for Getting Started,
//   but the implementation uses colors.textMuted which is '#757575'.
//   These tests verify the actual token value used in the implementation.

import { classifyAIPct, AITier } from '../aiTier';
import { colors } from '../colors';

describe('classifyAIPct — FR3: AI tier classification', () => {
  // ── Boundary: AI Leader (>= 75) ───────────────────────────────────────────

  it('FR3.1 — avg=75 → AI Leader with infoBlue color', () => {
    const result = classifyAIPct(75);
    expect(result.label).toBe('AI Leader');
    expect(result.color).toBe(colors.infoBlue);
  });

  it('FR3.1b — avg=75 → color is #60A5FA', () => {
    const result = classifyAIPct(75);
    expect(result.color.toLowerCase()).toBe('#60a5fa');
  });

  it('FR3.2 — avg=100 → AI Leader', () => {
    const result = classifyAIPct(100);
    expect(result.label).toBe('AI Leader');
    expect(result.color).toBe(colors.infoBlue);
  });

  it('FR3.3 — avg=80 → AI Leader', () => {
    const result = classifyAIPct(80);
    expect(result.label).toBe('AI Leader');
    expect(result.color).toBe(colors.infoBlue);
  });

  // ── Boundary: Consistent Progress (>= 50, < 75) ──────────────────────────

  it('FR3.4 — avg=74 → Consistent Progress with successGreen color', () => {
    const result = classifyAIPct(74);
    expect(result.label).toBe('Consistent Progress');
    expect(result.color).toBe(colors.successGreen);
  });

  it('FR3.4b — avg=74 → color is #4ADE80', () => {
    const result = classifyAIPct(74);
    expect(result.color.toLowerCase()).toBe('#4ade80');
  });

  it('FR3.5 — avg=50 → Consistent Progress', () => {
    const result = classifyAIPct(50);
    expect(result.label).toBe('Consistent Progress');
    expect(result.color).toBe(colors.successGreen);
  });

  it('FR3.6 — avg=60 → Consistent Progress', () => {
    const result = classifyAIPct(60);
    expect(result.label).toBe('Consistent Progress');
    expect(result.color).toBe(colors.successGreen);
  });

  // ── Boundary: Building Momentum (>= 30, < 50) ────────────────────────────

  it('FR3.7 — avg=49 → Building Momentum with warnAmber color', () => {
    const result = classifyAIPct(49);
    expect(result.label).toBe('Building Momentum');
    expect(result.color).toBe(colors.warnAmber);
  });

  it('FR3.7b — avg=49 → color is #FCD34D', () => {
    const result = classifyAIPct(49);
    expect(result.color.toLowerCase()).toBe('#fcd34d');
  });

  it('FR3.8 — avg=30 → Building Momentum', () => {
    const result = classifyAIPct(30);
    expect(result.label).toBe('Building Momentum');
    expect(result.color).toBe(colors.warnAmber);
  });

  it('FR3.9 — avg=40 → Building Momentum', () => {
    const result = classifyAIPct(40);
    expect(result.label).toBe('Building Momentum');
    expect(result.color).toBe(colors.warnAmber);
  });

  // ── Boundary: Getting Started (< 30) ─────────────────────────────────────

  it('FR3.10 — avg=29 → Getting Started with textMuted color (#757575)', () => {
    const result = classifyAIPct(29);
    expect(result.label).toBe('Getting Started');
    expect(result.color).toBe(colors.textMuted);
    // Note: textMuted = '#757575'. spec-research shows '#A0A0A0' which is textSecondary.
    // We use textMuted to match original ai.tsx behavior.
  });

  it('FR3.11 — avg=0 → Getting Started', () => {
    const result = classifyAIPct(0);
    expect(result.label).toBe('Getting Started');
    expect(result.color).toBe(colors.textMuted);
  });

  it('FR3.12 — avg=15 → Getting Started', () => {
    const result = classifyAIPct(15);
    expect(result.label).toBe('Getting Started');
    expect(result.color).toBe(colors.textMuted);
  });

  // ── Return type shape ─────────────────────────────────────────────────────

  it('FR3.13 — return value has label and color fields', () => {
    const result = classifyAIPct(50);
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('color');
    expect(typeof result.label).toBe('string');
    expect(typeof result.color).toBe('string');
  });

  it('FR3.14 — returned color is a non-empty string for all tiers', () => {
    [100, 60, 40, 10].forEach(avg => {
      const result = classifyAIPct(avg);
      expect(result.color.length).toBeGreaterThan(0);
    });
  });
});

describe('AITier interface — FR3: type contract', () => {
  it('FR3.15 — AITier is exported and has label + color shape', () => {
    // Structural: create an object satisfying the AITier interface
    const tier: AITier = { label: 'test', color: '#000000' };
    expect(tier.label).toBe('test');
    expect(tier.color).toBe('#000000');
  });
});

describe('classifyAIPct — color token consistency', () => {
  it('FR3.16 — AI Leader color matches colors.infoBlue token value', () => {
    expect(colors.infoBlue).toBeDefined();
    expect(classifyAIPct(75).color).toBe(colors.infoBlue);
  });

  it('FR3.17 — Consistent Progress color matches colors.successGreen token value', () => {
    expect(colors.successGreen).toBeDefined();
    expect(classifyAIPct(50).color).toBe(colors.successGreen);
  });

  it('FR3.18 — Building Momentum color matches colors.warnAmber token value', () => {
    expect(colors.warnAmber).toBeDefined();
    expect(classifyAIPct(30).color).toBe(colors.warnAmber);
  });

  it('FR3.19 — Getting Started color matches colors.textMuted token value', () => {
    expect(colors.textMuted).toBeDefined();
    expect(classifyAIPct(0).color).toBe(colors.textMuted);
  });
});
