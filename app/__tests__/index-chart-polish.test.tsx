// Tests: app/(tabs)/index.tsx — 04-chart-polish FR4
//
// FR4: Home screen TODAY_BAR_COLORS mapping
//   SC-FR4.1 — TODAY_BAR_COLORS declared as a Record covering all 6 PanelState values
//   SC-FR4.2 — onTrack maps to colors.success
//   SC-FR4.3 — behind maps to colors.warning
//   SC-FR4.4 — critical maps to colors.critical
//   SC-FR4.5 — crushedIt maps to colors.overtimeWhiteGold
//   SC-FR4.6 — overtime maps to colors.overtimeWhiteGold
//   SC-FR4.7 — idle maps to colors.textMuted
//   SC-FR4.8 — WeeklyBarChart receives todayColor prop driven by panelState
//
// Strategy:
// - Static source analysis for structural contracts
// - The TODAY_BAR_COLORS map and todayColor wiring are verified by inspecting source text

import * as path from 'path';
import * as fs from 'fs';

// ─── File path ────────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../..');
const INDEX_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'index.tsx');
const COLORS_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'lib', 'colors.ts');

// ─── FR4 (04-chart-polish): TODAY_BAR_COLORS mapping ─────────────────────────

describe('index.tsx — FR4 (04-chart-polish): TODAY_BAR_COLORS + todayColor wiring', () => {
  let source: string;
  let colorsSource: string;

  beforeAll(() => {
    source = fs.readFileSync(INDEX_FILE, 'utf8');
    colorsSource = fs.readFileSync(COLORS_FILE, 'utf8');
  });

  it('SC-FR4.1 — TODAY_BAR_COLORS is declared in index.tsx', () => {
    expect(source).toMatch(/TODAY_BAR_COLORS/);
  });

  it('SC-FR4.2 — onTrack maps to colors.success', () => {
    // Either: onTrack: colors.success or onTrack: '#10B981'
    expect(source).toMatch(/onTrack\s*:\s*colors\.success/);
  });

  it('SC-FR4.3 — behind maps to colors.warning', () => {
    expect(source).toMatch(/behind\s*:\s*colors\.warning/);
  });

  it('SC-FR4.4 — critical maps to colors.critical', () => {
    expect(source).toMatch(/critical\s*:\s*colors\.critical/);
  });

  it('SC-FR4.5 — crushedIt maps to colors.overtimeWhiteGold', () => {
    expect(source).toMatch(/crushedIt\s*:\s*colors\.overtimeWhiteGold/);
  });

  it('SC-FR4.6 — overtime maps to colors.overtimeWhiteGold', () => {
    expect(source).toMatch(/overtime\s*:\s*colors\.overtimeWhiteGold/);
  });

  it('SC-FR4.7 — idle maps to colors.textMuted', () => {
    expect(source).toMatch(/idle\s*:\s*colors\.textMuted/);
  });

  it('SC-FR4.8 — WeeklyBarChart receives todayColor prop in index.tsx', () => {
    // todayColor={TODAY_BAR_COLORS[panelState]} or similar
    expect(source).toMatch(/todayColor=\{TODAY_BAR_COLORS\[panelState\]\}/);
  });

  it('SC-FR4.9 — TODAY_BAR_COLORS covers all 6 PanelState values', () => {
    // All 6 keys present in the map
    const allStates = ['onTrack', 'behind', 'critical', 'crushedIt', 'overtime', 'idle'];
    for (const state of allStates) {
      expect(source).toMatch(new RegExp(state + '\\s*:'));
    }
  });

  it('SC-FR4.10 — colors.overtimeWhiteGold token exists in colors.ts', () => {
    expect(colorsSource).toMatch(/overtimeWhiteGold/);
  });
});
