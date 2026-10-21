// Tests: buildScrubCursor utility (03-scrub-engine)
// FR3: buildScrubCursor — cursor geometry for Skia Canvas rendering
//
// Strategy:
// - Call buildScrubCursor directly (pure function, no React needed)
// - Assert returned coordinates and path object
// - Skia mock in __mocks__/@shopify/react-native-skia.ts handles Skia.Path.MakeFromSVGString
//   (spied per test to assert the exact SVG string; 10-sdk-58-ios-27 FR2)
// - Test all edge cases: left edge, right edge, normal case

import * as path from 'path';
import * as fs from 'fs';
import { Skia } from '@shopify/react-native-skia'; // the shared mock (__mocks__/@shopify)

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

  // 10-sdk-58-ios-27 FR2: the line is parsed from an SVG string, not mutated with
  // moveTo/lineTo (Skia 2.14 removes the mutable SkPath API; MakeFromSVGString exists in
  // both 2.4.18 and 2.14.0). The spy wraps the shared Skia mock and calls through.
  describe('line path construction (10 FR2: MakeFromSVGString)', () => {
    let makeFromSvg: jest.SpyInstance;

    beforeEach(() => {
      makeFromSvg = jest.spyOn(Skia.Path, 'MakeFromSVGString');
    });

    afterEach(() => {
      makeFromSvg.mockRestore();
    });

    it('builds the line from exactly "M 40 8 L 40 112" for (scrubX=40, chartHeight=120, topPadding=8)', () => {
      buildScrubCursor(40, 60, 120, 8);
      expect(makeFromSvg).toHaveBeenCalledTimes(1);
      expect(makeFromSvg).toHaveBeenCalledWith('M 40 8 L 40 112');
    });

    it('linePath is the path MakeFromSVGString returned', () => {
      const result = buildScrubCursor(100, 50, 200, 10);
      expect(result.linePath).toBe(makeFromSvg.mock.results[0].value);
    });

    it('line top y = topPadding', () => {
      buildScrubCursor(50, 100, 300, 25);
      expect(makeFromSvg.mock.calls[0][0]).toMatch(/^M 50 25 /);
    });

    it('line bottom y = chartHeight - topPadding', () => {
      buildScrubCursor(50, 100, 300, 25);
      expect(makeFromSvg.mock.calls[0][0]).toMatch(/ L 50 275$/); // 300 - 25
    });

    it('line x coordinate matches scrubX at both ends', () => {
      buildScrubCursor(77, 40, 160, 8);
      expect(makeFromSvg).toHaveBeenCalledWith('M 77 8 L 77 152');
    });

    it('falls back to the "M 0 0" path if the SVG string fails to parse', () => {
      const fallback = { fallback: true };
      makeFromSvg.mockReturnValueOnce(null).mockReturnValueOnce(fallback);
      const result = buildScrubCursor(10, 20, 100, 5);
      expect(makeFromSvg.mock.calls.map((c) => c[0])).toEqual(['M 10 5 L 10 95', 'M 0 0']);
      expect(result.linePath).toBe(fallback);
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
      const makeFromSvg = jest.spyOn(Skia.Path, 'MakeFromSVGString');
      try {
        buildScrubCursor(300, 100, 200, 10);
        expect(makeFromSvg).toHaveBeenCalledWith('M 300 10 L 300 190');
      } finally {
        makeFromSvg.mockRestore();
      }
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

  it('uses Skia.Path.MakeFromSVGString to create the line path (10 FR2)', () => {
    expect(source).toMatch(/Skia\.Path\.MakeFromSVGString\(/);
  });
});
