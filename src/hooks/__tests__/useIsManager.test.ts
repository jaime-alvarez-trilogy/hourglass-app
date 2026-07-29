// Tests: useIsManager hook — FR1 (04-team-view-content)
// Spec: features/app/team-org-view/specs/04-team-view-content/spec.md
//
// FR1: useIsManager() centralizes the manager-detection expression currently
// duplicated in overview.tsx, approvals.tsx, and index.tsx.
//   SC1.1 — returns true when config.isManager === true
//   SC1.2 — returns true when config.devManagerView === true
//   SC1.3 — returns false for all other config states, including absent config
//
// Strategy: static source analysis for the file contract, plus real-hook
// execution: useConfig is jest-mocked and the actual useIsManager() is called
// inside a probe component rendered with react-test-renderer. renderHook is
// not used per project convention (jest-expo/node null-dispatcher issue), but
// plain component rendering works fine (see approvals.test.tsx/index.test.tsx),
// so these tests exercise the real hook implementation rather than a copy of
// its boolean expression.

import * as path from 'path';
import * as fs from 'fs';
import * as React from 'react';
import { create, act } from 'react-test-renderer';

jest.mock('../useConfig');

import { useConfig } from '../useConfig';
import { useIsManager } from '../useIsManager';

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useIsManager.ts');

// ─── Static analysis: file contract ──────────────────────────────────────────

describe('useIsManager — file contract (FR1)', () => {
  it('hook file exists at src/hooks/useIsManager.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('imports useConfig', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useConfig/);
  });

  it('exports a function named useIsManager', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/export\s+function\s+useIsManager/);
  });

  it('declares an explicit boolean return type', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useIsManager\s*\(\s*\)\s*:\s*boolean/);
  });

  it('has a JSDoc comment preceding the exported function', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    const jsdocBeforeFunc = /\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useIsManager/;
    expect(src).toMatch(jsdocBeforeFunc);
  });

  it('body contains the exact manager-detection expression (isManager || devManagerView)', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(
      /config\?\.isManager\s*===\s*true\s*\|\|\s*config\?\.devManagerView\s*===\s*true/,
    );
  });
});

// ─── Real-hook execution (SC1.1–SC1.3) ────────────────────────────────────────

function Probe(): React.ReactElement {
  const value = useIsManager();
  return React.createElement('probe' as any, { value });
}

/** Renders the real useIsManager() against a mocked useConfig() return. */
function runIsManager(config: unknown): boolean {
  (useConfig as jest.Mock).mockReturnValue({ config, isLoading: false });
  let tree: any;
  act(() => {
    tree = create(React.createElement(Probe));
  });
  const value = tree.root.findByType('probe' as any).props.value;
  tree.unmount();
  return value;
}

describe('useIsManager — real hook behavior (SC1.1–SC1.3)', () => {
  it('SC1.1 — returns true when config.isManager === true', () => {
    expect(runIsManager({ isManager: true })).toBe(true);
  });

  it('SC1.2 — returns true when config.devManagerView === true', () => {
    expect(runIsManager({ devManagerView: true })).toBe(true);
  });

  it('returns true when both isManager and devManagerView are true', () => {
    expect(runIsManager({ isManager: true, devManagerView: true })).toBe(true);
  });

  it('SC1.3 — returns false when isManager === false and devManagerView is absent', () => {
    expect(runIsManager({ isManager: false })).toBe(false);
  });

  it('SC1.3 — returns false when both isManager and devManagerView are false', () => {
    expect(runIsManager({ isManager: false, devManagerView: false })).toBe(false);
  });

  it('SC1.3 — returns false for an empty config object', () => {
    expect(runIsManager({})).toBe(false);
  });

  it("SC1.3 — returns false when config is null (matches useConfig()'s absent-config shape)", () => {
    expect(runIsManager(null)).toBe(false);
  });

  it('SC1.3 — returns false when config is undefined (config still loading)', () => {
    expect(runIsManager(undefined)).toBe(false);
  });

  it('SC1.3 — returns false when isManager is truthy but not strictly true', () => {
    expect(runIsManager({ isManager: 'true' })).toBe(false);
  });

  it('SC1.3 — returns false when devManagerView is truthy but not strictly true', () => {
    expect(runIsManager({ devManagerView: 1 })).toBe(false);
  });
});
