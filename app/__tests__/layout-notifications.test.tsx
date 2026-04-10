// Tests: app/_layout.tsx — 09-notifications-wiring
// FR1: setNotificationHandler at module scope
// FR2: registerPushToken on setup complete
// FR3: registerBackgroundPushHandler on mount / cleanup on unmount
//
// Test approach:
// - Source-file static analysis for FR1 (module scope call)
// - React render + act for FR2 and FR3 (hook behaviour)
//
// Mock strategy:
// - expo-notifications: setNotificationHandler spy + addNotificationReceivedListener stub
// - @/src/lib/pushToken: registerPushToken spy
// - @/src/notifications/handler: registerBackgroundPushHandler spy
// - @/src/hooks/useConfig: controls config.setupComplete
// - All router / fonts / splash mocked to minimise side-effects

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { create, act } from 'react-test-renderer';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSetNotificationHandler = jest.fn();
const mockRemove = jest.fn();
const mockRegisterBackgroundPushHandler = jest.fn(() => ({ remove: mockRemove }));
const mockRegisterPushToken = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: mockSetNotificationHandler,
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('@/src/lib/pushToken', () => ({
  registerPushToken: mockRegisterPushToken,
}));

jest.mock('@/src/notifications/handler', () => ({
  registerBackgroundPushHandler: mockRegisterBackgroundPushHandler,
}));

// useConfig — we swap the returned value per describe block via a ref
let mockConfigValue: { config: any; isLoading: boolean } = {
  config: null,
  isLoading: false,
};
jest.mock('@/src/hooks/useConfig', () => ({
  useConfig: () => mockConfigValue,
}));

jest.mock('@/src/hooks/useRoleRefresh', () => ({
  useRoleRefresh: () => undefined,
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/src/lib/colors', () => ({
  colors: {
    background: '#0D0C14',
    violet: '#A78BFA',
    surface: '#12111A',
  },
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

const MockStack = ({ children }: any) => {
  const mockReact = require('react');
  return mockReact.createElement('MockStack', null, children);
};
(MockStack as any).Screen = () => null;

jest.mock('expo-router', () => {
  const StackMock = ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('MockStack', null, children);
  };
  StackMock.Screen = () => null;
  return {
    Stack: StackMock,
    useRouter: () => ({ replace: jest.fn() }),
    useSegments: () => ['(tabs)'],
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  ThemeProvider: ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('ThemeProvider', null, children);
  },
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({ defaultOptions: {} })),
  QueryClientProvider: ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('QueryClientProvider', null, children);
  },
  focusManager: {
    setEventListener: jest.fn(),
  },
}));

jest.mock('@tanstack/react-query-persist-client', () => ({
  PersistQueryClientProvider: ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('PersistQueryClientProvider', null, children);
  },
}));

jest.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: jest.fn(() => ({})),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children, style }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('GestureHandlerRootView', { style }, children);
  },
}));

jest.mock('react-native-reanimated', () => ({}));

// Font mocks
jest.mock('@expo-google-fonts/inter', () => ({
  Inter_300Light: 'Inter_300Light',
  Inter_400Regular: 'Inter_400Regular',
  Inter_500Medium: 'Inter_500Medium',
  Inter_600SemiBold: 'Inter_600SemiBold',
  Inter_700Bold: 'Inter_700Bold',
  Inter_800ExtraBold: 'Inter_800ExtraBold',
}));

jest.mock('@expo-google-fonts/space-grotesk', () => ({
  SpaceGrotesk_400Regular: 'SpaceGrotesk_400Regular',
  SpaceGrotesk_500Medium: 'SpaceGrotesk_500Medium',
  SpaceGrotesk_600SemiBold: 'SpaceGrotesk_600SemiBold',
  SpaceGrotesk_700Bold: 'SpaceGrotesk_700Bold',
}));

jest.mock('@expo-google-fonts/space-mono', () => ({
  SpaceMono_400Regular: 'SpaceMono_400Regular',
  SpaceMono_700Bold: 'SpaceMono_700Bold',
}));

// ── Source reference ─────────────────────────────────────────────────────────

const LAYOUT_FILE = path.resolve(__dirname, '../_layout.tsx');

// Force _layout module to load NOW so setNotificationHandler fires during module init
// before any test runs. We do this here (not in beforeAll) because jest.mock hoisting
// guarantees mocks are in place before this module-level code executes.
require('../_layout');

