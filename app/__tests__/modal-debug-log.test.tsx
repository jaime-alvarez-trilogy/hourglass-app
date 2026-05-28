// Spec 08-observability-log FR9: Settings modal Debug Log section tests.

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

// ── Mocks (must come before modal import) ────────────────────────────────────

const mockGetLogFileUri = jest.fn(async () => '/mock-docs/hourglass-debug.log');
const mockClear = jest.fn(async () => undefined);

jest.mock('@/src/lib/log', () => ({
  log: {
    getLogFileUri: mockGetLogFileUri,
    clear: mockClear,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    flush: jest.fn(),
  },
}));

const mockShareAsync = jest.fn(async () => undefined);
jest.mock('expo-sharing', () => ({
  shareAsync: mockShareAsync,
  isAvailableAsync: jest.fn(async () => true),
}));

jest.mock('@/src/lib/pushToken', () => ({
  unregisterPushToken: jest.fn(),
}));

jest.mock('@/src/store/config', () => ({
  clearAll: jest.fn(),
  loadCredentials: jest.fn().mockResolvedValue({ username: 'someone@example.com' }),
  saveConfig: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), dismiss: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
    clear: jest.fn(),
  }),
}));

jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(),
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

function renderModal() {
  let renderer: any;
  act(() => {
    renderer = create(React.createElement(require('../modal').default));
  });
  return renderer;
}

function findTextNodes(renderer: any, predicate: (text: string) => boolean): any[] {
  return renderer.root.findAll((node: any) => {
    if (node.type !== Text) return false;
    const children = node.props?.children;
    const text = Array.isArray(children) ? children.join('') : String(children ?? '');
    return predicate(text);
  });
}

function findPressableForLabel(renderer: any, label: string): any | undefined {
  // Find a Text node containing the label, then walk up to the closest pressable.
  const textNodes = findTextNodes(renderer, (t) => t.includes(label));
  for (const textNode of textNodes) {
    let parent = textNode.parent;
    while (parent) {
      if (parent.props?.onPress) return parent;
      parent = parent.parent;
    }
  }
  return undefined;
}

// ── Source analysis ───────────────────────────────────────────────────────────

describe('FR9: source file structure', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MODAL_FILE, 'utf8');
  });

  it('FR9.0a — imports log from @/src/lib/log', () => {
    expect(source).toMatch(/from '@\/src\/lib\/log'/);
  });

  it('FR9.0b — imports expo-sharing', () => {
    expect(source).toMatch(/from 'expo-sharing'/);
  });

  it('FR9.0c — contains a "Debug Log" heading literal', () => {
    expect(source).toContain('Debug Log');
  });

  it('FR9.0d — contains "Share log" and "Clear log" button labels', () => {
    expect(source).toContain('Share log');
    expect(source).toContain('Clear log');
  });
});

// ── Behaviour tests ──────────────────────────────────────────────────────────

describe('FR9: Debug Log section rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLogFileUri.mockResolvedValue('/mock-docs/hourglass-debug.log');
    mockClear.mockResolvedValue(undefined);
    mockShareAsync.mockResolvedValue(undefined);
  });

  // T46 + T47
  it('renders the Debug Log heading and both buttons', () => {
    const renderer = renderModal();
    expect(findTextNodes(renderer, (t) => t === 'Debug Log').length).toBeGreaterThan(0);
    expect(findTextNodes(renderer, (t) => t === 'Share log').length).toBeGreaterThan(0);
    expect(findTextNodes(renderer, (t) => t === 'Clear log').length).toBeGreaterThan(0);
  });

  // T48
  it('section is visible regardless of isMe gate', () => {
    // The mock for loadCredentials returns a non-dev username; the buttons must
    // still render unconditionally.
    const renderer = renderModal();
    const shareNodes = findTextNodes(renderer, (t) => t === 'Share log');
    expect(shareNodes.length).toBeGreaterThan(0);
  });
});

describe('FR9: Share log behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLogFileUri.mockResolvedValue('/mock-docs/hourglass-debug.log');
    mockShareAsync.mockResolvedValue(undefined);
  });

  // T49
  it('tapping Share log calls Sharing.shareAsync with the log URI and options', async () => {
    const renderer = renderModal();
    const shareBtn = findPressableForLabel(renderer, 'Share log');
    expect(shareBtn).toBeDefined();
    await act(async () => {
      await shareBtn!.props.onPress();
    });
    expect(mockGetLogFileUri).toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    const [uri, opts] = mockShareAsync.mock.calls[0];
    expect(uri).toMatch(/hourglass-debug\.log$/);
    expect(opts).toEqual(
      expect.objectContaining({
        dialogTitle: 'Share debug log',
        mimeType: 'text/plain',
      })
    );
  });

  // T50
  it('share rejection surfaces an Alert', async () => {
    mockShareAsync.mockRejectedValueOnce(new Error('share unavailable'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const renderer = renderModal();
      const shareBtn = findPressableForLabel(renderer, 'Share log');
      await act(async () => {
        await shareBtn!.props.onPress();
      });
      expect(alertSpy).toHaveBeenCalledWith('Could not share', expect.any(String));
    } finally {
      alertSpy.mockRestore();
    }
  });
});

describe('FR9: Clear log behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClear.mockResolvedValue(undefined);
  });

  // T51
  it('tapping Clear log shows a confirmation Alert with Cancel + Clear', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const renderer = renderModal();
      const clearBtn = findPressableForLabel(renderer, 'Clear log');
      await act(async () => {
        await clearBtn!.props.onPress();
      });
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, _msg, buttons] = alertSpy.mock.calls[0] as any[];
      expect(title).toBe('Clear log?');
      expect(Array.isArray(buttons)).toBe(true);
      const labels = buttons.map((b: any) => b.text);
      expect(labels).toEqual(expect.arrayContaining(['Cancel', 'Clear']));
    } finally {
      alertSpy.mockRestore();
    }
  });

  // T52
  it('confirming Clear invokes log.clear()', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons: any) => {
      const clearBtn = buttons.find((b: any) => b.text === 'Clear');
      clearBtn?.onPress?.();
    });
    try {
      const renderer = renderModal();
      const clearBtn = findPressableForLabel(renderer, 'Clear log');
      await act(async () => {
        await clearBtn!.props.onPress();
      });
      expect(mockClear).toHaveBeenCalledTimes(1);
    } finally {
      alertSpy.mockRestore();
    }
  });

  // T53
  it('cancelling does NOT invoke log.clear()', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons: any) => {
      const cancelBtn = buttons.find((b: any) => b.text === 'Cancel');
      cancelBtn?.onPress?.();
    });
    try {
      const renderer = renderModal();
      const clearBtn = findPressableForLabel(renderer, 'Clear log');
      await act(async () => {
        await clearBtn!.props.onPress();
      });
      expect(mockClear).not.toHaveBeenCalled();
    } finally {
      alertSpy.mockRestore();
    }
  });
});
