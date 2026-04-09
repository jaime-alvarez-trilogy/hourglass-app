// Tests: chartData utility (04-victory-charts FR1)
//
// FR1: toBarData and toLineData normalizers
//   SC1.1 — toBarData exported with correct signature
//   SC1.2 — toLineData exported with correct signature
//   SC1.3 — BarDatum shape: { day: number; value: number; color: string }
//   SC1.4 — LineDatum shape: { x: number; y: number }
//   SC1.5 — toBarData assigns todayColor to todayIndex
//   SC1.6 — toBarData assigns colors.success to indices < todayIndex
//   SC1.7 — toBarData assigns colors.textMuted to indices > todayIndex
//   SC1.8 — toBarData([1..7], 3, '#10B981') returns 7 elements with correct colors
//   SC1.9 — toLineData([1,2,3]) returns [{x:0,y:1},{x:1,y:2},{x:2,y:3}]
//   SC1.10 — toLineData([]) returns []
//   SC1.11 — toBarData([], 0, '#fff') returns []

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const CHART_DATA_FILE = path.resolve(__dirname, '../chartData.ts');

// ─── Module import ────────────────────────────────────────────────────────────

let toBarData: (values: number[], todayIndex: number, todayColor: string) => any[];
let toLineData: (values: number[]) => any[];

beforeAll(() => {
  const mod = require('../chartData');
  toBarData = mod.toBarData;
  toLineData = mod.toLineData;
});

// ─── FR1: Source structure ────────────────────────────────────────────────────

describe('chartData — source structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHART_DATA_FILE, 'utf8');
  });

  it('SC1.1 — toBarData is exported', () => {
    expect(source).toMatch(/export\s+function\s+toBarData|export\s*\{\s*[\s\S]*toBarData/);
  });

  it('SC1.2 — toLineData is exported', () => {
    expect(source).toMatch(/export\s+function\s+toLineData|export\s*\{\s*[\s\S]*toLineData/);
  });

  it('SC1.3 — BarDatum type has day, value, color fields', () => {
    expect(source).toMatch(/BarDatum/);
    expect(source).toMatch(/day\s*:/);
    expect(source).toMatch(/value\s*:/);
    expect(source).toMatch(/color\s*:/);
  });

  it('SC1.4 — LineDatum type has x and y fields', () => {
    expect(source).toMatch(/LineDatum/);
    expect(source).toMatch(/x\s*:/);
    expect(source).toMatch(/y\s*:/);
  });
});

// ─── FR1: toBarData behavior ──────────────────────────────────────────────────

describe('toBarData — color assignment', () => {
  const TODAY_COLOR = '#F59E0B';
  const values = [7.5, 8.0, 6.5, 4.0, 0, 0, 0];
  const todayIndex = 3;

  it('SC1.5 — element at todayIndex gets todayColor', () => {
    const result = toBarData(values, todayIndex, TODAY_COLOR);
    expect(result[todayIndex].color).toBe(TODAY_COLOR);
  });

  it('SC1.6 — elements before todayIndex get colors.success (#10B981)', () => {
    const result = toBarData(values, todayIndex, TODAY_COLOR);
    for (let i = 0; i < todayIndex; i++) {
      expect(result[i].color).toBe('#10B981');
    }
  });

  it('SC1.7 — elements after todayIndex get colors.textMuted (#757575)', () => {
    const result = toBarData(values, todayIndex, TODAY_COLOR);
    for (let i = todayIndex + 1; i < values.length; i++) {
      expect(result[i].color).toBe('#757575');
    }
  });

  it('SC1.8 — toBarData([1,2,3,4,5,6,7], 3, #10B981) returns 7 elements with correct colors', () => {
    const input = [1, 2, 3, 4, 5, 6, 7];
    const result = toBarData(input, 3, '#10B981');
    expect(result).toHaveLength(7);
    // Past (0, 1, 2) → success
    expect(result[0].color).toBe('#10B981');
    expect(result[1].color).toBe('#10B981');
    expect(result[2].color).toBe('#10B981');
    // Today (3) → todayColor (also #10B981 here, but it is the todayColor arg)
    expect(result[3].color).toBe('#10B981');
    // Future (4, 5, 6) → textMuted
    expect(result[4].color).toBe('#757575');
    expect(result[5].color).toBe('#757575');
    expect(result[6].color).toBe('#757575');
  });

  it('SC1.8b — toBarData with distinct todayColor proves today slot uses todayColor not success', () => {
    const input = [1, 2, 3, 4, 5, 6, 7];
    const result = toBarData(input, 3, '#F43F5E');
    expect(result[3].color).toBe('#F43F5E'); // today = todayColor (not success)
    expect(result[0].color).toBe('#10B981'); // past = success
    expect(result[6].color).toBe('#757575'); // future = textMuted
  });
});

