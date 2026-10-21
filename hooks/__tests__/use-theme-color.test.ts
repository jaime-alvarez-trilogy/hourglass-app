// Tests: hooks/use-theme-color.ts — 07-ci-typecheck-lint FR4
//
// RN 0.83's ColorSchemeName was 'light' | 'dark' | 'unspecified'; on RN 0.88
// (10-sdk-58-ios-27 FR4) useColorScheme() returns 'light' | 'dark' | null, with null
// when the native Appearance module is unavailable (Appearance.js getColorScheme).
// useThemeColor must normalise anything that isn't 'dark' to the light palette
// instead of indexing Colors[null] (undefined → TypeError).
//
// useColorScheme is mocked, so useThemeColor calls no real React hooks and is
// invoked directly (project convention: no renderHook under jest-expo/node).

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: jest.fn(),
}));

const mockUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

beforeEach(() => {
  mockUseColorScheme.mockReset();
});

describe('07-ci-typecheck-lint — FR4: useThemeColor scheme normalisation', () => {
  it('a null scheme falls back to the light palette', () => {
    mockUseColorScheme.mockReturnValue(null);
    expect(useThemeColor({}, 'text')).toBe(Colors.light.text);
  });

  it("'dark' scheme reads the dark palette", () => {
    mockUseColorScheme.mockReturnValue('dark');
    expect(useThemeColor({}, 'text')).toBe(Colors.dark.text);
  });

  it('a props.light override wins under a null scheme', () => {
    mockUseColorScheme.mockReturnValue(null);
    expect(useThemeColor({ light: '#123' }, 'text')).toBe('#123');
  });
});
