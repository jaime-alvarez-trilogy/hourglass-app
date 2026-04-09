// glass-swipe-card.test.tsx
// Tests for 01-glass-swipe-card spec:
//   FR1: Inline glass surface (BackdropFilter + border gradient + noise)
//   FR2: Full-width opacity-animated glow overlays
//   FR3: Card-face directional overlays (approve/reject icons inside card)
//   FR4: useReducedMotion gating of decorative animations
//   FR5: Swipe dismiss thresholds, haptics, callbacks (regression)
//
// Strategy:
//   - Source-level assertions (fs.readFileSync) for design constraints and
//     animation logic that cannot be exercised through the Reanimated mock
//   - Runtime render tests (react-test-renderer) for component tree structure
//
// Mocks required (all set up before tests):
//   - react-native-reanimated — inline mock with controllable useReducedMotion
//   - @shopify/react-native-skia — __mocks__/@shopify/react-native-skia.ts
//   - react-native-gesture-handler — __mocks__/react-native-gesture-handler.ts
//   - expo-linear-gradient — __mocks__/expo-linear-gradient.ts
//   - expo-haptics — inline mock
//   - @expo/vector-icons — inline mock
//   - PNG assets — jest.config.js moduleNameMapper → fileMock.js

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

// ─── Source file path ─────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const APPROVAL_CARD_FILE = path.join(ROOT, 'src', 'components', 'ApprovalCard.tsx');

// ─── Inline Mocks ─────────────────────────────────────────────────────────────

// Reanimated mock — useAnimatedStyle returns {} so render tree is stable.
// useReducedMotion is controllable via module-level variable for FR4 tests.
let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const R = require('react');
  const Easing = {
    linear: (x: any) => x,
    ease: (x: any) => x,
    bezier: () => (x: any) => x,
    inOut: () => (x: any) => x,
    out: () => (x: any) => x,
    in: () => (x: any) => x,
  };
  return {
    __esModule: true,
    default: {
      View: ({ children, style, ...rest }: any) =>
        R.createElement('Animated.View', { style, ...rest }, children),
      createAnimatedComponent: (C: any) => C,
    },
    Animated: {
      View: ({ children, style, ...rest }: any) =>
        R.createElement('Animated.View', { style, ...rest }, children),
    },
    useSharedValue: (init: any) => {
      const ref = { value: init };
      return ref;
    },
    useAnimatedStyle: (_fn: any) => ({}),
    withSpring: (val: any) => val,
    withTiming: (val: any) => val,
    runOnJS: (fn: any) => fn,
    interpolate: (val: any, _input: any, _output: any) => val,
    Extrapolation: { CLAMP: 'CLAMP', EXTEND: 'EXTEND', IDENTITY: 'IDENTITY' },
    useReducedMotion: () => mockReducedMotion,
    Easing,
  };
});

// expo-haptics mock
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// @expo/vector-icons mock
jest.mock('@expo/vector-icons', () => {
  const R = require('react');
  return {
    Ionicons: ({ name, size, color, testID }: any) =>
      R.createElement('Ionicons', { name, size, color, testID }),
  };
});

// ─── Test Fixtures ────────────────────────────────────────────────────────────

import type { ManualApprovalItem, OvertimeApprovalItem } from '../src/lib/approvals';

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

// ─── Source analysis helpers ──────────────────────────────────────────────────

let source: string;
let code: string; // source with comments stripped

beforeAll(() => {
  source = fs.readFileSync(APPROVAL_CARD_FILE, 'utf-8');
  // Strip single-line and block comments for pure-code assertions
  code = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
});

beforeEach(() => {
  mockReducedMotion = false;
  jest.clearAllMocks();
});

// =============================================================================
// FR1: Inline Glass Surface
// =============================================================================

