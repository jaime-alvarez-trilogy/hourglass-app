// Tests: app/_layout.tsx — 09-notifications-wiring
// FR1: setNotificationHandler at module scope
// FR2: registerPushToken on setup complete
// FR3: registerBackgroundPushHandler on mount / cleanup on unmount
// durable-data 04-requests-history-ui FR5: the auth gate, splash hide and loading overlay
//   wait for the persisted-cache restore (DD4.25-DD4.27)
//
// Test approach:
// - Source-file static analysis for FR1 (module scope call) and DD4.27
// - React render + act for FR2, FR3 and FR5 (hook behaviour)
//
// Mock strategy:
// - expo-notifications: setNotificationHandler spy + addNotificationReceivedListener stub
// - @/src/lib/pushToken: registerPushToken spy
// - @/src/notifications/handler: registerBackgroundPushHandler spy
// - @/src/hooks/useConfig: controls config.setupComplete
// - @tanstack/react-query: useIsRestoring reads mockIsRestoring
// - expo-router: useRouter returns a shared router whose replace is mockReplace
// - All fonts / splash mocked to minimise side-effects

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { create, act } from 'react-test-renderer';

import { stripComments } from '../../__tests__/helpers/stripComments';

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

// durable-data 04 FR5 (C7): what useIsRestoring() reports — set per test, reset in beforeEach.
let mockIsRestoring = false;

// One shared router and segments array, stable across renders like expo-router's own, so
// every redirect lands on mockReplace and a gate re-run after the restore flip can only be
// caused by isRestoring itself.
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockSegments = ['(tabs)'];

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
(MockStack as any).Screen = function MockStackScreen() {
  return null;
};

jest.mock('expo-router', () => {
  const StackMock = ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('MockStack', null, children);
  };
  StackMock.Screen = function StackMockScreen() {
    return null;
  };
  return {
    Stack: StackMock,
    useRouter: () => mockRouter,
    useSegments: () => mockSegments,
    // 10-sdk-58-ios-27 FR4: app/_layout.tsx takes the themes from expo-router 58.
    DarkTheme: {},
    DefaultTheme: {},
    ThemeProvider: ({ children }: any) => {
      const mockReact = require('react');
      return mockReact.createElement('ThemeProvider', null, children);
    },
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({ defaultOptions: {} })),
  QueryClientProvider: ({ children }: any) => {
    const mockReact = require('react');
    return mockReact.createElement('QueryClientProvider', null, children);
  },
  focusManager: { setEventListener: jest.fn() },
  useIsRestoring: () => mockIsRestoring,
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

// Not restoring, no redirects yet. Only these two are reset here: a jest.clearAllMocks() at
// this level would wipe the module-load setNotificationHandler call that FR1.4 counts.
beforeEach(() => {
  mockIsRestoring = false;
  mockReplace.mockClear();
});

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

  // 07-ci-typecheck-lint FR5a: expo-notifications 55 NotificationBehavior —
  // banner + list replace the deprecated shouldShowAlert (iOS 14+ .banner|.list).
  it('FR1.5 — handler config: shows banner and list, no deprecated shouldShowAlert', async () => {
    const call = mockSetNotificationHandler.mock.calls[0][0];
    const result = await call.handleNotification({});
    expect(result.shouldShowBanner).toBe(true);
    expect(result.shouldShowList).toBe(true);
    expect(result.shouldShowAlert).toBeUndefined();
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

// ─── durable-data 04 FR5: the root gate waits for the cache restore ───────────
//
// While PersistQueryClientProvider restores, queries neither subscribe nor fetch, so useConfig
// reports config: null with isLoading: false. Without a restore check the gate sends a
// signed-in user to the welcome screen and hides the splash before the cache is back.

describe('FR5 (durable-data 04): root gate waits for the cache restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mountApp(): any {
    let renderer: any;
    act(() => {
      renderer = create(React.createElement(require('../_layout').default));
    });
    return renderer;
  }

  function rerenderApp(renderer: any) {
    act(() => {
      renderer.update(React.createElement(require('../_layout').default));
    });
  }

  const hasStack = (renderer: any) =>
    renderer.root.findAll((node: any) => node.type === 'MockStack').length > 0;
  const hasOverlay = (renderer: any) =>
    renderer.root.findAllByType(ActivityIndicator).length > 0;
  const hideAsync = SplashScreen.hideAsync as jest.Mock;

  it('DD4.25a — signed out, restoring: no redirect, splash kept, loading overlay instead of the Stack', async () => {
    mockIsRestoring = true;
    mockConfigValue = { config: { setupComplete: false }, isLoading: false };
    const renderer = mountApp();
    await act(async () => {});

    expect(mockReplace).not.toHaveBeenCalled();
    expect(hideAsync).not.toHaveBeenCalled();
    expect(hasOverlay(renderer)).toBe(true);
    expect(hasStack(renderer)).toBe(false);
  });

  it('DD4.25b — signed out: the restore ending redirects to welcome, hides the splash and shows the Stack', async () => {
    mockIsRestoring = true;
    mockConfigValue = { config: { setupComplete: false }, isLoading: false };
    const renderer = mountApp();
    await act(async () => {});
    // Only what happens on the flip counts.
    mockReplace.mockClear();
    hideAsync.mockClear();

    mockIsRestoring = false;
    rerenderApp(renderer);
    await act(async () => {});

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome');
    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(hasStack(renderer)).toBe(true);
    expect(hasOverlay(renderer)).toBe(false);
  });

  it('DD4.26a — signed in, in (tabs): never sent to welcome, while restoring or after the flip', async () => {
    mockIsRestoring = true;
    mockConfigValue = { config: { setupComplete: true }, isLoading: false };
    const renderer = mountApp();
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/welcome');

    mockIsRestoring = false;
    rerenderApp(renderer);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/welcome');
    expect(hasStack(renderer)).toBe(true);
  });

  it('DD4.26b — signed-in cold start (config null while restoring, then fetched): no welcome bounce', async () => {
    // 1. Restoring: the config query is parked, so config is null and isLoading is false.
    mockIsRestoring = true;
    mockConfigValue = { config: null, isLoading: false };
    const renderer = mountApp();
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/welcome');
    expect(hasOverlay(renderer)).toBe(true);

    // 2. Restore done: the config query (not persisted) starts fetching.
    mockIsRestoring = false;
    mockConfigValue = { config: null, isLoading: true };
    rerenderApp(renderer);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/welcome');
    expect(hasOverlay(renderer)).toBe(true);

    // 3. Config resolves for the signed-in user, already in (tabs): no redirect at all.
    mockConfigValue = { config: { setupComplete: true }, isLoading: false };
    rerenderApp(renderer);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
    expect(hasStack(renderer)).toBe(true);
  });
});

describe('DD4.27 (durable-data 04 FR5): _layout.tsx static checks', () => {
  let code: string;

  beforeAll(() => {
    code = stripComments(fs.readFileSync(LAYOUT_FILE, 'utf8'));
  });

  it('imports useIsRestoring from @tanstack/react-query', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\buseIsRestoring\b[^}]*\}\s*from\s*['"]@tanstack\/react-query['"]/
    );
  });

  it('gates on isLoading || isRestoring', () => {
    expect(code).toContain('isLoading || isRestoring');
  });
});
