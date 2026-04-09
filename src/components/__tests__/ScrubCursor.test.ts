// Tests: buildScrubCursor utility (03-scrub-engine)
// FR3: buildScrubCursor — cursor geometry for Skia Canvas rendering
//
// Strategy:
// - Call buildScrubCursor directly (pure function, no React needed)
// - Assert returned coordinates and path object
// - Skia mock in __mocks__/@shopify/react-native-skia.ts handles Skia.Path()
// - Test all edge cases: left edge, right edge, normal case

import * as path from 'path';
import * as fs from 'fs';

// ─── File path constants ───────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const CURSOR_FILE = path.join(HOURGLASSWS_ROOT, 'src', 'components', 'ScrubCursor.ts');

// ─── FR3: buildScrubCursor — geometry ─────────────────────────────────────────

describe('FR3: buildScrubCursor', () => {
  let buildScrubCursor: (
    scrubX: number,
    scrubY: number,
    chartHeight: number,
    topPadding: number,
  ) => { linePath: any; dotX: number; dotY: number; dotRadius: number };

  beforeAll(() => {
    ({ buildScrubCursor } = require('@/src/components/ScrubCursor'));
  });

  describe('return shape', () => {
    it('returns an object with linePath, dotX, dotY, dotRadius', () => {
      const result = buildScrubCursor(100, 50, 200, 10);
      expect(result).toHaveProperty('linePath');
      expect(result).toHaveProperty('dotX');
      expect(result).toHaveProperty('dotY');
      expect(result).toHaveProperty('dotRadius');
    });

    it('linePath is non-null', () => {
      const result = buildScrubCursor(100, 50, 200, 10);
      expect(result.linePath).not.toBeNull();
      expect(result.linePath).toBeDefined();
    });
  });

  describe('dot coordinates', () => {
    it('dotX equals scrubX', () => {
      const result = buildScrubCursor(150, 75, 300, 20);
      expect(result.dotX).toBe(150);
    });

    it('dotY equals scrubY', () => {
      const result = buildScrubCursor(150, 75, 300, 20);
      expect(result.dotY).toBe(75);
    });

    it('dotRadius is fixed at 4', () => {
      const result = buildScrubCursor(150, 75, 300, 20);
      expect(result.dotRadius).toBe(4);
    });

    it('dotRadius is always 4 regardless of inputs', () => {
      const r1 = buildScrubCursor(0, 0, 100, 5);
      const r2 = buildScrubCursor(500, 500, 1000, 50);
      expect(r1.dotRadius).toBe(4);
      expect(r2.dotRadius).toBe(4);
    });
  });

  describe('line path construction', () => {
    it('calls moveTo on linePath (line starts at top)', () => {
      const result = buildScrubCursor(100, 50, 200, 10);
      expect(result.linePath.moveTo).toHaveBeenCalledWith(100, 10);
    });

    it('calls lineTo on linePath (line ends at bottom)', () => {
      const result = buildScrubCursor(100, 50, 200, 10);
      expect(result.linePath.lineTo).toHaveBeenCalledWith(100, 190); // 200 - 10
    });

    it('line top y = topPadding', () => {
      const result = buildScrubCursor(50, 100, 300, 25);
      expect(result.linePath.moveTo).toHaveBeenCalledWith(50, 25);
    });

    it('line bottom y = chartHeight - topPadding', () => {
      const result = buildScrubCursor(50, 100, 300, 25);
      expect(result.linePath.lineTo).toHaveBeenCalledWith(50, 275); // 300 - 25
    });

    it('line x coordinate matches scrubX in both moveTo and lineTo', () => {
      const scrubX = 77;
      const result = buildScrubCursor(scrubX, 40, 160, 8);
      const moveCall = result.linePath.moveTo.mock.calls[0];
      const lineCall = result.linePath.lineTo.mock.calls[0];
      expect(moveCall[0]).toBe(scrubX);
      expect(lineCall[0]).toBe(scrubX);
    });
  });

  describe('edge cases', () => {
    it('scrubX = 0 (left edge) — no crash', () => {
      expect(() => buildScrubCursor(0, 50, 200, 10)).not.toThrow();
      const result = buildScrubCursor(0, 50, 200, 10);
      expect(result.dotX).toBe(0);
    });

    it('scrubX = chartWidth (right edge) — no crash', () => {
      const chartWidth = 300;
      expect(() => buildScrubCursor(chartWidth, 50, 200, 10)).not.toThrow();
      const result = buildScrubCursor(chartWidth, 50, 200, 10);
      expect(result.dotX).toBe(chartWidth);
    });

    it('scrubX = chartWidth — line path still built correctly', () => {
      const result = buildScrubCursor(300, 100, 200, 10);
      expect(result.linePath.moveTo).toHaveBeenCalledWith(300, 10);
      expect(result.linePath.lineTo).toHaveBeenCalledWith(300, 190);
    });
  });
});

// ─── FR3: source contract (static analysis) ───────────────────────────────────

describe('FR3: ScrubCursor — source contract', () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(CURSOR_FILE)).toBe(true);
    source = fs.readFileSync(CURSOR_FILE, 'utf-8');
  });

  it('exports buildScrubCursor function', () => {
    expect(source).toMatch(/export\s+function\s+buildScrubCursor/);
  });

  it('exports ScrubCursorResult interface', () => {
    expect(source).toMatch(/export\s+(interface|type)\s+ScrubCursorResult/);
  });

  it('defines dotRadius as a fixed constant 4', () => {
    expect(source).toMatch(/dotRadius:\s*4/);
  });

  it('uses Skia.Path to create the line path', () => {
    expect(source).toMatch(/Skia\.Path/);
  });
});