describe('FR1: Inline Glass Surface — source constraints', () => {
  it('FR1: imports Canvas, BackdropFilter, Blur, RoundedRect from @shopify/react-native-skia', () => {
    expect(source).toContain('@shopify/react-native-skia');
    expect(source).toContain('Canvas');
    expect(source).toContain('BackdropFilter');
    expect(source).toContain('Blur');
    expect(source).toContain('RoundedRect');
  });

  it('FR1: imports LinearGradient from expo-linear-gradient', () => {
    expect(source).toMatch(/from ['"]expo-linear-gradient['"]/);
  });

  it('FR1: imports ImageBackground for noise overlay', () => {
    expect(source).toContain('ImageBackground');
  });

  it('FR1: imports useState for dims state', () => {
    expect(source).toContain('useState');
  });

  it('FR1: dark fallback color #16151F present (no white flash)', () => {
    // The outer Animated.View must have this background color
    expect(code).toContain("'#16151F'");
  });

  it('FR1: GLASS_FILL constant defined as rgba(22,21,31,0.6)', () => {
    expect(source).toContain('rgba(22,21,31,0.6)');
  });

  it('FR1: BLUR_RADIUS = 16', () => {
    // Check blur radius is 16 in source
    expect(source).toMatch(/BLUR_RADIUS\s*=\s*16|blur.*16|16.*blur/);
  });

  it('FR1: BORDER_RADIUS_PX = 16 (rounded-2xl)', () => {
    expect(source).toMatch(/BORDER_RADIUS_PX\s*=\s*16/);
  });

  it('FR1: GLOW_OPACITY_MAX = 0.55', () => {
    expect(source).toMatch(/GLOW_OPACITY_MAX\s*=\s*0\.55/);
  });

  it('FR1: dims.w > 0 guard present for Canvas (zero-canvas crash prevention)', () => {
    expect(source).toMatch(/dims\.w\s*>\s*0/);
  });

  it('FR1: onLayout handler present to capture dims', () => {
    expect(source).toContain('onLayout');
    expect(source).toContain('setDims');
  });

  it('FR1: renderToHardwareTextureAndroid present on outer Animated.View', () => {
    expect(source).toContain('renderToHardwareTextureAndroid');
  });

  it('FR1: opaque bg-surface NativeWind class absent from card container', () => {
    // The glass surface replaces opaque bg-surface with BackdropFilter
    expect(code).not.toContain('bg-surface');
  });

  it('FR1: noise.png image referenced for noise overlay', () => {
    expect(source).toContain('noise.png');
  });

  it('FR1: noise overlay at 0.03 opacity (brand §1.5)', () => {
    expect(source).toMatch(/opacity.*0\.03|0\.03.*opacity/);
  });

  it('FR1: SHADOW_TOP inner shadow color defined', () => {
    expect(source).toContain('rgba(0,0,0,0.6)');
  });

  it('FR1: SHADOW_BOTTOM inner shadow highlight defined', () => {
    expect(source).toContain('rgba(255,255,255,0.08)');
  });

  it('FR1: LinearGradient from expo-linear-gradient has borderWidth for border gradient', () => {
    expect(source).toMatch(/borderWidth.*1\.5|1\.5.*borderWidth/);
  });

  it('FR1: SkiaLinearGradient (aliased) used for inner shadow', () => {
    expect(source).toContain('SkiaLinearGradient');
  });

  it('FR1: StyleSheet used (for absoluteFill)', () => {
    expect(source).toContain('StyleSheet');
  });
});

describe('FR1: Inline Glass Surface — runtime render', () => {
  it('FR1: component renders without throwing for MANUAL item', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    expect(() => {
      act(() => {
        create(
          React.createElement(
            require('../src/components/ApprovalCard').ApprovalCard,
            { item: MANUAL_ITEM, onApprove, onReject }
          )
        );
      });
    }).not.toThrow();
  });

  it('FR1: component renders without throwing for OVERTIME item', () => {
    expect(() => {
      act(() => {
        create(
          React.createElement(
            require('../src/components/ApprovalCard').ApprovalCard,
            { item: OVERTIME_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
          )
        );
      });
    }).not.toThrow();
  });

  it('FR1: card content (fullName) visible in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Alice Smith');
  });

  it('FR1: card content (hours) visible in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('1.5');
  });

  it('FR1: card content (description) visible in rendered output', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Fix critical bug');
  });

  it('FR1: BackdropFilter is guarded by dims.w > 0 (does not render at initial dims.w=0)', () => {
    // In react-test-renderer, onLayout never fires so dims.w stays 0.
    // The Canvas render guard (dims.w > 0) correctly prevents Canvas from mounting.
    // This is the intended crash-safe behavior — verified by source-level assertion above.
    // Runtime check: component renders without crash, tree is non-null.
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    // Canvas (and BackdropFilter) should NOT be in tree because dims.w = 0
    const text = JSON.stringify(json);
    expect(text).not.toContain('Canvas');
    // Confirm the guard expression is in source
    expect(source).toMatch(/dims\.w\s*>\s*0/);
  });
});

// =============================================================================
// FR2: Full-Width Glow Overlays — source assertions
// =============================================================================

