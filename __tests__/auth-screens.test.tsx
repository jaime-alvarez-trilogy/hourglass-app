// FR1-FR4, FR6-FR7: Auth screen rendering and interaction tests
//
// 10-sdk-58-ios-27 FR4 (Decision 4): rewritten for RNTL 14 onto host queries. RNTL 14 renders
// through test-renderer, which keeps host elements only, so the removed legacy *ByType
// queries (composite TouchableOpacity / TextInput / Text types) have no direct port:
//   - text, placeholder and display-value queries find labels, inputs and messages;
//   - testIDs exist only where nothing else fits: the GradientButton CTAs while loading (the
//     label is replaced by a spinner) and the spinners themselves (no text or role);
//   - every render, fireEvent and act is awaited (all async in RNTL 14).
// RNTL 14 accepts only React Native's own host text names (Text/RCTText), so this suite runs
// in the jest.config.js "ios" project (jest-expo/ios), not the react-native-web node project.
import React from 'react';
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { CrossoverConfig } from '../src/types/config';

// --- Mocks (must come before screen imports) ---

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  Redirect: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../src/contexts/OnboardingContext', () => ({
  useOnboarding: jest.fn(),
}));

jest.mock('../src/hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

jest.mock('../src/hooks/useRoleRefresh', () => ({
  useRoleRefresh: jest.fn(),
}));

jest.mock('../src/store/config', () => ({
  saveConfig: jest.fn(),
  saveCredentials: jest.fn(),
  clearAll: jest.fn(),
}));

// 05-onboarding-defense FR7: not-contributor screen calls invalidateAuthToken on sign-out
jest.mock('../src/api/client', () => ({
  invalidateAuthToken: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ setQueryData: jest.fn() })),
}));

// Static imports of screens after mocks are registered
import WelcomeScreen from '../app/(auth)/welcome';
import CredentialsScreen from '../app/(auth)/credentials';
import VerifyingScreen from '../app/(auth)/verifying';
import SetupScreen from '../app/(auth)/setup';
import SuccessScreen from '../app/(auth)/success';
// 05-onboarding-defense FR7: new screen
import NotContributorScreen from '../app/(auth)/not-contributor';

import { useRouter } from 'expo-router';
import { useOnboarding } from '../src/contexts/OnboardingContext';
import { useConfig } from '../src/hooks/useConfig';
import { saveConfig, saveCredentials, clearAll } from '../src/store/config';
import { invalidateAuthToken } from '../src/api/client';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockUseConfig = useConfig as jest.MockedFunction<typeof useConfig>;
const mockSaveConfig = saveConfig as jest.MockedFunction<typeof saveConfig>;
const mockSaveCredentials = saveCredentials as jest.MockedFunction<typeof saveCredentials>;

const makeConfig = (overrides: Partial<CrossoverConfig> = {}): CrossoverConfig => ({
  userId: '2362707', fullName: 'Jane Doe', managerId: '2372227',
  primaryTeamId: '4584', assignmentId: '79996', hourlyRate: 75,
  weeklyLimit: 40, useQA: false, isManager: false,
  teams: [{ id: '4584', name: 'Team Alpha', company: '' }],
  lastRoleCheck: new Date().toISOString(), setupComplete: true,
  setupDate: new Date().toISOString(), debugMode: false,
  ...overrides,
});

const makeSetupResult = (overrides: Partial<ReturnType<typeof useOnboarding>> = {}): ReturnType<typeof useOnboarding> => ({
  step: 'welcome',
  setEnvironment: jest.fn(),
  submitCredentials: jest.fn(),
  selectEnvironment: jest.fn(),
  submitRate: jest.fn(),
  pendingConfig: makeConfig({ setupComplete: false }),
  pendingCredentials: { username: 'user@test.com', password: 'pass' },
  hasBothEnvs: false,
  nonContributorRoles: null,
  isLoading: false,
  error: null,
  ...overrides,
});

function makeRouter() {
  const push = jest.fn();
  const replace = jest.fn();
  mockUseRouter.mockReturnValue({ push, replace } as unknown as ReturnType<typeof useRouter>);
  return { push, replace };
}

/** Every host TextInput (its display value defaults to ''), via RNTL's display-value query. */
const allTextInputs = () => screen.queryAllByDisplayValue(/.*/);

/**
 * Host elements a press can land on. Every Touchable/Pressable renders a host View carrying
 * the responder and click handlers; plain Views and Text don't.
 */
const pressableHosts = () =>
  screen.container.queryAll(
    (el) => typeof el.props.onResponderRelease === 'function' || typeof el.props.onClick === 'function',
  );


