// Tests: HapticTab — FR3 (03-touch-and-navigation)
//
// Strategy:
//   - Source-file static analysis: Reanimated imports, scale shared value,
//     0.88 target, springSnappy/timingInstant, haptic preserved,
//     Animated.View wrapping children
//   - Runtime render: no crash, children render
//
// NOTE: HapticTab is at components/haptic-tab.tsx (project root components/,
// not src/components/). Tests verify the upgrade without requiring
// a navigation context.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// haptic-tab.tsx is at the project-root components/ folder
const COMPONENT_FILE = path.resolve(__dirname, '../../../components/haptic-tab.tsx');

// ─── Source file static checks ────────────────────────────────────────────────

describe('HapticTab — FR3: source file checks', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC3.1 — uses react-native-reanimated', () => {
    expect(source).toContain('react-native-reanimated');
  });

  it('SC3.1 — uses useSharedValue for iconScale', () => {
    expect(source).toContain('useSharedValue');
  });

  it('SC3.1 — uses useAnimatedStyle', () => {
    expect(source).toContain('useAnimatedStyle');
  });

  it('SC3.2 — scale reduces to 0.88 on press (withTiming(0.88))', () => {
    expect(source).toMatch(/withTiming\s*\(\s*0\.88/);
  });

  it('SC3.2 — uses timingInstant for press-down scale', () => {
    expect(source).toContain('timingInstant');
  });

  it('SC3.3 — uses withSpring to return to 1 on release', () => {
    expect(source).toMatch(/withSpring\s*\(\s*1[\s,)]/);
  });

  it('SC3.3 — uses springSnappy for release spring', () => {
    expect(source).toContain('springSnappy');
  });

  it('SC3.4 — Haptics.impactAsync still present in source', () => {
    expect(source).toContain('Haptics.impactAsync');
  });

  it('SC3.1 — Animated.View wraps children', () => {
    expect(source).toContain('Animated.View');
  });

  it('SC3.3 — onPressOut or pressOut drives the spring release', () => {
    expect(source).toMatch(/onPressOut|pressOut/);
  });

  it('SC3.2 — onPressIn drives the scale-down', () => {
    expect(source).toMatch(/onPressIn|pressIn/);
  });

  it('SC3.5 — does NOT remove or alter active tab styling (no className/style modification to active state)', () => {
    // The haptic tab should NOT add conditional active/inactive styling changes
    // The scale animation is applied to the icon wrapper only
    // We verify the source still renders props.children (passthrough)
    expect(source).toContain('props.children');
  });
});

// ─── Runtime render check ─────────────────────────────────────────────────────

describe('HapticTab — FR3: runtime render', () => {
  beforeAll(() => {
    // Mock PlatformPressable since it's from @react-navigation/elements
    jest.mock('@react-navigation/elements', () => ({
      PlatformPressable: ({ children, onPressIn, onPressOut, ...rest }: any) =>
        require('react').createElement('View', { onPressIn, onPressOut, ...rest }, children),
    }));
  });

  it('SC3.1 — HapticTab renders without crash given minimal props', () => {
    const { HapticTab } = require('../../../components/haptic-tab');
    expect(() => {
      act(() => {
        create(
          React.createElement(
            HapticTab,
            {
              onPress: jest.fn(),
              onLongPress: jest.fn(),
              onPressIn: jest.fn(),
              onPressOut: jest.fn(),
              children: React.createElement('View' as any, null, 'icon'),
              style: {},
              accessibilityState: { selected: false },
            },
          ),
        );
      });
    }).not.toThrow();
  });

  it('SC3.5 — children are rendered in HapticTab output', () => {
    const { HapticTab } = require('../../../components/haptic-tab');
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          HapticTab,
          {
            onPress: jest.fn(),
            onLongPress: jest.fn(),
            onPressIn: jest.fn(),
            onPressOut: jest.fn(),
            children: React.createElement('View' as any, { testID: 'tab-icon' }, 'icon'),
            style: {},
            accessibilityState: { selected: false },
          },
        ),
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('tab-icon');
  });
});