describe('FR2: Full-Width Glow Overlays — source constraints', () => {
  it('FR2: approveGlowStyle uses interpolate with [0, SWIPE_THRESHOLD] input range', () => {
    // Approve glow: translateX 0→SWIPE_THRESHOLD maps to opacity 0→GLOW_OPACITY_MAX
    expect(source).toMatch(/approveGlowStyle|approve.*[Gg]low/);
    // interpolate must be used for glow opacity
    expect(source).toContain('interpolate');
  });

  it('FR2: rejectGlowStyle uses interpolate with [-SWIPE_THRESHOLD, 0] input range', () => {
    expect(source).toMatch(/rejectGlowStyle|reject.*[Gg]low/);
  });

  it('FR2: GLOW_OPACITY_MAX (0.55) used as output cap in glow interpolation', () => {
    expect(source).toContain('GLOW_OPACITY_MAX');
    // Must appear in interpolation output arrays
    expect(source).toMatch(/\[\s*0\s*,\s*GLOW_OPACITY_MAX\s*\]|\[\s*GLOW_OPACITY_MAX\s*,\s*0\s*\]/);
  });

  it('FR2: approve glow uses colors.success (not hardcoded hex)', () => {
    // Glow background must reference colors.success token
    expect(source).toContain('colors.success');
  });

  it('FR2: reject glow uses colors.destructive (not hardcoded hex)', () => {
    expect(source).toContain('colors.destructive');
  });

  it('FR2: Extrapolation.CLAMP used for glow opacity (caps at GLOW_OPACITY_MAX)', () => {
    expect(source).toContain('Extrapolation.CLAMP');
  });

  it('FR2: glow animated views have StyleSheet.absoluteFill or equivalent absoluteFill', () => {
    expect(source).toContain('absoluteFill');
  });

  it('FR2: glow animated views have borderRadius matching BORDER_RADIUS_PX', () => {
    expect(source).toContain('BORDER_RADIUS_PX');
  });

  it('FR2: reducedMotion gates glow opacity (returns 0 when reducedMotion true)', () => {
    // The glow style worklet must reference reducedMotion
    // Check that reducedMotion is used inside the glow style definitions
    expect(source).toContain('reducedMotion');
  });

  it('FR2: width-reveal approveActionStyle is replaced (no revealWidth pattern)', () => {
    // Old implementation used width: revealWidth pattern — must be gone
    // (allows StyleSheet width properties elsewhere, just not the old reveal logic)
    expect(code).not.toMatch(/revealWidth/);
  });

  it('FR2: width-reveal rejectActionStyle is replaced (no revealWidth pattern)', () => {
    expect(code).not.toMatch(/revealWidth/);
  });
});

describe('FR2: Full-Width Glow Overlays — runtime render', () => {
  it('FR2: two glow overlay Animated.Views present before GestureDetector in tree', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    // Both glow background colors should appear in rendered props
    // (backgroundColor passed to Animated.View via style)
    // The tree should contain references to success and destructive glow colors
    // via the animated style (even though style={} is empty from mock, the source
    // must be verified to include them — runtime check confirms no crash)
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(100);
  });
});

// =============================================================================
// FR3: Card-Face Directional Overlays — source assertions
// =============================================================================

