// Tests: CollapsibleSection — 1.2 home screen, the hide / show toggle of a detail card
// File: src/components/CollapsibleSection.tsx
//
//   structure: toggle (role button, expanded state, label, testID) + header + chevron;
//   expanded → body, no summary; collapsed → summary inside the toggle, no body; press →
//   onToggle once
//   motion: never on mount or on an un-pressed change (the stored preference arriving);
//   after a press, expand uses panelOpen (springBouncy) and collapse panelClose
//   (springSnappy); reduced motion → no animation
//   source: panelTransition + useReducedMotion + AnimatedPressable, no raw hex
//
// Reanimated is the official mock with withSpring / withTiming spied and useReducedMotion
// switchable; @expo/vector-icons is stubbed (its font loading crashes jest-expo/node).

import React from 'react';
import { Text } from 'react-native';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import { withSpring, withTiming } from 'react-native-reanimated';
import CollapsibleSection, { type CollapsibleSectionProps } from '../CollapsibleSection';
import { springBouncy, springSnappy } from '@/src/lib/reanimated-presets';

let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  return {
    ...mock,
    withSpring: jest.fn(mock.withSpring),
    withTiming: jest.fn(mock.withTiming),
    useReducedMotion: () => mockReducedMotion,
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COMPONENT_FILE = path.resolve(__dirname, '../CollapsibleSection.tsx');
const mockWithSpring = withSpring as unknown as jest.Mock;
const mockWithTiming = withTiming as unknown as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function element(props: Partial<Omit<CollapsibleSectionProps, 'children'>> = {}): React.ReactElement {
  return (
    <CollapsibleSection
      collapsed={false}
      onToggle={() => {}}
      accessibilityLabel="Section. Hide details"
      toggleTestID="section-toggle"
      header={<Text testID="section-header">HEADER</Text>}
      summary={<Text testID="section-summary">summary line</Text>}
      {...props}
    >
      <Text testID="section-body">body</Text>
    </CollapsibleSection>
  );
}

function render(props: Partial<Omit<CollapsibleSectionProps, 'children'>> = {}): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(element(props));
  });
  return tree!;
}

function has(tree: ReactTestRenderer, id: string): boolean {
  return tree.root.findAll((n) => n.props.testID === id).length > 0;
}

function toggleOf(tree: ReactTestRenderer): ReactTestInstance {
  const [toggle] = tree.root.findAll(
    (n) => n.props.testID === 'section-toggle' && typeof n.props.onPress === 'function',
  );
  if (!toggle) throw new Error('no toggle');
  return toggle;
}

function press(tree: ReactTestRenderer): void {
  act(() => toggleOf(tree).props.onPress());
}

/** The spring configs withSpring was called with since the last clear. */
function springConfigs(): unknown[] {
  return mockWithSpring.mock.calls.map((call) => call[1]);
}

beforeEach(() => {
  mockReducedMotion = false;
  mockWithSpring.mockClear();
  mockWithTiming.mockClear();
});

// ─── Structure ────────────────────────────────────────────────────────────────

describe('CollapsibleSection — structure', () => {
  it('the toggle is a button with its expanded state and label', () => {
    const toggle = toggleOf(render({ accessibilityLabel: 'Pay week, 1h left. Hide details' }));
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: true });
    expect(toggle.props.accessibilityLabel).toBe('Pay week, 1h left. Hide details');
  });

  it('collapsed: expanded false in the accessibility state', () => {
    expect(toggleOf(render({ collapsed: true })).props.accessibilityState).toEqual({ expanded: false });
  });

  it('expanded: header, chevron and body; no summary', () => {
    const tree = render();
    expect(has(tree, 'section-header')).toBe(true);
    expect(has(tree, 'section-body')).toBe(true);
    expect(has(tree, 'section-summary')).toBe(false);
    expect(tree.root.findAll((n) => (n.type as unknown) === 'Ionicons')).toHaveLength(1);
  });

  it('collapsed: header and summary inside the toggle; no body', () => {
    const tree = render({ collapsed: true });
    expect(has(tree, 'section-header')).toBe(true);
    expect(has(tree, 'section-body')).toBe(false);
    expect(toggleOf(tree).findAll((n) => n.props.testID === 'section-summary').length).toBeGreaterThan(0);
  });

  it('collapsed without a summary: header only', () => {
    const tree = render({ collapsed: true, summary: undefined });
    expect(has(tree, 'section-header')).toBe(true);
    expect(has(tree, 'section-summary')).toBe(false);
    expect(has(tree, 'section-body')).toBe(false);
  });

  it('a press calls onToggle once', () => {
    const onToggle = jest.fn();
    press(render({ onToggle }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// ─── Motion ───────────────────────────────────────────────────────────────────

describe('CollapsibleSection — motion', () => {
  it('never animates on mount', () => {
    render();
    render({ collapsed: true });
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it('does not animate a change nobody pressed for (the stored preference arriving)', () => {
    const tree = render();
    act(() => tree.update(element({ collapsed: true })));
    act(() => tree.update(element({ collapsed: false })));
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(has(tree, 'section-body')).toBe(true);
  });

  it('collapse after a press: panelClose (springSnappy) only', () => {
    const tree = render();
    press(tree);
    act(() => tree.update(element({ collapsed: true })));
    expect(mockWithSpring).toHaveBeenCalled();
    for (const config of springConfigs()) expect(config).toBe(springSnappy);
  });

  it('expand after a press: panelOpen (springBouncy) only, chevron and body', () => {
    const tree = render({ collapsed: true });
    press(tree);
    act(() => tree.update(element({ collapsed: false })));
    // Chevron turn + body reveal
    expect(mockWithSpring).toHaveBeenCalledTimes(2);
    for (const config of springConfigs()) expect(config).toBe(springBouncy);
    expect(has(tree, 'section-body')).toBe(true);
  });

  it('reduced motion: no animation, same structure', () => {
    mockReducedMotion = true;
    const tree = render();
    press(tree);
    act(() => tree.update(element({ collapsed: true })));
    expect(has(tree, 'section-summary')).toBe(true);
    press(tree);
    act(() => tree.update(element({ collapsed: false })));
    expect(has(tree, 'section-body')).toBe(true);
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});

// ─── Source contract ──────────────────────────────────────────────────────────

describe('CollapsibleSection — source contract', () => {
  const source = fs.readFileSync(COMPONENT_FILE, 'utf8');

  it('takes its motion from panelTransition (panelOpen / panelClose)', () => {
    expect(source).toMatch(/panelTransition\(/);
    expect(source).toContain("'panelOpen'");
    expect(source).toContain("'panelClose'");
  });

  it('respects reduced motion and presses through AnimatedPressable', () => {
    expect(source).toMatch(/useReducedMotion\(\)/);
    expect(source).toMatch(/import \{ AnimatedPressable \} from '\.\/AnimatedPressable'/);
  });

  it('has no raw hex colours', () => {
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
