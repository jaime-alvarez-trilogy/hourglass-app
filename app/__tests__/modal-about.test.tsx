// Spec store-compliance/02-in-app-legal-links FR3–FR5: Settings → About section
// (Privacy Policy / Support links and the binary version + OTA update row).
//
// The URLs are spelled out here rather than imported from @/src/lib/legalLinks so
// this suite proves the modal opens the exact published pages (spec 01 page map).

import React from 'react';
import { create, act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Linking, Text } from 'react-native';

const PRIVACY_POLICY_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html';
const SUPPORT_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html';
const UPDATE_ID = '0f3c9a12-3456-4abc-8def-1234567890ab';
const DEV_USERNAME = 'someone@example.com';

// ── Mutable mock state (reset in beforeEach) ────────────────────────────────

interface MockConfig {
  fullName: string;
  userId: string;
  managerId: string;
  primaryTeamId: string;
  assignmentId: string;
  hourlyRate: number;
  isManager: boolean;
  useQA: boolean;
  devManagerView: boolean;
  devOvertimePreview: boolean;
}

interface MockConstants {
  expoConfig: { version?: string; ios?: { buildNumber?: string } } | null;
  platform: { ios?: { buildNumber: string | null } } | undefined;
}

interface MockUpdates {
  updateId: string | null;
  isEmbeddedLaunch: boolean;
}

interface MockApplication {
  nativeApplicationVersion: string | null;
}

function baseConfig(overrides: Partial<MockConfig> = {}): MockConfig {
  return {
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
    ...overrides,
  };
}

let mockConfig: MockConfig | null = baseConfig();
let mockConstants: MockConstants = {
  expoConfig: { version: '1.1.0', ios: { buildNumber: '18' } },
  platform: { ios: { buildNumber: '18' } },
};
let mockUpdates: MockUpdates = { updateId: UPDATE_ID, isEmbeddedLaunch: false };
let mockApplication: MockApplication = { nativeApplicationVersion: '1.1.0' };

type BrowserResult = { type: 'dismiss' | 'locked' | 'cancel' | 'opened' };
const mockOpenBrowserAsync = jest.fn(
  (_url: string, _opts?: object): Promise<BrowserResult> => Promise.resolve({ type: 'dismiss' }),
);

// ── Mocks (must come before the modal is required) ──────────────────────────

jest.mock('@/src/lib/log', () => ({
  log: {
    getLogFileUri: jest.fn(async () => '/mock-docs/hourglass-debug.log'),
    clear: jest.fn(async () => undefined),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    flush: jest.fn(),
  },
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(async () => undefined),
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
    BlurView: ({ children, style }: { children?: React.ReactNode; style?: object }) =>
      mockReact.createElement(View, { style }, children),
  };
});

jest.mock('@/src/components/AnimatedPressable', () => {
  const mockReact = require('react');
  const { TouchableOpacity } = require('react-native');
  return {
    AnimatedPressable: ({
      children,
      onPress,
      style,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      style?: object;
    }) => mockReact.createElement(TouchableOpacity, { onPress, style }, children),
  };
});

jest.mock('@/src/hooks/useConfig', () => ({
  useConfig: () => ({ config: mockConfig }),
}));

jest.mock('@/src/api/auth', () => ({
  fetchAndBuildConfig: jest.fn(),
}));

