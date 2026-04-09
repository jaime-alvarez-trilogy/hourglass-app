// Tests: app/modal.tsx — 09-notifications-wiring
// FR4: unregisterPushToken called before clearAll in handleSignOut
//
// Test approach:
// - Render ModalScreen, trigger sign-out Alert action, verify call order
// - Static source analysis to confirm import and ordering
//
// Mock strategy:
// - @/src/lib/pushToken: unregisterPushToken spy (call order tracked)
// - @/src/store/config: clearAll spy (call order tracked)
// - Alert: mock .alert to immediately invoke destructive action handler
// - expo-router, @tanstack/react-query, expo-blur, useConfig all mocked

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { Alert } from 'react-native';

// ── Call order tracking ───────────────────────────────────────────────────────

const callOrder: string[] = [];

const mockUnregisterPushToken = jest.fn(async () => {
  callOrder.push('unregisterPushToken');
});
const mockClearAll = jest.fn(async () => {
  callOrder.push('clearAll');
});
const mockReplace = jest.fn();

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/src/lib/pushToken', () => ({
  unregisterPushToken: mockUnregisterPushToken,
}));

jest.mock('@/src/store/config', () => ({
  clearAll: mockClearAll,
  loadCredentials: jest.fn().mockResolvedValue({ username: 'test@test.com' }),
  saveConfig: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, dismiss: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: jest.fn(), invalidateQueries: jest.fn() }),
}));

jest.mock('expo-blur', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, style }: any) =>
      mockReact.createElement(View, { style }, children),
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

jest.mock('@/src/api/auth', () => ({
  fetchAndBuildConfig: jest.fn(),
}));

jest.mock('@/src/lib/devMock', () => ({
  MOCK_TEAM_ITEMS: [],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODAL_FILE = path.resolve(__dirname, '../modal.tsx');

/**
 * Trigger the destructive sign-out action by intercepting Alert.alert.
 * The mock immediately calls the "Sign Out" button's onPress handler.
 */
function triggerSignOut(alertSpy: jest.SpyInstance): () => Promise<void> {
  return async () => {
    const [[, , buttons]] = alertSpy.mock.calls as any[];
    const destructiveBtn = buttons.find((b: any) => b.style === 'destructive');
    await destructiveBtn.onPress();
  };
}

// ── Source analysis ───────────────────────────────────────────────────────────

describe('FR4: source file structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MODAL_FILE, 'utf8');
  });

  it('FR4.0a — source imports unregisterPushToken from @/src/lib/pushToken', () => {
    expect(source).toContain('unregisterPushToken');
    expect(source).toContain('@/src/lib/pushToken');
  });

  it('FR4.0b — unregisterPushToken appears before clearAll in handleSignOut body', () => {
    // Find the handleSignOut function body
    const signOutFnIndex = source.indexOf('async function handleSignOut');
    expect(signOutFnIndex).toBeGreaterThan(-1);
    const fnBody = source.slice(signOutFnIndex);
    const unregIndex = fnBody.indexOf('unregisterPushToken');
    const clearIndex = fnBody.indexOf('clearAll');
    expect(unregIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(-1);
    expect(unregIndex).toBeLessThan(clearIndex);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Render the modal and return a function that simulates pressing the Sign Out
 * button, which triggers Alert.alert. The Alert mock immediately invokes the
 * destructive button's onPress so the async sign-out flow runs synchronously.
 *
 * Strategy: use renderer.root.findAll() to get instance-level access to nodes
 * with onPress handlers. The Sign Out button is the last TouchableOpacity in
 * the component tree that has an onPress prop. JSON-based tree search doesn't
 * work because react-test-renderer strips function values in toJSON().
 */
function renderAndGetSignOut(alertSpy: jest.SpyInstance): () => Promise<void> {
  let renderer: any;
  act(() => {
    renderer = create(React.createElement(require('../modal').default));
  });

  return async () => {
    // Intercept Alert to immediately fire the destructive action
    alertSpy.mockImplementationOnce((_title: string, _msg: string, buttons: any[]) => {
      const destructive = buttons.find((b: any) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    // Find all instance nodes with onPress (instance tree retains function refs)
    const nodesWithPress = renderer.root.findAll(
      (node: any) => node.props?.onPress !== undefined
    );
    // Sign Out is the last pressable in the modal tree
    const signOutNode = nodesWithPress[nodesWithPress.length - 1];
    if (signOutNode?.props?.onPress) {
      await act(async () => {
        await signOutNode.props.onPress();
      });
    }
  };
}

// ── Behaviour tests ───────────────────────────────────────────────────────────

describe('FR4: unregisterPushToken before clearAll in handleSignOut', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;
    // Re-register tracking implementations after clearAllMocks
    mockUnregisterPushToken.mockImplementation(async () => {
      callOrder.push('unregisterPushToken');
    });
    mockClearAll.mockImplementation(async () => {
      callOrder.push('clearAll');
    });
    alertSpy = jest.spyOn(Alert, 'alert');
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('FR4.1 — unregisterPushToken is called before clearAll', async () => {
    const triggerSignOut = renderAndGetSignOut(alertSpy);
    await triggerSignOut();

    expect(callOrder).toEqual(expect.arrayContaining(['unregisterPushToken', 'clearAll']));
    const unregIdx = callOrder.indexOf('unregisterPushToken');
    const clearIdx = callOrder.indexOf('clearAll');
    expect(unregIdx).toBeLessThan(clearIdx);
  });

  it('FR4.2 — clearAll is still called even if unregisterPushToken throws', async () => {
    mockUnregisterPushToken.mockRejectedValueOnce(new Error('network error'));

    const triggerSignOut = renderAndGetSignOut(alertSpy);
    await triggerSignOut();

    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('FR4.3 — router.replace called with /(auth)/welcome', async () => {
    const triggerSignOut = renderAndGetSignOut(alertSpy);
    await triggerSignOut();

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome');
  });
});
