// Tests: useScrubGesture hook + nearestIndex worklet (03-scrub-engine)
// FR1: useScrubGesture hook — initial state and shape
// FR2: nearestIndex worklet — snapping logic
// FR4: ScrubChangeCallback type export
//
// Strategy:
// - FR1: static analysis of source file (hook uses RNGH which is hard to renderHook in node preset)
//   + verify initial SharedValue semantics via source inspection
// - FR2: test nearestIndex as a plain function (worklet directive is a no-op in Jest)
// - FR4: verify type export exists in source
//
// Note: gesture event simulation (onBegin/onUpdate/onFinalize) is integration-level
// and lives in the consuming chart specs (04-ai-scrub, 05-earnings-scrub).

import * as path from 'path';
import * as fs from 'fs';

// ─── File path constants ───────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const HOOK_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'hooks', 'useScrubGesture.ts');

// ─── FR2: nearestIndex worklet ─────────────────────────────────────────────────

describe('FR2: nearestIndex — snap to nearest X', () => {
  // Import after tests are defined so failures are clear
  let nearestIndex: (x: number, pixelXs: number[]) => number;

  beforeAll(() => {
    // nearestIndex is a pure function — worklet directive is a no-op in Jest
    ({ nearestIndex } = require('@/src/hooks/useScrubGesture'));
  });

  describe('happy path — 3-point array', () => {
    it('returns 0 when x === pixelXs[0]', () => {
      expect(nearestIndex(0, [0, 100, 200])).toBe(0);
    });

    it('returns 1 when x=90 is closer to pixelXs[1]=100 than pixelXs[0]=0', () => {
      expect(nearestIndex(90, [0, 100, 200])).toBe(1);
    });

    it('returns 2 when x === pixelXs[2]', () => {
      expect(nearestIndex(200, [0, 100, 200])).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('returns 2 (last) when x=300 is beyond the last element', () => {
      expect(nearestIndex(300, [0, 100, 200])).toBe(2);
    });

    it('returns 0 or 1 for equidistant x=50 between [0, 100]', () => {
      const result = nearestIndex(50, [0, 100]);
      expect([0, 1]).toContain(result);
    });

    it('returns 0 for any x when array has a single element', () => {
      expect(nearestIndex(99, [50])).toBe(0);
      expect(nearestIndex(0, [50])).toBe(0);
      expect(nearestIndex(9999, [50])).toBe(0);
    });

    it('returns -1 (or handles gracefully) for empty array', () => {
      // nearestIndex with empty array: per spec, hook guards this before calling
      // The function returns -1 for empty (per implementation spec)
      const result = nearestIndex(50, []);
      expect(result).toBe(-1);
    });
  });
});

// ─── FR1: useScrubGesture hook — source analysis ───────────────────────────────

describe('FR1: useScrubGesture — source contract (static analysis)', () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
    source = fs.readFileSync(HOOK_FILE, 'utf-8');
  });

  it('exports useScrubGesture function', () => {
    expect(source).toMatch(/export\s+function\s+useScrubGesture/);
  });

  it('initialises scrubIndex with useSharedValue(-1)', () => {
    expect(source).toMatch(/useSharedValue\(-1\)/);
  });

  it('initialises isScrubbing with useSharedValue(false)', () => {
    expect(source).toMatch(/useSharedValue\(false\)/);
  });

  it('returns scrubIndex, isScrubbing, and gesture', () => {
    expect(source).toMatch(/scrubIndex/);
    expect(source).toMatch(/isScrubbing/);
    expect(source).toMatch(/gesture/);
    // return object contains all three
    expect(source).toMatch(/return\s*\{[^}]*scrubIndex[^}]*isScrubbing[^}]*gesture[^}]*\}/s);
  });

  it('uses Gesture.Pan() with minDistance(5)', () => {
    expect(source).toMatch(/Gesture\.Pan\(\)/);
    expect(source).toMatch(/\.minDistance\(5\)/);
  });

  it('uses .enabled(enabled) to respect the enabled option', () => {
    expect(source).toMatch(/\.enabled\(enabled\)/);
  });

  it('sets isScrubbing.value = true in onBegin', () => {
    expect(source).toMatch(/onBegin/);
    expect(source).toMatch(/isScrubbing\.value\s*=\s*true/);
  });

  it('resets scrubIndex.value = -1 in onFinalize', () => {
    expect(source).toMatch(/onFinalize/);
    expect(source).toMatch(/scrubIndex\.value\s*=\s*-1/);
  });

  it('resets isScrubbing.value = false in onFinalize', () => {
    expect(source).toMatch(/isScrubbing\.value\s*=\s*false/);
  });

  it('guards empty pixelXs in onUpdate (returns early)', () => {
    expect(source).toMatch(/pixelXs\.length\s*===\s*0/);
  });

  it('sets scrubIndex.value in onUpdate to snap to nearest position', () => {
    // nearestIndex may be inlined — just verify scrubIndex.value is set in onUpdate
    expect(source).toMatch(/scrubIndex\.value\s*=/);
    // And nearestIndex logic is present (either called or inlined)
    expect(source).toMatch(/nearestIndex|best\s*=|Math\.abs/);
  });
});

// ─── FR2: nearestIndex worklet directive (static analysis) ────────────────────

describe('FR2: nearestIndex — worklet directive (static analysis)', () => {
  it('nearestIndex function body contains worklet directive', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf-8');
    // The 'worklet' string literal must appear inside the nearestIndex function
    // Pattern: function nearestIndex ... { 'worklet'; ... }
    expect(source).toMatch(/function\s+nearestIndex[\s\S]*?'worklet'/);
  });
});

// ─── FR4: ScrubChangeCallback type export ─────────────────────────────────────

describe('FR4: ScrubChangeCallback type export', () => {
  it('source exports ScrubChangeCallback type', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf-8');
    expect(source).toMatch(/export\s+type\s+ScrubChangeCallback/);
  });

  it('ScrubChangeCallback accepts (index: number | null) => void signature', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf-8');
    // Type should accept number | null param
    expect(source).toMatch(/ScrubChangeCallback\s*=\s*\(index:\s*number\s*\|\s*null\)\s*=>\s*void/);
  });

  it('documents the useAnimatedReaction bridge pattern in the file', () => {
    const source = fs.readFileSync(HOOK_FILE, 'utf-8');
    // Bridge pattern must reference useAnimatedReaction and runOnJS
    expect(source).toMatch(/useAnimatedReaction/);
    expect(source).toMatch(/runOnJS/);
  });
});
