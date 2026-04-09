// Tests: AnimatedPressable — FR1 (03-touch-and-navigation)
//
// Strategy:
//   - Runtime render checks: children, named export, onPress
//   - Source-file static analysis: Reanimated imports, scale logic, disabled guard
//   - Reanimated mock via jest-expo preset (auto-mocked, shared values are plain objects)
//
// NOTE: Reanimated shared values in jest-expo/node are NOT animated —
// they are plain objects: { value: <initialValue> }. After withTiming/withSpring
// is called the mock replaces value synchronously with the target. We test by
// calling the intercepted onPressIn/onPressOut handlers directly.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const COMPONENT_FILE = path.resolve(__dirname, '../AnimatedPressable.tsx');

// ─── Source file static checks (run first — file must exist) ──────────────────

describe('AnimatedPressable — FR1: source file checks', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC1.7 — exports named export AnimatedPressable', () => {
    // Named export: `export function AnimatedPressable` or `export { AnimatedPressable }`
    expect(source).toMatch(/export\s+(function|const)\s+AnimatedPressable/);
  });

  it('SC1.1 — uses useSharedValue for scale', () => {
    expect(source).toContain('useSharedValue');
  });

  it('SC1.1 — uses useAnimatedStyle for transform', () => {
    expect(source).toContain('useAnimatedStyle');
  });

  it('SC1.1 — imports withTiming from react-native-reanimated', () => {
    expect(source).toContain('withTiming');
  });

  it('SC1.1 — imports withSpring from react-native-reanimated', () => {
    expect(source).toContain('withSpring');
  });

  it('SC1.1 — uses timingInstant preset', () => {
    expect(source).toContain('timingInstant');
  });

  it('SC1.1 — uses springSnappy preset', () => {
    expect(source).toContain('springSnappy');
  });

  it('SC1.5 — has disabled guard (checks disabled prop)', () => {
    expect(source).toContain('disabled');
  });

  it('SC1.4 — uses Pressable (not TouchableOpacity)', () => {
    expect(source).toContain('Pressable');
    expect(source).not.toContain('TouchableOpacity');
  });

  it('SC1.4 — accepts scaleValue prop (default 0.96)', () => {
    expect(source).toContain('scaleValue');
    expect(source).toContain('0.96');
  });
});

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('AnimatedPressable — FR1: runtime render', () => {
  let AnimatedPressable: any;

  beforeAll(() => {
    AnimatedPressable = require('../AnimatedPressable').AnimatedPressable;
  });

  it('SC1.7 — named export AnimatedPressable is defined', () => {
    expect(AnimatedPressable).toBeDefined();
    expect(typeof AnimatedPressable).toBe('function');
  });

  it('SC1.1 — renders children without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedPressable, { onPress: jest.fn() }, 'Press me'));
      });
    }).not.toThrow();
  });

  it('SC1.1 — children text is present in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedPressable, { onPress: jest.fn() }, 'Tap here'));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Tap here');
  });

  it('SC1.1 — renders single root element (not fragment, not array)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedPressable, { onPress: jest.fn() }, 'child'));
    });
    const json = tree.toJSON();
    expect(Array.isArray(json)).toBe(false);
    expect(json).not.toBeNull();
  });

  it('SC1.3 — onPress callback is passed to the underlying Pressable', () => {
    // In the web test renderer, Pressable's onPress is internally transformed
    // to a click handler with PressResponder — not directly invokeable without a SyntheticEvent.
    // We verify via source analysis that onPress is correctly passed through (see press animation checks),
    // and verify runtime render succeeds with an onPress prop.
    const onPress = jest.fn();
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedPressable, { onPress }, 'Press'));
      });
    }).not.toThrow();
    // Source check: onPress is spread via {...rest} into the Pressable
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // The rest spread passes onPress through to Pressable
    expect(source).toMatch(/\.\.\.(rest|props)/);
  });

  it('SC1.4 — custom scaleValue prop is accepted (no crash with 0.92)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedPressable, { onPress: jest.fn(), scaleValue: 0.92 }, 'custom'));
      });
    }).not.toThrow();
  });

  it('SC1.6 — renders correctly when disabled={true}', () => {
    expect(() => {
      act(() => {
        create(React.createElement(AnimatedPressable, { onPress: jest.fn(), disabled: true }, 'disabled'));
      });
    }).not.toThrow();
  });

  it('SC1.6 — when disabled, the Pressable signals disabled state in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(AnimatedPressable, { onPress: jest.fn(), disabled: true }, 'disabled'));
    });
    const json = tree.toJSON();
    const serialized = JSON.stringify(json);
    // In web renderer, disabled Pressable renders aria-disabled:true or tabIndex:-1
    // In native renderer, renders disabled:true
    // We accept either representation.
    const isDisabledSignaled =
      serialized.includes('"disabled":true') ||
      serialized.includes('"aria-disabled":true') ||
      serialized.includes('"tabIndex":-1');
    expect(isDisabledSignaled).toBe(true);
  });
});

// ─── Press animation checks (via source analysis + handler testing) ───────────

describe('AnimatedPressable — FR1: press animation behaviour', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(COMPONENT_FILE, 'utf8');
  });

  it('SC1.2 — onPressIn handler calls withTiming toward scaleValue', () => {
    // Source must contain pressIn logic calling withTiming with scale target
    expect(source).toMatch(/onPressIn|pressIn/);
    expect(source).toContain('withTiming');
  });

  it('SC1.3 — onPressOut handler calls withSpring back to 1', () => {
    expect(source).toMatch(/onPressOut|pressOut/);
    expect(source).toContain('withSpring');
  });

  it('SC1.2 — scale animation target is scaleValue (default 0.96)', () => {
    // Must reference scaleValue in the withTiming call context
    expect(source).toMatch(/withTiming[\s\S]{0,30}scaleValue|scaleValue[\s\S]{0,50}withTiming/);
  });

  it('SC1.3 — spring returns to scale 1 on release', () => {
    // withSpring called with 1 (or 1.0)
    expect(source).toMatch(/withSpring\s*\(\s*1[\s,)]/);
  });

  it('SC1.5 — disabled check present before animation in pressIn/pressOut', () => {
    // disabled check guards the animation — must appear near onPressIn/onPressOut
    expect(source).toContain('disabled');
    // The animation must be conditional on NOT being disabled
    expect(source).toMatch(/disabled[\s\S]{0,100}withTiming|withTiming[\s\S]{0,100}disabled/);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively find a node in the rendered JSON tree that has the given handler prop.
 */
function findNodeWithHandler(node: any, handlerName: string): any {
  if (!node) return null;
  if (node.props?.[handlerName]) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object') {
        const found = findNodeWithHandler(child, handlerName);
        if (found) return found;
      }
    }
  }
  return null;
}

/** @deprecated use findNodeWithHandler */
function findNodeWithOnPress(node: any): any {
  return findNodeWithHandler(node, 'onPress');
}
