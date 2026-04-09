// Tests: ApprovalCard colour semantics
// FR1 (01-color-semantics): Manual badge uses violet, not gold
// FR2 (01-color-semantics): Approve/Reject button colours
//
// Updated for 01-glass-swipe-card:
//   - Badge opacity changed from /20 to /15 (glass surface spec decision)
//   - Approve button uses bg-success/10 (glass treatment, not violet)
//   - Reject button uses bg-destructive/10 (glass treatment)
//
// Strategy: source-level assertions via fs.readFileSync
// This avoids NativeWind rendering complexity in Jest.

import * as fs from 'fs';
import * as path from 'path';

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const APPROVAL_CARD_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'ApprovalCard.tsx');

let source: string;

beforeAll(() => {
  source = fs.readFileSync(APPROVAL_CARD_FILE, 'utf-8');
});

// ─── FR1: Manual badge colour ─────────────────────────────────────────────────

describe('ApprovalCard — FR1 (01-color-semantics): Manual badge colour', () => {
  it('Manual badge container does NOT use bg-gold/20', () => {
    expect(source).not.toContain('bg-gold/20');
  });

  it('Manual badge text does NOT use text-gold for badge label', () => {
    // text-gold is allowed for overtime cost display (monetary value — gold semantics)
    // but must NOT be used for the category badge label
    // Check: no text-gold within ~50 chars of the badge container class
    expect(source).not.toMatch(/bg-violet\/15[\s\S]{0,200}text-gold/);
  });

  it('Manual badge container uses bg-violet/15 (01-glass-swipe-card: opacity updated to /15)', () => {
    // Updated from bg-violet/20 → bg-violet/15 in 01-glass-swipe-card spec
    // /15 is the correct opacity for category badges in the glass surface context
    expect(source).toContain('bg-violet/15');
  });

  it('Manual badge text uses text-violet', () => {
    expect(source).toContain('text-violet');
  });
});

// ─── FR2: Approve/Reject button colour ────────────────────────────────────────

describe('ApprovalCard — FR2 (01-color-semantics + 01-glass-swipe-card): Button colours', () => {
  it('Approve button uses bg-success/10 (glass card treatment)', () => {
    // 01-glass-swipe-card uses success/destructive for action buttons
    // (face overlays use success/destructive for the full glass glow effect)
    expect(source).toContain('bg-success/10');
  });

  it('Approve button uses text-success label', () => {
    expect(source).toContain('text-success');
  });

  it('Reject button uses bg-destructive/10 (glass card treatment)', () => {
    expect(source).toContain('bg-destructive/10');
  });

  it('Reject button uses text-destructive label', () => {
    expect(source).toContain('text-destructive');
  });

  it('No bg-success/20 — glass card uses /10 opacity for buttons', () => {
    expect(source).not.toContain('bg-success/20');
  });

  it('No bg-destructive/20 — glass card uses /10 opacity for buttons', () => {
    expect(source).not.toContain('bg-destructive/20');
  });
});