beforeEach(() => {
  jest.clearAllMocks();
  mockUseOnboarding.mockReturnValue(makeSetupResult());
  makeRouter();
});

// ============================================================
// FR2: Welcome Screen
// ============================================================

describe('FR2: Welcome Screen', () => {
  it('navigates to /(auth)/credentials on "Get Started" (SC2.4)', async () => {
    const { push } = makeRouter();
    await render(<WelcomeScreen />);
    // Positive control for pressableHosts(), which the verifying screen asserts is empty.
    expect(pressableHosts().length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(screen.getByText('Get Started'));
    expect(push).toHaveBeenCalledWith('/(auth)/credentials');
  });

  it('does not show email/password/token input fields (SC2.5)', async () => {
    await render(<WelcomeScreen />);
    expect(allTextInputs()).toHaveLength(0);
  });
});

// ============================================================
// FR3: Credentials Screen
// ============================================================

describe('FR3: Credentials Screen', () => {
  it('email input has email-address keyboard and autoCapitalize none (SC3.1)', async () => {
    await render(<CredentialsScreen />);
    const email = screen.getByPlaceholderText('you@crossover.com');
    expect(email.props.keyboardType).toBe('email-address');
    expect(email.props.autoCapitalize).toBe('none');
  });

  it('password input has secureTextEntry (SC3.1)', async () => {
    await render(<CredentialsScreen />);
    expect(screen.getByPlaceholderText('••••••••').props.secureTextEntry).toBe(true);
  });

  it('empty fields — Sign In shows validation errors; submitCredentials not called (SC3.2)', async () => {
    const submitCredentials = jest.fn();
    mockUseOnboarding.mockReturnValue(makeSetupResult({ submitCredentials }));
    await render(<CredentialsScreen />);
    // "Sign In" is both the title and the CTA label, so the CTA is found by its testID.
    await fireEvent.press(screen.getByTestId('credentials-submit'));
    expect(submitCredentials).not.toHaveBeenCalled();
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(1);
  });

  it('both fields filled → Sign In calls submitCredentials(email, password) (SC3.3)', async () => {
    const submitCredentials = jest.fn().mockResolvedValue(undefined);
    mockUseOnboarding.mockReturnValue(makeSetupResult({ submitCredentials }));
    await render(<CredentialsScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('you@crossover.com'), 'user@test.com');
    await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'pass123');
    await fireEvent.press(screen.getByTestId('credentials-submit'));
    expect(submitCredentials).toHaveBeenCalledWith('user@test.com', 'pass123');
  });

  it('submit button is disabled and shows spinner while isLoading (SC3.4)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({ isLoading: true }));
    await render(<CredentialsScreen />);
    // When loading, the CTA shows ActivityIndicator instead of button label text
    const button = screen.getByTestId('credentials-submit');
    expect(button).toBeDisabled();
    // The spinner is rendered inside the disabled button (confirms loading state)
    expect(within(button).getByTestId('credentials-submit-spinner')).toBeOnTheScreen();
    // The button's own children contain the spinner, not "Sign In" text
    expect(within(button).queryByText('Sign In')).toBeNull();
  });

  it('shows error string from hook when error is non-null (SC3.5)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({ error: 'Invalid email or password.' }));
    await render(<CredentialsScreen />);
    expect(screen.getByText('Invalid email or password.')).toBeOnTheScreen();
  });

  it('renders sign-in form with email and password fields (SC2.1)', async () => {
    // Environment toggle (Production/QA) is not yet implemented in credentials.tsx.
    // Test verifies the form renders with input fields.
    await render(<CredentialsScreen />);
    expect(allTextInputs().length).toBeGreaterThanOrEqual(2); // email + password
  });

  it('Sign In button is present and pressable (SC2.2)', async () => {
    // Environment selection is not yet implemented; verify core form interaction works.
    await render(<CredentialsScreen />);
    expect(screen.getByTestId('credentials-submit')).toBeEnabled();
    expect(pressableHosts().length).toBeGreaterThan(0);
  });

  it('credentials screen renders without crash (SC2.2 — environment toggle not yet impl)', async () => {
    // The Production/QA environment toggle has not yet been added to credentials.tsx.
    // This test verifies the screen renders correctly without throwing.
    await expect(render(<CredentialsScreen />)).resolves.toBeDefined();
  });
});

// ============================================================
// FR4: Verifying Screen
// ============================================================

