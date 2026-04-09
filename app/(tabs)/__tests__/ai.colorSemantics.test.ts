// Tests: AI tab colour semantics (01-color-semantics)
// FR5: "Building Momentum" tier uses warning colour, not gold
//
// Strategy: source-level assertions via fs.readFileSync

import * as fs from 'fs';
import * as path from 'path';

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const AI_TAB_FILE = path.join(HOURGLASSWS_ROOT, 'app', '(tabs)', 'ai.tsx');

let source: string;

beforeAll(() => {
  source = fs.readFileSync(AI_TAB_FILE, 'utf-8');
});

// ─── FR5: Building Momentum tier colour ───────────────────────────────────────

describe('AI tab — FR5 (01-color-semantics): Building Momentum tier colour', () => {
  it('Building Momentum tier does NOT use colors.gold', () => {
    // The string "Building Momentum" must not appear near "colors.gold"
    expect(source).not.toMatch(/Building Momentum[\s\S]{0,100}colors\.gold/);
  });

  it('Building Momentum tier uses colors.warning', () => {
    expect(source).toMatch(/Building Momentum[\s\S]{0,100}colors\.warning/);
  });

  it('Source does not contain colors.gold for the Building Momentum label', () => {
    // Also assert from the gold side: if gold appears, it must not be near Building Momentum
    if (source.includes('colors.gold')) {
      expect(source).not.toMatch(/Building Momentum[\s\S]{0,100}colors\.gold/);
    }
  });
});