describe('toBarData — datum shape', () => {
  it('SC1.3 — each BarDatum has day (number), value (number), color (string)', () => {
    const result = toBarData([5, 8, 3], 1, '#00C2FF');
    result.forEach((datum, i) => {
      expect(typeof datum.day).toBe('number');
      expect(typeof datum.value).toBe('number');
      expect(typeof datum.color).toBe('string');
    });
  });

  it('day field equals the array index', () => {
    const result = toBarData([5, 8, 3], 1, '#00C2FF');
    expect(result[0].day).toBe(0);
    expect(result[1].day).toBe(1);
    expect(result[2].day).toBe(2);
  });

  it('value field equals the input value at that index', () => {
    const result = toBarData([5, 8, 3], 1, '#00C2FF');
    expect(result[0].value).toBe(5);
    expect(result[1].value).toBe(8);
    expect(result[2].value).toBe(3);
  });
});

describe('toBarData — edge cases', () => {
  it('SC1.11 — toBarData([], 0, "#fff") returns []', () => {
    expect(toBarData([], 0, '#fff')).toEqual([]);
  });

  it('todayIndex=0 — first element is todayColor, rest are textMuted', () => {
    const result = toBarData([5, 8, 3], 0, '#F59E0B');
    expect(result[0].color).toBe('#F59E0B');
    expect(result[1].color).toBe('#757575');
    expect(result[2].color).toBe('#757575');
  });

  it('todayIndex=last — all but last are success, last is todayColor', () => {
    const result = toBarData([5, 8, 3], 2, '#F43F5E');
    expect(result[0].color).toBe('#10B981');
    expect(result[1].color).toBe('#10B981');
    expect(result[2].color).toBe('#F43F5E');
  });

  it('single-element array — todayIndex=0 — returns 1 element with todayColor', () => {
    const result = toBarData([7], 0, '#A78BFA');
    expect(result).toHaveLength(1);
    expect(result[0].color).toBe('#A78BFA');
  });
});

// ─── FR1: toLineData behavior ─────────────────────────────────────────────────

describe('toLineData — mapping', () => {
  it('SC1.9 — toLineData([1,2,3]) returns [{x:0,y:1},{x:1,y:2},{x:2,y:3}]', () => {
    expect(toLineData([1, 2, 3])).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
  });

  it('SC1.10 — toLineData([]) returns []', () => {
    expect(toLineData([])).toEqual([]);
  });

  it('SC1.4 — each LineDatum has x (number) and y (number)', () => {
    const result = toLineData([10, 20]);
    result.forEach(datum => {
      expect(typeof datum.x).toBe('number');
      expect(typeof datum.y).toBe('number');
    });
  });

  it('x equals the array index', () => {
    const result = toLineData([100, 200, 300]);
    expect(result[0].x).toBe(0);
    expect(result[1].x).toBe(1);
    expect(result[2].x).toBe(2);
  });

  it('y equals the value at that index', () => {
    const result = toLineData([100, 200, 300]);
    expect(result[0].y).toBe(100);
    expect(result[1].y).toBe(200);
    expect(result[2].y).toBe(300);
  });

  it('single value — returns [{x:0, y:v}]', () => {
    expect(toLineData([42])).toEqual([{ x: 0, y: 42 }]);
  });

  it('floating-point values preserved', () => {
    const result = toLineData([1.5, 2.75]);
    expect(result[0].y).toBe(1.5);
    expect(result[1].y).toBe(2.75);
  });
});
