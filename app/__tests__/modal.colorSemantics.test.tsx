// Tests: modal.tsx Switch colour semantics (01-color-semantics)
// FR4: Settings Switch uses violet trackColor and textPrimary thumbColor
//
// Strategy: source-level assertions via fs.readFileSync
// Verifies brand token usage without requiring component rendering.

import * as fs from 'fs';
import * as path from 'path';

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../..');
const MODAL_FILE = path.join(HOURGLASSWS_ROOT, 'app', 'modal.tsx');

let source: string;

beforeAll(() => {
  source = fs.readFileSync(MODAL_FILE, 'utf-8');
});

// ─── FR4: Switch trackColor ───────────────────────────────────────────────────

describe('modal.tsx — FR4 (01-color-semantics): Switch trackColor', () => {
  it('Switch uses colors.violet as active track colour', () => {
    expect(source).toContain('colors.violet');
  });

  it('Switch uses colors.border as inactive track colour', () => {
    expect(source).toContain('colors.border');
  });

  it('Switch trackColor includes false: colors.border', () => {
    expect(source).toContain('false: colors.border');
  });

  it('Switch trackColor includes true: colors.violet', () => {
    expect(source).toContain('true: colors.violet');
  });

  it('Switch thumbColor uses colors.textPrimary (not hardcoded hex)', () => {
    expect(source).toContain('thumbColor={colors.textPrimary}');
  });

  it('No hardcoded #FFFFFF as thumbColor', () => {
    expect(source).not.toContain('thumbColor="#FFFFFF"');
  });
});
