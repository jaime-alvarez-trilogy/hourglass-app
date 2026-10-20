// Spec store-compliance/02-in-app-legal-links FR1 + FR2: legal URL constants
// and the pure formatBuildInfo formatter. No mocks — the module has no imports.

import {
  PRIVACY_POLICY_URL,
  SUPPORT_URL,
  formatBuildInfo,
  type BuildInfoInput,
} from '@/src/lib/legalLinks';

const PAGES_BASE = 'https://jaime-alvarez-trilogy.github.io/hourglass-app/';
const UPDATE_ID = '0f3c9a12-3456-4abc-8def-1234567890ab';

const FULL_INPUT: BuildInfoInput = {
  version: '1.1.0',
  buildNumber: '18',
  updateId: UPDATE_ID,
  isEmbeddedLaunch: false,
};

describe('FR1: legal URL constants', () => {
  it('FR1.1 — PRIVACY_POLICY_URL is the spec 01 privacy page', () => {
    expect(PRIVACY_POLICY_URL).toBe(
      'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html',
    );
  });

  it('FR1.2 — SUPPORT_URL is the spec 01 support page', () => {
    expect(SUPPORT_URL).toBe('https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html');
  });

  it.each([
    ['PRIVACY_POLICY_URL', () => PRIVACY_POLICY_URL],
    ['SUPPORT_URL', () => SUPPORT_URL],
  ])('FR1.3 — %s is under the hourglass-app Pages site and has no whitespace', (_name, read) => {
    const url = read();
    expect(url.startsWith(PAGES_BASE)).toBe(true);
    expect(url).not.toMatch(/\s/);
  });
});

describe('FR2: formatBuildInfo', () => {
  it('FR2.1 — full input yields the version line with build number and an 8-char update prefix', () => {
    expect(formatBuildInfo(FULL_INPUT)).toEqual({
      versionLine: 'Version 1.1.0 (18)',
      updateLine: 'Update: 0f3c9a12',
    });
  });

  it('FR2.2 — isEmbeddedLaunch wins over a non-null updateId', () => {
    const result = formatBuildInfo({ ...FULL_INPUT, isEmbeddedLaunch: true });
    expect(result.updateLine).toBe('Update: embedded');
    expect(result.versionLine).toBe('Version 1.1.0 (18)');
  });

  it.each([null, undefined, ''])(
    'FR2.3 — updateId %p with isEmbeddedLaunch false reads "Update: embedded"',
    (updateId) => {
      expect(formatBuildInfo({ ...FULL_INPUT, updateId }).updateLine).toBe('Update: embedded');
    },
  );

  it('FR2.4 — an updateId shorter than 8 characters is shown whole', () => {
    expect(formatBuildInfo({ ...FULL_INPUT, updateId: 'abc' }).updateLine).toBe('Update: abc');
  });

  it.each([undefined, null, ''])(
    'FR2.5 — version %p with buildNumber "18" reads "Version unknown (18)"',
    (version) => {
      expect(formatBuildInfo({ ...FULL_INPUT, version }).versionLine).toBe('Version unknown (18)');
    },
  );

  it('FR2.6 — no version and no build number reads "Version unknown"', () => {
    expect(
      formatBuildInfo({ ...FULL_INPUT, version: undefined, buildNumber: undefined }).versionLine,
    ).toBe('Version unknown');
  });

  it.each([undefined, null, ''])(
    'FR2.7 — buildNumber %p with version "1.1.0" reads "Version 1.1.0" with no parentheses',
    (buildNumber) => {
      expect(formatBuildInfo({ ...FULL_INPUT, buildNumber }).versionLine).toBe('Version 1.1.0');
    },
  );

  it('FR2.8 — a frozen input is not mutated and repeated calls return equal results', () => {
    const input = Object.freeze({ ...FULL_INPUT });
    let first: ReturnType<typeof formatBuildInfo> | undefined;
    let second: ReturnType<typeof formatBuildInfo> | undefined;
    expect(() => {
      first = formatBuildInfo(input);
      second = formatBuildInfo(input);
    }).not.toThrow();
    expect(first).toEqual({ versionLine: 'Version 1.1.0 (18)', updateLine: 'Update: 0f3c9a12' });
    expect(second).toEqual(first);
    expect(input).toEqual(FULL_INPUT);
  });
});
