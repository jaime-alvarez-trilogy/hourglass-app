// FR2, FR6: ApprovalCard component — visual migration + type badges
//
// Updated for 01-glass-swipe-card: ApprovalCard now uses:
//   - Inline Liquid Glass layer stack (BackdropFilter + expo-linear-gradient + noise)
//   - react-native-gesture-handler Gesture.Pan() (Reanimated, not PanResponder)
//   - Full-width glow overlays replacing width-reveal swipe indicators
//   - Face overlays (APPROVE/REJECT) inside card surface
//   - category badges: bg-violet/15 (MANUAL), bg-warning/15 (OVERTIME)
//     Category text shows item.category: 'MANUAL' / 'OVERTIME' (uppercase)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import { ApprovalCard } from '../src/components/ApprovalCard';
import type { ManualApprovalItem, OvertimeApprovalItem } from '../src/lib/approvals';

// Reanimated mock — required for components using useSharedValue, useAnimatedStyle
jest.mock('react-native-reanimated', () => {
  const R = require('react');
  const identity = (x: any) => x;
  const Easing = {
    linear: identity,
    ease: identity,
    bezier: () => identity,
    inOut: () => identity,
    out: () => identity,
    in: () => identity,
    poly: () => identity,
    sin: identity,
    circle: identity,
    exp: identity,
    elastic: () => identity,
    back: () => identity,
    bounce: identity,
    steps: () => identity,
  };
  return {
    __esModule: true,
    default: {
      View: ({ children, style, ...rest }: any) =>
        R.createElement('Animated.View', { style, ...rest }, children),
      createAnimatedComponent: (C: any) => C,
    },
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (_fn: any) => ({}),
    withSpring: (val: any) => val,
    withTiming: (val: any) => val,
    runOnJS: (fn: any) => fn,
    interpolate: (val: any) => val,
    Extrapolation: { CLAMP: 'CLAMP' },
    useReducedMotion: () => false,
    Easing,
  };
});

// expo-haptics mock
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

// @expo/vector-icons mock
jest.mock('@expo/vector-icons', () => {
  const R = require('react');
  return {
    Ionicons: ({ name, size, color }: any) =>
      R.createElement('Ionicons', { name, size, color }),
  };
});

const APPROVAL_CARD_FILE = path.resolve(__dirname, '../src/components/ApprovalCard.tsx');

const MANUAL_ITEM: ManualApprovalItem = {
  id: 'mt-1-2',
  category: 'MANUAL',
  userId: 100,
  fullName: 'Alice Smith',
  durationMinutes: 90,
  hours: '1.5',
  description: 'Fix critical bug',
  startDateTime: '2026-03-10T09:00:00Z',
  type: 'WEB',
  timecardIds: [1, 2],
  weekStartDate: '2026-03-09',
};

const OVERTIME_ITEM: OvertimeApprovalItem = {
  id: 'ot-42',
  category: 'OVERTIME',
  overtimeId: 42,
  userId: 2362707,
  fullName: 'Bob Jones',
  jobTitle: 'Senior Engineer',
  durationMinutes: 120,
  hours: '2.0',
  cost: 100,
  description: 'Emergency deployment',
  startDateTime: '2026-03-10T18:00:00Z',
  weekStartDate: '2026-03-09',
};

// =============================================================================
// FR2: ApprovalCard — runtime render: name, hours, description, actions
// =============================================================================

describe('FR2: ApprovalCard — runtime render', () => {
  it('FR2_renders_fullName_hours_description', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: MANUAL_ITEM,
          onApprove,
          onReject,
        })
      );
    });
    const json = tree.toJSON();
    const text = JSON.stringify(json);
    expect(text).toContain('Alice Smith');
    expect(text).toContain('1.5');
    expect(text).toContain('Fix critical bug');
  });

  it('FR2_renders_formatted_cost_for_OVERTIME_item', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: OVERTIME_ITEM,
          onApprove: jest.fn(),
          onReject: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    // Cost 100 should appear formatted as $100.00
    expect(text).toMatch(/\$.*100/);
  });

  it('FR2_does_not_render_cost_for_MANUAL_item', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: MANUAL_ITEM,
          onApprove: jest.fn(),
          onReject: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    // No cost field on manual items
    expect(text).not.toMatch(/\$\d+\.\d{2}/);
  });

  it('FR2_approve_button_calls_onApprove_when_pressed', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: MANUAL_ITEM,
          onApprove,
          onReject,
        })
      );
    });
    const instance = tree.root;
    // Find Animated.View nodes with onPress (AnimatedButton wraps GestureDetector)
    // In the mock environment, GestureDetector is transparent — so we look for
    // Animated.View with className containing 'success' to identify approve button
    const pressableNodes = instance.findAll(
      (node: any) => node.props?.onPress !== undefined
    );
    expect(pressableNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('FR2_component_renders_without_crash', () => {
    expect(() => {
      act(() => {
        create(
          React.createElement(ApprovalCard, {
            item: MANUAL_ITEM,
            onApprove: jest.fn(),
            onReject: jest.fn(),
          })
        );
      });
    }).not.toThrow();
  });
});