describe('FR4: Verifying Screen', () => {
  it('renders ActivityIndicator and "Verifying your account…" (SC4.1)', async () => {
    await render(<VerifyingScreen />);
    expect(screen.getByTestId('verifying-spinner')).toBeOnTheScreen();
    expect(screen.getByText(/Verifying/)).toBeOnTheScreen();
  });

  it('renders no interactive controls (SC4.1)', async () => {
    await render(<VerifyingScreen />);
    expect(pressableHosts()).toHaveLength(0);
    expect(allTextInputs()).toHaveLength(0);
  });

  it('navigates to /(auth)/success when step is "success" (SC4.3)', async () => {
    const { replace } = makeRouter();
    mockUseOnboarding.mockReturnValue(makeSetupResult({ step: 'success' }));
    await render(<VerifyingScreen />);
    expect(replace).toHaveBeenCalledWith('/(auth)/success');
  });

  it('navigates to /(auth)/setup when step is "setup" (SC4.4)', async () => {
    const { replace } = makeRouter();
    mockUseOnboarding.mockReturnValue(makeSetupResult({ step: 'setup' }));
    await render(<VerifyingScreen />);
    expect(replace).toHaveBeenCalledWith('/(auth)/setup');
  });

  it('navigates to /(auth)/credentials when step is "credentials" (SC4.5)', async () => {
    const { replace } = makeRouter();
    mockUseOnboarding.mockReturnValue(makeSetupResult({ step: 'credentials' }));
    await render(<VerifyingScreen />);
    expect(replace).toHaveBeenCalledWith('/(auth)/credentials');
  });

  // 05-onboarding-defense FR8
  it('navigates to /(auth)/not-contributor when step is "not-contributor"', async () => {
    const { replace } = makeRouter();
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER', 'COMPANY_ADMIN'] }),
    );
    await render(<VerifyingScreen />);
    expect(replace).toHaveBeenCalledWith('/(auth)/not-contributor');
  });
});

// ============================================================
// FR6: Setup Screen
// ============================================================

describe('FR6: Setup Screen', () => {
  it('renders numeric input with decimal-pad keyboard (SC6.2)', async () => {
    await render(<SetupScreen />);
    expect(screen.getByPlaceholderText('e.g. 50').props.keyboardType).toBe('decimal-pad');
  });

  it('empty input — Continue shows validation error; submitRate not called (SC6.3)', async () => {
    const submitRate = jest.fn();
    mockUseOnboarding.mockReturnValue(makeSetupResult({ submitRate }));
    await render(<SetupScreen />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(submitRate).not.toHaveBeenCalled();
  });

  it('valid positive number — Continue calls submitRate(rate) (SC6.4)', async () => {
    const submitRate = jest.fn().mockResolvedValue(undefined);
    mockUseOnboarding.mockReturnValue(makeSetupResult({ submitRate }));
    await render(<SetupScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 50'), '75');
    await fireEvent.press(screen.getByText('Continue'));
    expect(submitRate).toHaveBeenCalledWith(75);
  });

  it('submit button is disabled and shows spinner while isLoading (SC6.5)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({ isLoading: true }));
    await render(<SetupScreen />);
    // When loading, the CTA shows ActivityIndicator instead of "Continue" text
    const button = screen.getByTestId('setup-continue');
    expect(button).toBeDisabled();
    expect(within(button).getByTestId('setup-continue-spinner')).toBeOnTheScreen();
    // "Continue" text should NOT appear during loading
    expect(screen.queryByText('Continue')).toBeNull();
  });

  it('displays error string when error is non-null (SC6.6)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({ error: 'Rate lookup failed.' }));
    await render(<SetupScreen />);
    expect(screen.getByText('Rate lookup failed.')).toBeOnTheScreen();
  });
});

// ============================================================
// FR7: Success Screen
// ============================================================