// ─── FR1: setNotificationHandler at module scope ──────────────────────────────

describe('FR1: setNotificationHandler — module scope', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(LAYOUT_FILE, 'utf8');
  });

  it('FR1.1 — source imports expo-notifications', () => {
    expect(source).toContain('expo-notifications');
  });

  it('FR1.2 — source calls setNotificationHandler', () => {
    expect(source).toContain('setNotificationHandler');
  });

  it('FR1.3 — setNotificationHandler is at module scope (not inside a function)', () => {
    // Module-scope means it appears before any component function declaration
    const handlerCallIndex = source.indexOf('setNotificationHandler(');
    const rootLayoutIndex = source.indexOf('function RootLayout');
    const appIndex = source.indexOf('function App');
    expect(handlerCallIndex).toBeGreaterThan(-1);
    const firstComponentIndex = Math.min(
      rootLayoutIndex === -1 ? Infinity : rootLayoutIndex,
      appIndex === -1 ? Infinity : appIndex
    );
    expect(handlerCallIndex).toBeLessThan(firstComponentIndex);
  });

  it('FR1.4 — setNotificationHandler is called once when module loads', () => {
    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('FR1.5 — handler config: shouldShowAlert is true', async () => {
    const call = mockSetNotificationHandler.mock.calls[0][0];
    const result = await call.handleNotification({});
    expect(result.shouldShowAlert).toBe(true);
  });

  it('FR1.6 — handler config: shouldPlaySound is true', async () => {
    const call = mockSetNotificationHandler.mock.calls[0][0];
    const result = await call.handleNotification({});
    expect(result.shouldPlaySound).toBe(true);
  });

  it('FR1.7 — handler config: shouldSetBadge is false', async () => {
    const call = mockSetNotificationHandler.mock.calls[0][0];
    const result = await call.handleNotification({});
    expect(result.shouldSetBadge).toBe(false);
  });
});

// ─── FR2: registerPushToken on setup complete ─────────────────────────────────

describe('FR2: registerPushToken — called when setupComplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterPushToken.mockResolvedValue(undefined);
  });

  function renderApp(config: any) {
    mockConfigValue = { config, isLoading: false };
    let renderer: any;
    act(() => {
      renderer = create(React.createElement(require('../_layout').default));
    });
    return renderer;
  }

  it('FR2.1 — registerPushToken called when config.setupComplete is true', async () => {
    renderApp({ setupComplete: true });
    await act(async () => {});
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
  });

  it('FR2.2 — registerPushToken NOT called when config is null', async () => {
    renderApp(null);
    await act(async () => {});
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('FR2.3 — registerPushToken NOT called when config.setupComplete is false', async () => {
    renderApp({ setupComplete: false });
    await act(async () => {});
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('FR2.4 — registerPushToken called at most once (re-render guard)', async () => {
    mockConfigValue = { config: { setupComplete: true }, isLoading: false };
    let renderer: any;
    act(() => {
      renderer = create(React.createElement(require('../_layout').default));
    });
    await act(async () => {});
    // Trigger another render by updating context (simulate re-render)
    act(() => {
      renderer.update(React.createElement(require('../_layout').default));
    });
    await act(async () => {});
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
  });

  it('FR2.5 — registerPushToken throw is swallowed (no crash)', async () => {
    mockRegisterPushToken.mockRejectedValueOnce(new Error('Network error'));
    expect(() => {
      renderApp({ setupComplete: true });
    }).not.toThrow();
    await act(async () => {});
    // No unhandled rejection should propagate
  });
});

// ─── FR3: registerBackgroundPushHandler on mount ─────────────────────────────

describe('FR3: registerBackgroundPushHandler — mount and cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterBackgroundPushHandler.mockReturnValue({ remove: mockRemove });
  });

  it('FR3.1 — registerBackgroundPushHandler called on mount', async () => {
    mockConfigValue = { config: null, isLoading: false };
    act(() => {
      create(React.createElement(require('../_layout').default));
    });
    await act(async () => {});
    expect(mockRegisterBackgroundPushHandler).toHaveBeenCalledTimes(1);
  });

  it('FR3.2 — subscription.remove() called on unmount', async () => {
    mockConfigValue = { config: null, isLoading: false };
    let renderer: any;
    act(() => {
      renderer = create(React.createElement(require('../_layout').default));
    });
    await act(async () => {});
    // Unmount
    act(() => {
      renderer.unmount();
    });
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