jest.mock('@/src/lib/devMock', () => ({
  MOCK_TEAM_ITEMS: [],
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string, opts?: object) => mockOpenBrowserAsync(url, opts),
  WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

jest.mock('expo-updates', () => ({
  __esModule: true,
  get updateId() {
    return mockUpdates.updateId;
  },
  get isEmbeddedLaunch() {
    return mockUpdates.isEmbeddedLaunch;
  },
}));

jest.mock('expo-application', () => ({
  __esModule: true,
  get nativeApplicationVersion() {
    return mockApplication.nativeApplicationVersion;
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

let renderer: ReactTestRenderer;

async function renderModal(): Promise<ReactTestRenderer> {
  let created: ReactTestRenderer | undefined;
  await act(async () => {
    created = create(React.createElement(require('../modal').default));
  });
  if (!created) throw new Error('modal did not render');
  renderer = created;
  return created;
}

function textOf(node: ReactTestInstance): string {
  const children = node.props?.children;
  return Array.isArray(children) ? children.join('') : String(children ?? '');
}

function textsUnder(node: ReactTestInstance): string[] {
  return node.findAll((n) => n.type === Text).map(textOf);
}

function textsInOrder(): string[] {
  return textsUnder(renderer.root);
}

function byTestID(testID: string): ReactTestInstance | undefined {
  return renderer.root.findAll((n) => n.props?.testID === testID)[0];
}

function pressable(testID: string): ReactTestInstance {
  const node = renderer.root.findAll(
    (n) => n.props?.testID === testID && typeof n.props?.onPress === 'function',
  )[0];
  if (!node) throw new Error(`No pressable with testID "${testID}" rendered`);
  return node;
}

function versionTexts(): string[] {
  const node = byTestID('about-version');
  if (!node) throw new Error('No node with testID "about-version" rendered');
  return textsUnder(node);
}

async function press(testID: string): Promise<void> {
  const onPress = pressable(testID).props.onPress as () => unknown;
  await act(async () => {
    await onPress();
  });
}

function expectAboutRendered(): void {
  const texts = textsInOrder();
  expect(texts).toContain('About');
  expect(texts).toContain('Privacy Policy');
  expect(texts).toContain('Support');
  expect(byTestID('about-version')).toBeDefined();
}

let openURLSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig = baseConfig();
  mockConstants = {
    expoConfig: { version: '1.1.0', ios: { buildNumber: '18' } },
    platform: { ios: { buildNumber: '18' } },
  };
  mockUpdates = { updateId: UPDATE_ID, isEmbeddedLaunch: false };
  mockApplication = { nativeApplicationVersion: '1.1.0' };
  mockOpenBrowserAsync.mockReset();
  mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
  openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  openURLSpy.mockRestore();
  alertSpy.mockRestore();
});

// ── FR3: rendering ──────────────────────────────────────────────────────────

describe('FR3: About section rendering', () => {
  it('FR3.1 — renders About, Privacy Policy, Support and the version row for a non-manager', async () => {
    await renderModal();
    expectAboutRendered();

    const section = byTestID('about-section');
    expect(section).toBeDefined();
    const sectionTexts = textsUnder(section!);
    expect(sectionTexts).toEqual(expect.arrayContaining(['About', 'Privacy Policy', 'Support']));
    expect(section!.findAll((n) => n.props?.testID === 'about-version').length).toBeGreaterThan(0);
    expect(byTestID('about-version')!.props.onPress).toBeUndefined();
  });

  it('FR3.2 — renders the same elements for a manager', async () => {
    mockConfig = baseConfig({ isManager: true });
    await renderModal();
    expectAboutRendered();
  });

  it('FR3.3 — renders the same elements when config is null (Config Debug absent)', async () => {
    mockConfig = null;
    await renderModal();
    expectAboutRendered();
    expect(textsInOrder()).not.toContain('Config Debug');
  });

  it('FR3.4 — for the dev account, order is Debug Log < About < Dev Options < Sign Out', async () => {
    const previous = process.env.EXPO_PUBLIC_DEV_USERNAME;
    process.env.EXPO_PUBLIC_DEV_USERNAME = DEV_USERNAME;
    try {
      await renderModal();
      const texts = textsInOrder();
      const debugLog = texts.indexOf('Debug Log');
      const about = texts.indexOf('About');
      const devOptions = texts.indexOf('Dev Options');
      const signOut = texts.indexOf('Sign Out');

      expect(debugLog).toBeGreaterThanOrEqual(0);
      expect(about).toBeGreaterThan(debugLog);
      expect(devOptions).toBeGreaterThan(about);
      expect(signOut).toBeGreaterThan(devOptions);
    } finally {
      if (previous === undefined) {
        delete process.env.EXPO_PUBLIC_DEV_USERNAME;
      } else {
        process.env.EXPO_PUBLIC_DEV_USERNAME = previous;
      }
    }
  });

  it('FR3.5 — the About rows precede Sign Out, which stays the last onPress node', async () => {
    await renderModal();
    const privacy = pressable('about-privacy');
    const support = pressable('about-support');
    const withPress = renderer.root.findAll((n) => n.props?.onPress !== undefined);
    const last = withPress[withPress.length - 1];

    expect(withPress.indexOf(privacy)).toBeGreaterThanOrEqual(0);
    expect(withPress.indexOf(support)).toBeGreaterThan(withPress.indexOf(privacy));
    expect(withPress.indexOf(last)).toBeGreaterThan(withPress.indexOf(support));
    expect(textsUnder(last)).toContain('Sign Out');
  });

  it('FR3.6 — both legal rows expose accessibilityRole "link"', async () => {
    await renderModal();
    expect(pressable('about-privacy').props.accessibilityRole).toBe('link');
    expect(pressable('about-support').props.accessibilityRole).toBe('link');
  });
});

// ── FR4: opening links ──────────────────────────────────────────────────────

describe('FR4: opening legal links', () => {
  it('FR4.1 — Privacy Policy opens the in-app browser sheet with the privacy URL', async () => {
    await renderModal();
    await press('about-privacy');

    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(PRIVACY_POLICY_URL, {
      presentationStyle: 'automatic',
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('FR4.2 — Support opens the in-app browser sheet with the support URL', async () => {
    await renderModal();
    await press('about-support');

    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(SUPPORT_URL, {
      presentationStyle: 'automatic',
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });

  it('FR4.3 — a "locked" result (sheet already open) is success: no fallback, no alert', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'locked' });
    await renderModal();
    await press('about-privacy');

    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(openURLSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('FR4.4 — when the sheet rejects, falls back to Linking.openURL with the same URL', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('unavailable'));
    await renderModal();
    await press('about-privacy');

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('FR4.5 — when both paths reject, onPress still resolves and an Alert shows the URL', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('unavailable'));
    openURLSpy.mockRejectedValue(new Error('no handler'));
    await renderModal();
    const onPress = pressable('about-support').props.onPress as () => Promise<unknown>;

    await act(async () => {
      await expect(onPress()).resolves.toBeUndefined();
    });

    expect(openURLSpy).toHaveBeenCalledWith(SUPPORT_URL);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Could not open link', SUPPORT_URL);
  });

  it('FR4.6 — in the QA environment Privacy Policy still opens the production legal URL', async () => {
    mockConfig = baseConfig({ useQA: true });
    await renderModal();
    await press('about-privacy');

    expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(PRIVACY_POLICY_URL, {
      presentationStyle: 'automatic',
    });
  });
});

// ── FR5: build info wiring ──────────────────────────────────────────────────

describe('FR5: version / update row wiring', () => {
  it('FR5.1 — store build on an OTA update shows binary version, build and update prefix', async () => {
    mockApplication = { nativeApplicationVersion: '1.1.0' };
    mockConstants = {
      expoConfig: { version: '1.1.0', ios: { buildNumber: '18' } },
      platform: { ios: { buildNumber: '18' } },
    };
    mockUpdates = { updateId: UPDATE_ID, isEmbeddedLaunch: false };
    await renderModal();

    const texts = versionTexts();
    expect(texts).toContain('Version 1.1.0 (18)');
    expect(texts).toContain('Update: 0f3c9a12');
  });

  it('FR5.2 — the native build number wins over expoConfig', async () => {
    mockConstants = {
      expoConfig: { version: '1.1.0', ios: { buildNumber: '17' } },
      platform: { ios: { buildNumber: '18' } },
    };
    await renderModal();

    expect(versionTexts()).toContain('Version 1.1.0 (18)');
  });

  it('FR5.3 — without a native build number, falls back to expoConfig.ios.buildNumber', async () => {
    mockConstants = {
      expoConfig: { version: '1.1.0', ios: { buildNumber: '17' } },
      platform: undefined,
    };
    await renderModal();

    expect(versionTexts()).toContain('Version 1.1.0 (17)');
  });

  it('FR5.4 — an embedded launch reads "Update: embedded" even with a non-null updateId', async () => {
    mockUpdates = { updateId: UPDATE_ID, isEmbeddedLaunch: true };
    await renderModal();

    const texts = versionTexts();
    expect(texts).toContain('Update: embedded');
    expect(texts).not.toContain('Update: 0f3c9a12');
  });

  it('FR5.5 — no native version and no expoConfig reads "Version unknown (18)"', async () => {
    mockApplication = { nativeApplicationVersion: null };
    mockConstants = { expoConfig: null, platform: { ios: { buildNumber: '18' } } };
    await renderModal();

    expect(versionTexts()).toContain('Version unknown (18)');
  });

  it('FR5.6 — an OTA published from a version-bumped tree still shows the binary values', async () => {
    mockApplication = { nativeApplicationVersion: '1.1.0' };
    mockConstants = {
      expoConfig: { version: '1.1.1', ios: { buildNumber: '19' } },
      platform: { ios: { buildNumber: '18' } },
    };
    mockUpdates = { updateId: UPDATE_ID, isEmbeddedLaunch: false };
    await renderModal();

    const texts = versionTexts();
    expect(texts).toContain('Version 1.1.0 (18)');
    expect(texts).toContain('Update: 0f3c9a12');
    expect(texts.filter((t) => t.includes('1.1.1') || t.includes('19'))).toEqual([]);
  });

  it('FR5.7 — without a native version, falls back to expoConfig.version', async () => {
    mockApplication = { nativeApplicationVersion: null };
    mockConstants = {
      expoConfig: { version: '1.1.1', ios: { buildNumber: '17' } },
      platform: { ios: { buildNumber: '18' } },
    };
    await renderModal();

    expect(versionTexts()).toContain('Version 1.1.1 (18)');
  });
});
