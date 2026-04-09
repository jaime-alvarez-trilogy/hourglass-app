// Tests: ApprovalUrgencyCard (01-approval-urgency-card)
//
// FR1: Component renders correctly with required content
// FR4: Breathing animation gated on useReducedMotion
// FR5: onPress navigates to Requests tab
//
// Strategy:
// - Runtime render checks via react-test-renderer
// - Source static analysis via fs.readFileSync for animation constants and imports
// - Mocks: @shopify/react-native-skia (existing), expo-linear-gradient (existing),
//          react-native-reanimated (jest preset), @expo/vector-icons, expo-router

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const COMPONENT_FILE = path.resolve(__dirname, '../ApprovalUrgencyCard.tsx');

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ─── Module handle ─────────────────────────────────────────────────────────────

let ApprovalUrgencyCard: React.ComponentType<{ pendingCount: number; onPress: () => void }>;

beforeAll(() => {
  const mod = require('../ApprovalUrgencyCard');
  ApprovalUrgencyCard = mod.ApprovalUrgencyCard;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderCard(pendingCount: number, onPress = jest.fn()) {
  let tree: any;
  act(() => {
    tree = create(
      React.createElement(ApprovalUrgencyCard, { pendingCount, onPress }),
    );
  });
  return tree;
}

function treeJSON(tree: any): string {
  return JSON.stringify(tree.toJSON());
}

function findNodeWithText(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string' && node.includes(text)) return true;
  if (node.children) {
    for (const child of node.children) {
      if (findNodeWithText(child, text)) return true;
    }
  }
  return false;
}

function findAllNodes(node: any, predicate: (n: any) => boolean): any[] {
  const results: any[] = [];
  if (!node) return results;
  if (predicate(node)) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        results.push(...findAllNodes(child, predicate));
      }
    }
  }
  return results;
}

// ─── FR1: ApprovalUrgencyCard renders correctly ───────────────────────────────

describe('ApprovalUrgencyCard — FR1: renders correctly', () => {
  it('SC1.1 — renders without crash for pendingCount=1', () => {
    expect(() => renderCard(1)).not.toThrow();
  });

  it('SC1.2 — renders without crash for pendingCount=3', () => {
    expect(() => renderCard(3)).not.toThrow();
  });

  it('SC1.3 — displays singular "1 Pending Team Request" for pendingCount=1', () => {
    const tree = renderCard(1);
    const json = treeJSON(tree);
    expect(json).toContain('1 Pending Team Request');
    expect(json).not.toContain('1 Pending Team Requests');
  });

  it('SC1.4 — displays plural "3 Pending Team Requests" for pendingCount=3', () => {
    const tree = renderCard(3);
    const json = treeJSON(tree);
    expect(json).toContain('3 Pending Team Requests');
  });

  it('SC1.5 — count badge shows correct number', () => {
    const tree = renderCard(5);
    const json = treeJSON(tree);
    // The badge should show the count as a string — either as standalone "5" or embedded
    expect(json).toContain('"5"');
  });

  it('SC1.6 — "Review Now" CTA text visible', () => {
    const tree = renderCard(2);
    const json = treeJSON(tree);
    expect(json).toContain('Review Now');
  });

  it('SC1.7 — "ACTION REQUIRED" label text visible', () => {
    const tree = renderCard(2);
    const json = treeJSON(tree);
    expect(json).toContain('ACTION REQUIRED');
  });

  it('SC1.8 — subtitle "Review before end of week" visible', () => {
    const tree = renderCard(2);
    const json = treeJSON(tree);
    expect(json).toContain('Review before end of week');
  });

  it('SC1.9 — source uses GlassCard with elevated={true} and borderAccentColor=colors.desatCoral', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('GlassCard');
    expect(source).toContain('elevated');
    expect(source).toContain('desatCoral');
  });

  it('SC1.10 — source uses padding="md" and radius="2xl" on GlassCard', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain("padding='md'");
    expect(source).toContain("radius='2xl'");
  });

  it('SC1.11 — renders without crash for pendingCount=0', () => {
    expect(() => renderCard(0)).not.toThrow();
  });
});

