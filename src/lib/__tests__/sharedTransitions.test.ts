// Tests: 07-shared-transitions
// FR1: setTag utility — feature-flag-aware sharedTransitionTag prop factory
// FR5: app.json contains ENABLE_SHARED_ELEMENT_TRANSITIONS: true

// Strategy:
// - FR1: use jest.resetModules() + jest.doMock (non-hoisted) + __esModule:true + inline require.
//         __esModule:true is required so Babel's interop correctly resolves the default import.
// - FR5: read app.json directly via fs and assert flag presence.

import * as path from 'path';
import * as fs from 'fs';

// ─── File paths ───────────────────────────────────────────────────────────────

const HOURGLASSWS_ROOT = path.resolve(__dirname, '../../..');
const APP_JSON_FILE = path.join(HOURGLASSWS_ROOT, 'app.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockConstantsFlag(flagValue: boolean | undefined | null) {
  jest.resetModules();
  if (flagValue === undefined) {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: undefined },
    }));
  } else if (flagValue === null) {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: null } },
    }));
  } else {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: { ENABLE_SHARED_ELEMENT_TRANSITIONS: flagValue },
        },
      },
    }));
  }
}

function mockConstantsMissingKey() {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { extra: {} } },
  }));
}

// ─── FR1: setTag utility ──────────────────────────────────────────────────────

describe('FR1: setTag — feature-flag-aware sharedTransitionTag factory', () => {
  it('FR1.1 — returns { sharedTransitionTag: tag } when flag is true', () => {
    mockConstantsFlag(true);
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-earnings-card')).toEqual({ sharedTransitionTag: 'home-earnings-card' });
  });

  it('FR1.2 — returns {} when flag is false', () => {
    mockConstantsFlag(false);
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-earnings-card')).toEqual({});
  });

  it('FR1.3 — returns {} when Constants.expoConfig is undefined', () => {
    mockConstantsFlag(undefined);
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-earnings-card')).toEqual({});
  });

  it('FR1.4 — returns {} when extra key is absent from expoConfig', () => {
    mockConstantsMissingKey();
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-earnings-card')).toEqual({});
  });

  it('FR1.5 — passes tag string through unchanged when flag is true', () => {
    mockConstantsFlag(true);
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-ai-card')).toEqual({ sharedTransitionTag: 'home-ai-card' });
    expect(setTag('some-tag-with-special_chars')).toEqual({ sharedTransitionTag: 'some-tag-with-special_chars' });
  });

  it('FR1.6 — returns {} when Constants.expoConfig.extra is null', () => {
    mockConstantsFlag(null);
    const { setTag } = require('@/src/lib/sharedTransitions');
    expect(setTag('home-earnings-card')).toEqual({});
  });
});

// ─── FR5: app.json feature flags ─────────────────────────────────────────────

describe('FR5: app.json — ENABLE_SHARED_ELEMENT_TRANSITIONS flag', () => {
  let appJson: Record<string, unknown>;

  beforeAll(() => {
    const raw = fs.readFileSync(APP_JSON_FILE, 'utf-8');
    appJson = JSON.parse(raw);
  });

  it('FR5.1 — app.json contains expo.extra.ENABLE_SHARED_ELEMENT_TRANSITIONS === true', () => {
    const extra = (appJson as { expo?: { extra?: Record<string, unknown> } }).expo?.extra ?? {};
    expect(extra['ENABLE_SHARED_ELEMENT_TRANSITIONS']).toBe(true);
  });

  it('FR5.2 — app.json retains expo.extra.ENABLE_NATIVE_TABS === true (from spec 06)', () => {
    const extra = (appJson as { expo?: { extra?: Record<string, unknown> } }).expo?.extra ?? {};
    expect(extra['ENABLE_NATIVE_TABS']).toBe(true);
  });
});