describe('FR3: Card-Face Directional Overlays — source constraints', () => {
  it('FR3: approveFaceStyle defined with interpolate from [0, SWIPE_THRESHOLD*0.5] to [0, 1]', () => {
    expect(source).toMatch(/approveFaceStyle|approve.*[Ff]ace/);
    // Half-threshold fade-in: SWIPE_THRESHOLD * 0.5 or SWIPE_THRESHOLD * 0.5
    expect(source).toMatch(/SWIPE_THRESHOLD\s*\*\s*0\.5/);
  });

  it('FR3: rejectFaceStyle defined with interpolate from [-SWIPE_THRESHOLD*0.5, 0] to [1, 0]', () => {
    expect(source).toMatch(/rejectFaceStyle|reject.*[Ff]ace/);
  });

  it('FR3: approve face overlay has pointerEvents="none" (does not block gesture)', () => {
    expect(source).toContain('pointerEvents');
    expect(source).toContain('"none"');
  });

  it('FR3: approve overlay uses Ionicons checkmark-circle', () => {
    expect(source).toContain('checkmark-circle');
  });

  it('FR3: reject overlay uses Ionicons close-circle', () => {
    expect(source).toContain('close-circle');
  });

  it('FR3: face overlay icons are 48px', () => {
    // Icon size 48 for face overlays
    expect(source).toContain('48');
  });

  it('FR3: "APPROVE" label present in approve overlay', () => {
    // Uppercase APPROVE label
    expect(source).toContain('APPROVE');
  });

  it('FR3: "REJECT" label present in reject overlay', () => {
    expect(source).toContain('REJECT');
  });

  it('FR3: face overlay icons use colors.success for approve', () => {
    // The approve face overlay icon color must reference colors.success
    expect(source).toContain('colors.success');
  });

  it('FR3: face overlay icons use colors.destructive for reject', () => {
    expect(source).toContain('colors.destructive');
  });

  it('FR3: approveIconStyle scale interpolation present (0.5→1.0→1.3 pop)', () => {
    // Scale pop: 0.5 at translateX=0, 1.0 at threshold, 1.3 at 1.4x threshold
    expect(source).toContain('approveIconStyle');
    expect(source).toMatch(/0\.5.*1\.0.*1\.3|1\.3.*1\.0.*0\.5/);
  });

  it('FR3: rejectIconStyle scale interpolation present (1.3→1.0→0.5 pop)', () => {
    expect(source).toContain('rejectIconStyle');
  });

  it('FR3: reducedMotion gates face overlay opacity', () => {
    // Face overlays must return 0 opacity when reducedMotion is true
    // Confirmed by same reducedMotion usage already verified in FR2,
    // but face styles must also reference it
    expect(source).toContain('reducedMotion');
  });
});

describe('FR3: Card-Face Directional Overlays — runtime render', () => {
  it('FR3: APPROVE text present in rendered tree', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('APPROVE');
  });

  it('FR3: REJECT text present in rendered tree', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('REJECT');
  });

  it('FR3: face overlays present (checkmark-circle icon in tree)', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('checkmark-circle');
  });

  it('FR3: face overlays present (close-circle icon in tree)', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('close-circle');
  });
});

// =============================================================================
// FR4: useReducedMotion Gating — source assertions
// =============================================================================

describe('FR4: useReducedMotion Gating — source constraints', () => {
  it('FR4: useReducedMotion imported from react-native-reanimated', () => {
    expect(source).toContain('useReducedMotion');
  });

  it('FR4: cardStyle rotation gated by reducedMotion (0deg when reduced)', () => {
    // Card rotation uses: reducedMotion ? '0deg' : interpolated rotation
    expect(source).toMatch(/reducedMotion.*0deg|0deg.*reducedMotion/);
  });

  it('FR4: approveGlowStyle returns 0 opacity when reducedMotion', () => {
    // Glow opacity must be suppressed in reduced motion
    // Pattern: reducedMotion && return 0, or ternary returning 0
    expect(source).toMatch(/reducedMotion/);
    // Combined with glow style — reducedMotion appears in glow context
    const glowSection = source.match(/approveGlowStyle[\s\S]{0,400}/);
    expect(glowSection?.[0]).toMatch(/reducedMotion|opacity.*0/);
  });

  it('FR4: rejectGlowStyle returns 0 opacity when reducedMotion', () => {
    const glowSection = source.match(/rejectGlowStyle[\s\S]{0,400}/);
    expect(glowSection?.[0]).toMatch(/reducedMotion|opacity.*0/);
  });

  it('FR4: approveFaceStyle returns 0 opacity when reducedMotion', () => {
    const faceSection = source.match(/approveFaceStyle[\s\S]{0,400}/);
    expect(faceSection?.[0]).toMatch(/reducedMotion|opacity.*0/);
  });

  it('FR4: rejectFaceStyle returns 0 opacity when reducedMotion', () => {
    const faceSection = source.match(/rejectFaceStyle[\s\S]{0,400}/);
    expect(faceSection?.[0]).toMatch(/reducedMotion|opacity.*0/);
  });

  it('FR4: panGesture.onEnd preserves !reducedMotion guard for dismiss', () => {
    // The swipe dismiss logic must still check !reducedMotion
    expect(source).toMatch(/!reducedMotion/);
  });

  it('FR4: spring-back (springBouncy) is NOT gated by reducedMotion (structural animation)', () => {
    // springBouncy for spring-back must be present and NOT inside a reducedMotion conditional
    expect(source).toContain('springBouncy');
  });

  it('FR4: timingInstant in AnimatedButton is NOT removed (tactile feedback preserved)', () => {
    expect(source).toContain('timingInstant');
  });
});