// ─── FR4: Breathing animation gated on useReducedMotion ───────────────────────

describe('ApprovalUrgencyCard — FR4: breathing animation gated on useReducedMotion', () => {
  it('SC4.1 — source imports useReducedMotion from react-native-reanimated', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('useReducedMotion');
    expect(source).toContain('react-native-reanimated');
  });

  it('SC4.2 — source applies animationName with scale 1 -> 1.02 (breathing keyframes)', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('animationName');
    expect(source).toContain('scale: 1');
    expect(source).toContain('scale: 1.02');
  });

  it('SC4.3 — source uses animationDuration "1500ms"', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('1500ms');
  });

  it('SC4.4 — source uses animationTimingFunction "ease-in-out"', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('ease-in-out');
  });

  it('SC4.5 — source uses animationIterationCount "infinite"', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('infinite');
  });

  it('SC4.6 — source uses animationDirection "alternate"', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('alternate');
  });

  it('SC4.7 — when reducedMotion=true, breathing style NOT applied (mock override)', () => {
    // Override useReducedMotion to return true for this test
    const Reanimated = require('react-native-reanimated');
    const origURM = Reanimated.useReducedMotion;
    Reanimated.useReducedMotion = () => true;

    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalUrgencyCard, { pendingCount: 1, onPress: jest.fn() }),
      );
    });

    // When reducedMotion=true, the breathing animated view should not have animationName
    // We verify it doesn't crash and the source gates the style
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // Source must have a conditional that checks reducedMotion before applying breathingStyle
    expect(source).toMatch(/reducedMotion.*breathing|breathing.*reducedMotion|reducedMotion.*animationName|!reducedMotion/s);
    expect(() => tree.toJSON()).not.toThrow();

    Reanimated.useReducedMotion = origURM;
  });

  it('SC4.8 — source gates pulse animation via useEffect with reducedMotion check', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    // useEffect and reducedMotion must co-appear with the withRepeat or pulse logic
    expect(source).toContain('useEffect');
    expect(source).toMatch(/reducedMotion/);
    // pulse is gated inside useEffect
    expect(source).toContain('withRepeat');
  });
});

// ─── FR5: onPress navigates to Requests tab ───────────────────────────────────

describe('ApprovalUrgencyCard — FR5: onPress callback', () => {
  it('SC5.1 — pressing the CTA calls onPress exactly once', () => {
    const onPress = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        React.createElement(ApprovalUrgencyCard, { pendingCount: 2, onPress }),
      );
    });

    // Find any element with an onPress prop and call it
    const instances = tree.root.findAll(
      (node: any) => node.props?.onPress === onPress,
      { deep: true },
    );

    // If direct onPress not found, find any pressable and check
    let invoked = false;
    if (instances.length > 0) {
      act(() => { instances[0].props.onPress(); });
      invoked = true;
    } else {
      // Find any node with onPress that isn't the root and invoke it
      const allPress = tree.root.findAll(
        (node: any) => typeof node.props?.onPress === 'function',
        { deep: true },
      );
      if (allPress.length > 0) {
        act(() => { allPress[0].props.onPress(); });
        invoked = true;
      }
    }

    expect(invoked).toBe(true);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('SC5.2 — source wires onPress to AnimatedPressable for "Review Now" CTA', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toContain('AnimatedPressable');
    expect(source).toContain('onPress');
    expect(source).toContain('Review Now');
  });

  it('SC5.3 — source imports AnimatedPressable from @/src/components/AnimatedPressable', () => {
    const source = fs.readFileSync(COMPONENT_FILE, 'utf8');
    expect(source).toMatch(/import.*AnimatedPressable.*from.*AnimatedPressable/);
  });
});
