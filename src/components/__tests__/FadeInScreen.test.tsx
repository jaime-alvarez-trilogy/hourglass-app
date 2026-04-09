// Tests: FadeInScreen — FR2 (03-touch-and-navigation)
//
// Strategy:
//   - Runtime render: children render, no layout shift, API unchanged
//   - Source-file static analysis: Reanimated migration, translateY, springSnappy,
//     useReducedMotion, isFocused wiring
//
// NOTE on useIsFocused mock:
// The component uses @react-navigation/native useIsFocused.
// jest-expo/node preset auto-mocks this. We verify the source
// references it correctly; runtime tests use the mocked version.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const COMPONENT_FILE = path.resolve(__dirname, '../FadeInScreen.tsx');

// Mock useIsFocused — FadeInScreen requires NavigationContainer which is not
// available in unit test context. Mock returns true (focused) by default.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));

// ─── Source file static checks ────────────────────────────────────────────────

describe('FadeInScreen — FR2: source file checks', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC2.1 — uses react-native-reanimated (not RN core Animated)', () => {
    expect(source).toContain('react-native-reanimated');
    // Must NOT import Animated from react-native after migration
    // (some files use both — check the migration removed core Animated timing)
    expect(source).not.toMatch(/import\s+\{[^}]*Animated[^}]*\}\s+from\s+'react-native'/);
  });

  it('SC2.1 — uses useSharedValue for opacity', () => {
    expect(source).toContain('useSharedValue');
  });

  it('SC2.1 — uses useAnimatedStyle', () => {
    expect(source).toContain('useAnimatedStyle');
  });

  it('SC2.2 — initialises translateY shared value at 8', () => {
    // useSharedValue(8) for the translateY initial offset
    expect(source).toContain('useSharedValue(8)');
  });

  it('SC2.1 — uses withTiming for opacity animation', () => {
    expect(source).toContain('withTiming');
  });

  it('SC2.2 — uses withSpring for translateY animation', () => {
    expect(source).toContain('withSpring');
  });

  it('SC2.2 — uses springSnappy preset', () => {
    expect(source).toContain('springSnappy');
  });

  it('SC2.1 — uses timingSmooth preset (for opacity)', () => {
    expect(source).toContain('timingSmooth');
  });

  it('SC2.2 — translateY animates to 0 on focus', () => {
    // withSpring(0, springSnappy) — spring target is 0
    expect(source).toMatch(/withSpring\s*\(\s*0/);
  });

  it('SC2.3 — resets translateY to 8 on blur (direct assignment, no animation)', () => {
    // translateY.value = 8 (no withSpring/withTiming wrapper on blur)
    expect(source).toMatch(/translateY[\s\S]{0,10}\.value\s*=\s*8/);
    // Must NOT wrap the blur reset in withSpring/withTiming
    // (i.e. the assignment to 8 should NOT be: translateY.value = withSpring(8))
    expect(source).not.toMatch(/withSpring\s*\(\s*8/);
  });

  it('SC2.3 — resets opacity to 0 on blur (direct assignment, no animation)', () => {
    // opacity.value = 0 on blur — must be direct, not animated
    expect(source).toMatch(/opacity[\s\S]{0,10}\.value\s*=\s*0/);
    expect(source).not.toMatch(/withTiming\s*\(\s*0/);
  });

  it('SC2.4 — uses useReducedMotion for accessibility', () => {
    expect(source).toContain('useReducedMotion');
  });

  it('SC2.4 — reduced motion path sets opacity=1 AND translateY=0 directly (no animation)', () => {
    // Both values set directly in the reducedMotion branch — no withTiming/withSpring wrappers
    expect(source).toContain('useReducedMotion');
    // opacity.value = 1 (direct)
    expect(source).toMatch(/opacity[\s\S]{0,10}\.value\s*=\s*1/);
    // translateY.value = 0 (direct)
    expect(source).toMatch(/translateY[\s\S]{0,10}\.value\s*=\s*0/);
    // The reducedMotion check (if reducedMotion) must appear before the withTiming calls
    // — use positions of the conditional guard vs the withTiming animation call
    const reducedMotionGuardIdx = source.indexOf('if (reducedMotion)');
    const withTimingCallIdx = source.indexOf('withTiming(');
    expect(reducedMotionGuardIdx).not.toBe(-1); // guard must exist
    expect(withTimingCallIdx).not.toBe(-1);     // withTiming must exist
    expect(reducedMotionGuardIdx).toBeLessThan(withTimingCallIdx);
  });

  it('SC2.6 — wraps children in Animated.View with flex:1', () => {
    expect(source).toContain('Animated.View');
    expect(source).toMatch(/flex[\s:'"]*1/);
  });

  it('SC2.6 — external API is default export FadeInScreen(children)', () => {
    expect(source).toMatch(/export default function FadeInScreen|export default FadeInScreen/);
    expect(source).toContain('children');
  });
});

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('FadeInScreen — FR2: runtime render', () => {
  let FadeInScreen: any;

  beforeAll(() => {
    FadeInScreen = require('../FadeInScreen').default;
  });

  it('SC2.6 — renders children without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(FadeInScreen, null, 'Screen content'));
      });
    }).not.toThrow();
  });

  it('SC2.6 — children are present in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(FadeInScreen, null, 'Tab content here'));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Tab content here');
  });

  it('SC2.6 — renders single root element (not null, not array)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(FadeInScreen, null, 'child'));
    });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    expect(Array.isArray(json)).toBe(false);
  });

  it('SC2.6 — renders with React.Fragment child (no crash)', () => {
    expect(() => {
      act(() => {
        create(
          React.createElement(
            FadeInScreen,
            null,
            React.createElement(React.Fragment, null,
              React.createElement('View' as any, null, 'child 1'),
              React.createElement('View' as any, null, 'child 2'),
            ),
          ),
        );
      });
    }).not.toThrow();
  });

  it('SC2.6 — API unchanged: accepts only children prop', () => {
    // FadeInScreen({ children }) — no other required props
    expect(() => {
      act(() => {
        create(React.createElement(FadeInScreen, null, 'only children'));
      });
    }).not.toThrow();
  });
});