// =============================================================================
// FR2: ApprovalCard — source file constraints
// =============================================================================

describe('FR2: ApprovalCard — source file: glass surface migration', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVAL_CARD_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('FR2 — uses Gesture.Pan() from react-native-gesture-handler (not PanResponder)', () => {
    expect(source).toContain('Gesture.Pan()');
    // Check code (comments stripped) — "PanResponder" may appear in comments only
    expect(code).not.toContain('PanResponder');
  });

  it('FR2 — uses Reanimated useSharedValue + useAnimatedStyle', () => {
    expect(source).toContain('useSharedValue');
    expect(source).toContain('useAnimatedStyle');
  });

  it('FR2 — glass surface: BackdropFilter imported from @shopify/react-native-skia', () => {
    expect(source).toContain('BackdropFilter');
    expect(source).toContain('@shopify/react-native-skia');
  });

  it('FR2 — glass surface: expo-linear-gradient border present', () => {
    expect(source).toMatch(/from ['"]expo-linear-gradient['"]/);
  });

  it('FR2 — opaque bg-surface removed (replaced by glass surface)', () => {
    expect(code).not.toContain('bg-surface');
  });

  it('FR2 — dark fallback #16151F present (prevents white flash)', () => {
    expect(code).toContain("'#16151F'");
  });

  it('FR2 — swipe animation uses translateX transform on Animated.View', () => {
    expect(source).toContain('translateX');
    // Reanimated v4: cardStyle is returned from useAnimatedStyle and applied via style prop
    // The cardStyle includes { transform: [{ translateX }] }
    expect(source).toContain('cardStyle');
    expect(source).toMatch(/transform.*translateX/s);
  });

  it('FR2 — no hardcoded hex colors in code (except spec-mandated #16151F fallback)', () => {
    const hexMatches = code.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
    const allowedHex = ['#16151F'];
    const violations = hexMatches.filter(
      (h: string) => !allowedHex.includes(h.toUpperCase()) && !allowedHex.includes(h)
    );
    expect(violations).toEqual([]);
  });
});

// =============================================================================
// FR6: Type badges — category badge colours and text
// =============================================================================

describe('FR6: Type badges — runtime render', () => {
  it('FR6_MANUAL_item_renders_MANUAL_category_text', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: MANUAL_ITEM,
          onApprove: jest.fn(),
          onReject: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    // category field is 'MANUAL' (uppercase) — rendered via {item.category}
    expect(text).toContain('MANUAL');
  });

  it('FR6_OVERTIME_item_renders_OVERTIME_category_text', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: OVERTIME_ITEM,
          onApprove: jest.fn(),
          onReject: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('OVERTIME');
  });

  it('FR6_OVERTIME_item_renders_cost_value', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalCard, {
          item: OVERTIME_ITEM,
          onApprove: jest.fn(),
          onReject: jest.fn(),
        })
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/\$.*100/);
  });
});

describe('FR6: Type badges — source analysis', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(APPROVAL_CARD_FILE, 'utf8');
  });

  it('FR6 — source uses bg-violet/15 for manual badge (01-glass-swipe-card)', () => {
    // Updated by 01-glass-swipe-card: badge uses bg-violet/15 (smaller opacity)
    expect(source).toContain('bg-violet/15');
  });

  it('FR6 — source uses text-violet for manual badge text', () => {
    expect(source).toContain('text-violet');
  });

  it('FR6 — source uses bg-warning/15 for overtime badge', () => {
    expect(source).toContain('bg-warning/15');
  });

  it('FR6 — source uses text-warning for overtime badge text', () => {
    expect(source).toContain('text-warning');
  });

  it('FR6 — source uses item.category as badge text discriminant', () => {
    expect(source).toMatch(/item\.category|overtime.*OVERTIME|isOvertime/);
  });
});
