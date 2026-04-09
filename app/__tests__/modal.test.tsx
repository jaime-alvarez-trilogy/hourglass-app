// Tests: modal.tsx BlurView integration (05-panel-glass-surfaces)
// FR3: BlurView modal — expo-blur BlurView with intensity=30, tint="dark"
//
// Mock strategy:
// - expo-blur: BlurView mocked as plain View with data-intensity/data-tint props
// - AnimatedPressable: mocked as TouchableOpacity (from 03-touch-and-navigation)
// - expo-router, @tanstack/react-query, config store, useConfig all mocked
// - No resetModules in beforeAll (avoids React context loss)

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('expo-blur', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, intensity, tint, style, ...props }: any) =>
      mockReact.createElement(
        View,
        { testID: 'blur-view', 'data-intensity': intensity, 'data-tint': tint, style, ...props },
        children
      ),
  };
});

jest.mock('@/src/components/AnimatedPressable', () => {
  const mockReact = require('react');
  const { TouchableOpacity } = require('react-native');
  return {
    AnimatedPressable: ({ children, onPress, style }: any) =>
      mockReact.createElement(TouchableOpacity, { onPress, style }, children),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock('@/src/store/config', () => ({
  clearAll: jest.fn(),
  loadConfig: jest.fn().mockResolvedValue(null),
  loadCredentials: jest.fn().mockResolvedValue({ username: 'test@example.com' }),
  saveConfig: jest.fn(),
}));

jest.mock('@/src/hooks/useConfig', () => ({
  useConfig: () => ({
    config: {
      fullName: 'Test User',
      userId: '123',
      managerId: '456',
      primaryTeamId: '789',
      assignmentId: '999',
      hourlyRate: 50,
      isManager: false,
      useQA: false,
      devManagerView: false,
      devOvertimePreview: false,
    },
  }),
}));

const MODAL_FILE = path.resolve(__dirname, '../modal.tsx');

let ModalScreen: any;
beforeAll(() => {
  ModalScreen = require('../modal').default;
});

// ─── FR3: BlurView render checks ──────────────────────────────────────────────

describe('modal — FR3: BlurView integration', () => {
  it('FR3.1 — modal renders without error', () => {
    expect(() => {
      act(() => {
        create(React.createElement(ModalScreen));
      });
    }).not.toThrow();
  });

  it('FR3.2 — modal renders a BlurView (testID="blur-view" in JSON string)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(ModalScreen));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('blur-view');
  });

  it('FR3.3 — BlurView has intensity={30} (via instance props)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(ModalScreen));
    });
    const findNode = (node: any): any => {
      if (!node) return null;
      if (node.props?.testID === 'blur-view') return node;
      const ch = Array.isArray(node.children) ? node.children : [];
      for (const c of ch) {
        if (c && typeof c === 'object') {
          const f = findNode(c);
          if (f) return f;
        }
      }
      return null;
    };
    const blurNode = findNode(tree.root);
    expect(blurNode).not.toBeNull();
    expect(blurNode.props['data-intensity']).toBe(30);
  });

  it('FR3.4 — BlurView has tint="dark" (via instance props)', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(ModalScreen));
    });
    const findNode = (node: any): any => {
      if (!node) return null;
      if (node.props?.testID === 'blur-view') return node;
      const ch = Array.isArray(node.children) ? node.children : [];
      for (const c of ch) {
        if (c && typeof c === 'object') {
          const f = findNode(c);
          if (f) return f;
        }
      }
      return null;
    };
    const blurNode = findNode(tree.root);
    expect(blurNode).not.toBeNull();
    expect(blurNode.props['data-tint']).toBe('dark');
  });

  it('FR3.5 — Settings title still renders', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(ModalScreen));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Settings');
  });

  it('FR3.6 — Sign Out button still renders', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(ModalScreen));
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Sign Out');
  });
});

// ─── FR3: Source file checks ───────────────────────────────────────────────────

describe('modal — FR3: source file structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MODAL_FILE, 'utf8');
  });

  it('FR3.7 — source imports BlurView from expo-blur', () => {
    expect(source).toContain('expo-blur');
    expect(source).toContain('BlurView');
  });

  it('FR3.8 — source uses intensity={30}', () => {
    expect(source).toContain('intensity={30}');
  });

  it('FR3.9 — source uses tint="dark"', () => {
    expect(source).toContain('tint="dark"');
  });

  it('FR3.10 — source uses surfaceElevated color for inner overlay', () => {
    expect(source).toContain('surfaceElevated');
  });
});