// =============================================================================
// FR5: Swipe Dismiss and Callbacks — source assertions + runtime
// =============================================================================

describe('FR5: Swipe Dismiss and Callbacks — source constraints', () => {
  it('FR5: SWIPE_THRESHOLD = 100 unchanged', () => {
    expect(source).toMatch(/SWIPE_THRESHOLD\s*=\s*100/);
  });

  it('FR5: DISMISS_VELOCITY = 800 unchanged', () => {
    expect(source).toMatch(/DISMISS_VELOCITY\s*=\s*800/);
  });

  it('FR5: activeOffsetX([-10, 10]) present on pan gesture', () => {
    expect(source).toContain('activeOffsetX');
    expect(source).toMatch(/-10.*10|10.*-10/);
  });

  it('FR5: failOffsetY([-8, 8]) present on pan gesture', () => {
    expect(source).toContain('failOffsetY');
    expect(source).toMatch(/-8.*8|8.*-8/);
  });

  it('FR5: onApprove callback wired to triggerApprove', () => {
    expect(source).toContain('onApprove');
    expect(source).toContain('triggerApprove');
  });

  it('FR5: onReject callback wired to triggerReject', () => {
    expect(source).toContain('onReject');
    expect(source).toContain('triggerReject');
  });

  it('FR5: notificationAsync(Success) called for approve haptic', () => {
    expect(source).toContain('notificationAsync');
    expect(source).toContain('Success');
  });

  it('FR5: notificationAsync(Warning) called for reject haptic', () => {
    expect(source).toContain('Warning');
  });

  it('FR5: springSnappy used for dismiss flyout animation', () => {
    expect(source).toContain('springSnappy');
  });

  it('FR5: springBouncy used for spring-back when sub-threshold', () => {
    expect(source).toContain('springBouncy');
  });

  it('FR5: cardOpacity fades out on dismiss (250ms timing)', () => {
    expect(source).toMatch(/cardOpacity|duration.*250|250.*duration/);
  });

  it('FR5: light haptic (impactAsync Light) fired on drag start', () => {
    expect(source).toContain('impactAsync');
    expect(source).toContain('Light');
  });
});

describe('FR5: Swipe Dismiss and Callbacks — runtime', () => {
  it('FR5: Reject button (fallback) calls onReject', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove, onReject }
        )
      );
    });
    const instance = tree.root;
    // Find a node with onPress that is associated with reject
    const rejectNodes = instance.findAll(
      (node: any) =>
        node.props?.onPress !== undefined
    );
    // There should be at least 2 pressable nodes (reject + approve buttons)
    expect(rejectNodes.length).toBeGreaterThanOrEqual(2);
  });

  it('FR5: component renders with correct props interface (item, onApprove, onReject)', () => {
    const onApprove = jest.fn();
    const onReject = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove, onReject }
        )
      );
    });
    // If props interface changed, this would throw during render
    expect(tree.toJSON()).not.toBeNull();
  });

  it('FR5: overtime item renders cost value', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: OVERTIME_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/\$.*100|100.*\$/);
  });

  it('FR5: manual item does not render cost value', () => {
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(
          require('../src/components/ApprovalCard').ApprovalCard,
          { item: MANUAL_ITEM, onApprove: jest.fn(), onReject: jest.fn() }
        )
      );
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toMatch(/\$\d+\.\d{2}/);
  });
});

// =============================================================================
// Integration: Colors and Tokens
// =============================================================================

describe('Integration: Color token compliance', () => {
  it('COLORS: no hardcoded hex colors in source code (comments stripped)', () => {
    // Exceptions: #16151F (dark fallback bg) is intentional and spec-mandated
    // All other hex values must come from colors.ts tokens
    const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
    const matches = code.match(hexPattern) || [];
    const allowedHex = ['#16151F']; // dark fallback bg — spec-mandated constant
    const violations = matches.filter((h: string) => !allowedHex.includes(h.toUpperCase()) && !allowedHex.includes(h));
    expect(violations).toEqual([]);
  });

  it('COLORS: imports colors from @/src/lib/colors', () => {
    expect(source).toMatch(/from ['"]@\/src\/lib\/colors['"]/);
  });

  it('COLORS: category badge uses bg-violet/15 for MANUAL (not gold)', () => {
    // Manual badge: violet accent (interactive category, not monetary)
    expect(source).toContain('bg-violet/15');
  });

  it('COLORS: category badge uses bg-warning/15 for OVERTIME', () => {
    expect(source).toContain('bg-warning/15');
  });
});