describe('FR7: Success Screen', () => {
  it('displays fullName as primary heading (SC7.1)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ fullName: 'Jane Doe', setupComplete: false }),
    }));
    await render(<SuccessScreen />);
    expect(screen.getByText('Jane Doe')).toBeOnTheScreen();
  });

  it('shows "Contributor" when isManager is false (SC7.2)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ isManager: false, setupComplete: false }),
    }));
    await render(<SuccessScreen />);
    expect(screen.getByText('Contributor')).toBeOnTheScreen();
    expect(screen.queryByText('Manager')).toBeNull();
  });

  it('shows "Manager" when isManager is true (SC7.2)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ isManager: true, setupComplete: false }),
    }));
    await render(<SuccessScreen />);
    expect(screen.getByText('Manager')).toBeOnTheScreen();
    expect(screen.queryByText('Contributor')).toBeNull();
  });

  it('displays hourly rate formatted as $N / hr (SC7.3)', async () => {
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ hourlyRate: 75, setupComplete: false }),
    }));
    await render(<SuccessScreen />);
    expect(screen.getByText('$75 / hr')).toBeOnTheScreen();
  });

  it('calls saveCredentials and saveConfig({ setupComplete: true }) on "Go to Dashboard" (SC7.4)', async () => {
    mockSaveCredentials.mockResolvedValue();
    mockSaveConfig.mockResolvedValue();
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ setupComplete: false }),
      pendingCredentials: { username: 'user@test.com', password: 'pass' },
    }));
    await render(<SuccessScreen />);
    await fireEvent.press(screen.getByText('Go to Dashboard'));
    await waitFor(() => {
      expect(mockSaveCredentials).toHaveBeenCalledWith('user@test.com', 'pass');
      expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ setupComplete: true }));
    });
  });

  it('Dashboard button exists and is not disabled initially (SC7.7)', async () => {
    await render(<SuccessScreen />);
    // getByText guards existence; toBeEnabled checks the label and every ancestor (the touchable).
    expect(screen.getByText('Go to Dashboard')).toBeEnabled();
  });

  it('shows error message when storage write fails (SC7.5)', async () => {
    mockSaveCredentials.mockRejectedValue(new Error('SecureStore failed'));
    mockSaveConfig.mockResolvedValue();
    mockUseOnboarding.mockReturnValue(makeSetupResult({
      pendingConfig: makeConfig({ setupComplete: false }),
      pendingCredentials: { username: 'user@test.com', password: 'pass' },
    }));
    await render(<SuccessScreen />);
    await fireEvent.press(screen.getByText('Go to Dashboard'));
    // Must show the actual error message from the failed SecureStore write
    expect(await screen.findByText(/SecureStore failed/)).toBeOnTheScreen();
  });
});

// ============================================================
// 05-onboarding-defense FR7: Not-Contributor Screen
// ============================================================

const mockClearAll = clearAll as jest.MockedFunction<typeof clearAll>;
const mockInvalidateAuthToken = invalidateAuthToken as jest.MockedFunction<typeof invalidateAuthToken>;

describe('05-onboarding-defense FR7: Not-Contributor Screen', () => {
  beforeEach(() => {
    mockClearAll.mockReset();
    mockClearAll.mockResolvedValue(undefined);
    mockInvalidateAuthToken.mockReset();
  });

  it('renders the detected roles when nonContributorRoles is populated', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({
        step: 'not-contributor',
        nonContributorRoles: ['MANAGER', 'COMPANY_ADMIN'],
      }),
    );
    await render(<NotContributorScreen />);
    // The roles render in their own (emphasised) Text, joined with ", ".
    expect(screen.getByText('MANAGER, COMPANY_ADMIN')).toBeOnTheScreen();
  });

  it('renders "unknown" placeholder when nonContributorRoles is null', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: null }),
    );
    await render(<NotContributorScreen />);
    expect(screen.getByText('unknown')).toBeOnTheScreen();
  });

  it('renders "unknown" placeholder when nonContributorRoles is []', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: [] }),
    );
    await render(<NotContributorScreen />);
    expect(screen.getByText('unknown')).toBeOnTheScreen();
  });

  it('renders a Sign Out button', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER'] }),
    );
    await render(<NotContributorScreen />);
    expect(screen.getByText(/sign out/i)).toBeEnabled();
  });

  it('pressing Sign Out calls clearAll()', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER'] }),
    );
    await render(<NotContributorScreen />);
    await fireEvent.press(screen.getByText(/sign out/i));
    await waitFor(() => expect(mockClearAll).toHaveBeenCalled());
  });

  it('pressing Sign Out calls invalidateAuthToken()', async () => {
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER'] }),
    );
    await render(<NotContributorScreen />);
    await fireEvent.press(screen.getByText(/sign out/i));
    await waitFor(() => expect(mockInvalidateAuthToken).toHaveBeenCalled());
  });

  it('pressing Sign Out navigates to /(auth)/welcome', async () => {
    const { replace } = makeRouter();
    mockUseOnboarding.mockReturnValue(
      makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER'] }),
    );
    await render(<NotContributorScreen />);
    await fireEvent.press(screen.getByText(/sign out/i));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/(auth)/welcome'));
  });

  // Final review 2026-10-21: expo-secure-store 58 can reject the credential delete, and a
  // clearAll rejection used to skip the redirect, leaving the user on this screen.
  it('pressing Sign Out still invalidates the token and navigates to welcome when clearAll rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockClearAll.mockRejectedValueOnce(new Error('KeyChainException: -25308'));
      const { replace } = makeRouter();
      mockUseOnboarding.mockReturnValue(
        makeSetupResult({ step: 'not-contributor', nonContributorRoles: ['MANAGER'] }),
      );
      await render(<NotContributorScreen />);
      await fireEvent.press(screen.getByText(/sign out/i));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/(auth)/welcome'));
      expect(mockInvalidateAuthToken).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
