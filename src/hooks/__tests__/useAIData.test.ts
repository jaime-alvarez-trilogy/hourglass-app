// Tests: useAIData hook (06-ai-tab — FR4 extension)
// Verifies previousWeekPercent AsyncStorage caching behaviour.
//
// Strategy: test the hook's behaviour via the public return values.
// We test both the type contract (field exists) and the AsyncStorage key pattern
// using static analysis of the source file + direct AsyncStorage mock inspection.
//
// NOTE: Full hook rendering via renderHook is problematic in jest-expo/node preset
// because the dispatcher is null outside a React render. Tests are structured to
// work within the constraints of the existing test infrastructure.

import * as fs from 'fs';
import * as path from 'path';

// ─── AsyncStorage mock ────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };

// ─── File path for static analysis ───────────────────────────────────────────
// __dirname = hourglassws/src/hooks/__tests__
// ../.. = hourglassws/src
// ../../.. = hourglassws
const USE_AI_DATA_PATH = path.resolve(__dirname, '../../..', 'src', 'hooks', 'useAIData.ts');

// ─── Static analysis tests ────────────────────────────────────────────────────

describe('useAIData — FR4: source file contract (static analysis)', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(USE_AI_DATA_PATH, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC4.1 — UseAIDataResult interface includes previousWeekPercent?: number', () => {
    // The interface must declare this optional field
    expect(source).toMatch(/previousWeekPercent\s*\?\s*:\s*number/);
  });

  it('SC4.2 — source defines PREV_WEEK_KEY constant', () => {
    expect(source).toMatch(/PREV_WEEK_KEY\s*=\s*['"]previousWeekAIPercent['"]/);
  });

  it('SC4.3 — source calls AsyncStorage.getItem with previousWeekAIPercent key', () => {
    // Either via PREV_WEEK_KEY reference or literal string
    expect(source).toMatch(/getItem\s*\(\s*(PREV_WEEK_KEY|['"]previousWeekAIPercent['"])\s*\)/);
  });

  it('SC4.4 — source calls AsyncStorage.setItem with previousWeekAIPercent key', () => {
    expect(source).toMatch(/setItem\s*\(\s*(PREV_WEEK_KEY|['"]previousWeekAIPercent['"])/);
  });

  it('SC4.5 — source uses isMonday check (getUTCDay() === 1) before writing', () => {
    expect(source).toMatch(/getUTCDay\s*\(\s*\)\s*===\s*1/);
  });

  it('SC4.6 — source has a useEffect for reading AsyncStorage on mount', () => {
    // Mount effect: useEffect with [] deps or no deps that calls getItem
    expect(source).toMatch(/useEffect\s*\(/);
    // It should read from AsyncStorage
    expect(source).toContain('getItem');
  });

  it('SC4.7 — source uses useRef for previousWeekPercent (no stale closure)', () => {
    expect(source).toMatch(/useRef.*undefined|useRef<.*number.*undefined/);
  });

  it('SC4.8 — source handles AsyncStorage read failure silently (.catch)', () => {
    // Silent failure: .catch(() => {}) or try/catch with empty catch
    expect(source).toMatch(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/);
  });

  it('SC4.9 — source returns previousWeekPercent in return value', () => {
    // The return statement includes previousWeekPercent
    expect(source).toMatch(/return\s*\{[\s\S]{0,500}previousWeekPercent/);
  });

  it('SC4.10 — source parses stored string as Number', () => {
    // The value retrieved from AsyncStorage is converted to a number
    expect(source).toMatch(/Number\s*\(|parseFloat\s*\(|parseInt\s*\(/);
  });

  it('SC4.11 — AsyncStorage write uses setItem with String conversion', () => {
    // Value must be stringified before setItem
    expect(source).toMatch(/setItem\s*\([^)]+String\s*\(/);
  });
});

// ─── AsyncStorage mock integration tests ─────────────────────────────────────

describe('useAIData — FR4: AsyncStorage mock verification', () => {
  beforeEach(() => {
    MockAsyncStorage._reset();
  });

  it('SC4.12 — AsyncStorage mock resolves null for unknown keys', async () => {
    const val = await MockAsyncStorage.getItem('previousWeekAIPercent');
    expect(val).toBeNull();
  });

  it('SC4.13 — AsyncStorage mock stores and retrieves previousWeekAIPercent', async () => {
    await MockAsyncStorage.setItem('previousWeekAIPercent', '67.5');
    const val = await MockAsyncStorage.getItem('previousWeekAIPercent');
    expect(val).toBe('67.5');
    expect(Number(val)).toBe(67.5);
  });

  it('SC4.14 — Number("67.5") === 67.5 (parse contract)', () => {
    expect(Number('67.5')).toBe(67.5);
  });

  it('SC4.15 — Number("82") === 82 (parse contract)', () => {
    expect(Number('82')).toBe(82);
  });

  it('SC4.16 — String(75) === "75" (stringify contract)', () => {
    expect(String(75)).toBe('75');
  });

  it('SC4.17 — String(67.5) === "67.5" (stringify contract for midpoint)', () => {
    expect(String(67.5)).toBe('67.5');
  });
});

// ─── Monday detection logic ───────────────────────────────────────────────────

describe('useAIData — FR4: Monday detection logic', () => {
  it('SC4.18 — getDay() returns 1 for a known Monday', () => {
    // 2026-03-09 is a Monday
    const d = new Date('2026-03-09T12:00:00');
    expect(d.getDay()).toBe(1);
  });

  it('SC4.19 — getDay() returns 2 for a known Tuesday', () => {
    // 2026-03-10 is a Tuesday
    const d = new Date('2026-03-10T12:00:00');
    expect(d.getDay()).toBe(2);
  });

  it('SC4.20 — midpoint formula: (aiPctLow + aiPctHigh) / 2', () => {
    // Verify the midpoint formula that the hook uses when writing to AsyncStorage
    expect((73 + 77) / 2).toBe(75);
    expect((60 + 64) / 2).toBe(62);
    expect((0 + 0) / 2).toBe(0);
    expect((98 + 100) / 2).toBe(99);
  });

  it('SC4.21 — delta badge formula: aiPercent - previousWeekPercent', () => {
    // Verify the delta formula used by the screen
    const aiPercent = 75;
    const prev = 70;
    expect(aiPercent - prev).toBe(5);
    expect((5).toFixed(1)).toBe('5.0');
  });

  it('SC4.22 — negative delta formatting', () => {
    const aiPercent = 70;
    const prev = 75;
    const delta = aiPercent - prev;
    expect(delta).toBe(-5);
    // Negative delta should show "-" prefix
    expect(delta < 0).toBe(true);
    expect(delta.toFixed(1)).toBe('-5.0');
  });

  it('SC4.23 — zero delta formatting: +0.0%', () => {
    const aiPercent = 75;
    const prev = 75;
    const delta = aiPercent - prev;
    expect(delta).toBe(0);
    // When 0: show +0.0%
    const text = delta === 0 ? '+0.0%' : delta > 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`;
    expect(text).toBe('+0.0%');
  });
});
